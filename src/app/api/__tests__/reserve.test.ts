import { describe, expect, it, vi } from "vitest";
import { execute, query } from "../../../lib/db";
import { hashIp } from "../../../lib/callers/client-ip";
import { RESERVATION_LIMITS } from "../../../lib/callers/limits";
import { POST } from "../reserve/route";

// This file drives up to `liveHoldsPerCaller` sequential POSTs per test, and
// every POST costs several round trips to the remote Neon test branch. The
// 5s default is tuned for a single query, not that loop, so it's raised only
// here rather than repo-wide.
vi.setConfig({ testTimeout: 20_000 });

const BUYER = "BuyerPubkey1111111111111111111111111111111";

function request(body: unknown, ip = "203.0.113.7"): Request {
  return new Request("http://localhost/api/reserve", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reserve", () => {
  it("holds a free rectangle and returns its price and expiry", async () => {
    const response = await POST(request({ rect: { x: 0, y: 0, w: 20, h: 20 }, buyerPubkey: BUYER, chain: "solana" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.pixels).toBe(400);
    expect(body.totalBaseUnits).toBe(400_000_000);
    expect(body.paymentBaseUnits).toBeGreaterThan(body.totalBaseUnits);
    expect(typeof body.id).toBe("string");
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("is never cached", async () => {
    const response = await POST(request({ rect: { x: 0, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER, chain: "solana" }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 409, not 500, when the pixels were just taken", async () => {
    await POST(request({ rect: { x: 0, y: 0, w: 20, h: 20 }, buyerPubkey: BUYER, chain: "solana" }));
    const second = await POST(
      request({ rect: { x: 10, y: 10, w: 20, h: 20 }, buyerPubkey: BUYER, chain: "solana" }, "203.0.113.8"),
    );
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(typeof body.message).toBe("string");
  });

  it("carries availableAt and names a time when a live hold blocks the rectangle", async () => {
    const first = await POST(request({ rect: { x: 0, y: 0, w: 20, h: 20 }, buyerPubkey: BUYER, chain: "solana" }));
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    // A DIFFERENT buyer, deliberately: this is the somebody-else's-hold copy,
    // where the useful fact is the clock. A buyer colliding with their own
    // hold gets a different sentence and its own test below.
    const second = await POST(
      request(
        { rect: { x: 10, y: 10, w: 20, h: 20 }, buyerPubkey: "SomeoneElse1111111111111111111111111111111", chain: "solana" },
        "203.0.113.9",
      ),
    );
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.availableAt).toBe(firstBody.expiresAt);
    // Names a clock time (e.g. "2:34 PM"), not just a vague refusal.
    expect(body.message).toMatch(/\d{1,2}:\d{2}/);
  });

  it("answers 409 with availableAt: null and a permanence message when a sold block blocks it", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, approved_at)
       VALUES (0, 0, 20, 20, 'paid', 1000000, 400000000, now())`,
    );
    const response = await POST(
      request({ rect: { x: 10, y: 10, w: 20, h: 20 }, buyerPubkey: BUYER, chain: "solana" }, "203.0.113.10"),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.availableAt).toBeNull();
    expect(body.message.toLowerCase()).toMatch(/sold|permanent/);
  });

  it("resumes the caller's own hold on the same rectangle with a 201, not a 409", async () => {
    const rect = { x: 300, y: 300, w: 20, h: 20 };
    const first = await POST(request({ rect, buyerPubkey: BUYER, chain: "solana" }));
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const again = await POST(request({ rect, buyerPubkey: BUYER, chain: "solana" }));
    expect(again.status, "your own hold must not refuse you").toBe(201);
    const againBody = await again.json();
    expect(againBody.id).toBe(firstBody.id);
    expect(againBody.expiresAt).toBe(firstBody.expiresAt);
  });

  it("carries yourOrderIds so the client can offer to release your own blocking hold", async () => {
    const first = await POST(request({ rect: { x: 100, y: 100, w: 20, h: 20 }, buyerPubkey: BUYER, chain: "solana" }));
    const firstBody = await first.json();

    const overlapping = await POST(request({ rect: { x: 110, y: 110, w: 20, h: 20 }, buyerPubkey: BUYER, chain: "solana" }));
    expect(overlapping.status).toBe(409);
    const body = await overlapping.json();
    expect(body.yourOrderIds).toEqual([firstBody.id]);
    expect(body.message.toLowerCase()).toContain("yourself");
  });

  it("leaves yourOrderIds empty, and says nothing about anyone else, when the hold is not yours", async () => {
    await POST(request({ rect: { x: 0, y: 0, w: 20, h: 20 }, buyerPubkey: BUYER, chain: "solana" }));
    const response = await POST(
      request({ rect: { x: 10, y: 10, w: 20, h: 20 }, buyerPubkey: "SomeoneElse1111111111111111111111111111111", chain: "solana" }, "203.0.113.11"),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.yourOrderIds).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("BuyerPubkey");
  });

  it("answers 400 for a rectangle the wall cannot hold", async () => {
    // Off the right edge, off the bottom one, and one made of half pixels —
    // which Postgres would round into its integer columns rather than refuse,
    // so the route has to.
    for (const rect of [
      { x: 1240, y: 0, w: 20, h: 10 },
      { x: 0, y: 790, w: 10, h: 20 },
      { x: 137.5, y: 0, w: 10, h: 10 },
      { x: 0, y: 0, w: 0, h: 10 },
    ]) {
      const response = await POST(request({ rect, buyerPubkey: BUYER, chain: "solana" }));
      expect(response.status, JSON.stringify(rect)).toBe(400);
    }
  });

  it("answers 201 for a single pixel at an odd coordinate, which used to be a 400", async () => {
    const response = await POST(request({ rect: { x: 137, y: 41, w: 1, h: 1 }, buyerPubkey: BUYER, chain: "solana" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.rect).toEqual({ x: 137, y: 41, w: 1, h: 1 });
    expect(body.pixels).toBe(1);
  });

  it("answers 400 for a malformed body", async () => {
    for (const body of [{}, { rect: {} }, { rect: { x: 0, y: 0, w: 10, h: 10 } }, { buyerPubkey: BUYER }]) {
      const response = await POST(request(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  /**
   * A hold is where ownership begins, so the chain is required here and has no
   * default.
   *
   * Defaulting to Solana would be the cheap move and the wrong one: the row a
   * reservation writes is the row a signature is later checked against, and a
   * hold that guessed the chain would be a rectangle its own buyer could not
   * prove they owned — with nothing in the failure to say why.
   */
  it("answers 400 when the body names no chain, or names one that does not exist", async () => {
    const rect = { x: 300, y: 300, w: 10, h: 10 };
    for (const body of [
      { rect, buyerPubkey: BUYER },
      { rect, buyerPubkey: BUYER, chain: "" },
      { rect, buyerPubkey: BUYER, chain: "ethereum" },
      { rect, buyerPubkey: BUYER, chain: "Solana" },
      { rect, buyerPubkey: BUYER, chain: 4663 },
    ]) {
      const response = await POST(request(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("stores the chain it was given beside the address", async () => {
    const response = await POST(
      request({ rect: { x: 320, y: 320, w: 10, h: 10 }, buyerPubkey: BUYER, chain: "solana" }),
    );
    expect(response.status).toBe(201);
    const { id } = await response.json();
    const rows = await query<{ owner_chain: string; owner_address: string }>(
      "SELECT owner_chain, owner_address FROM blocks WHERE id = $1",
      [id],
    );
    expect(rows[0]).toEqual({ owner_chain: "solana", owner_address: BUYER });
  });

  it("answers 429 with a retry-after once the caller's ceiling is reached", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      const ok = await POST(request({ rect: { x: i * 30, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER, chain: "solana" }));
      expect(ok.status).toBe(201);
    }
    const refused = await POST(request({ rect: { x: 500, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER, chain: "solana" }));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).not.toBeNull();
  });

  it("counts callers separately", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      await POST(request({ rect: { x: i * 30, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER, chain: "solana" }, "198.51.100.1"));
    }
    const other = await POST(
      request({ rect: { x: 500, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER, chain: "solana" }, "198.51.100.2"),
    );
    expect(other.status).toBe(201);
  });

  it("refuses a caller with no trustworthy address", async () => {
    // The suite always deletes ALLOW_UNTRUSTED_CLIENT_IP, so with no
    // x-forwarded-for header `identify` deterministically fails closed with
    // a 400 — asserted exactly, not as one of several acceptable outcomes.
    const anonymous = new Request("http://localhost/api/reserve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rect: { x: 0, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER, chain: "solana" }),
    });
    const response = await POST(anonymous);
    expect(response.status).toBe(400);
  });
});

/**
 * The ceiling on held area, driven through the route a script would drive.
 *
 * What is asserted is what Postgres says the caller ended up holding —
 * `SUM(w * h)` over their live rows — not a total added up in the test from
 * the rectangles it asked for. The sum is the thing the limit itself reads, so
 * a guard that recomputed it from the requests would pass in exactly the case
 * where the limit was counting the wrong rows.
 */
describe("POST /api/reserve, and how much one caller can take off the board", () => {
  const GRIEFER = "198.51.100.77";

  async function heldByGriefer(): Promise<number> {
    const rows = await query<{ pixels: string }>(
      `SELECT COALESCE(SUM(w * h), 0)::text AS pixels
         FROM blocks
        WHERE status = 'reserved' AND expires_at > now() AND ip_hash = $1`,
      // The same hash the route stores, so this reads the rows the limit
      // counted rather than every row on the board.
      [hashIp(GRIEFER)],
    );
    return Number(rows[0].pixels);
  }

  it("answers 429, not 201, to a hold over the whole wall", async () => {
    // This request used to succeed. One caller, one hold, a million pixels and
    // a million dollars of inventory off sale for nothing.
    const response = await POST(
      request({ rect: { x: 0, y: 0, w: 1250, h: 800 }, buyerPubkey: BUYER, chain: "solana" }, GRIEFER),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).not.toBeNull();

    const rows = await query("SELECT id FROM blocks");
    expect(rows, "and nothing was written").toEqual([]);
  });

  it("stops a caller assembling the same area out of several smaller holds", async () => {
    // Three rectangles, each well within the row ceiling and each fine on its
    // own; together they ask for more than one visitor may hold.
    const statuses: number[] = [];
    for (const x of [0, 200, 400]) {
      const response = await POST(
        request({ rect: { x, y: 0, w: 70, h: 70 }, buyerPubkey: BUYER, chain: "solana" }, GRIEFER),
      );
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 2), "the first two are ordinary purchases").toEqual([201, 201]);
    expect(statuses[2], "the third crosses the ceiling").toBe(429);
    expect(await heldByGriefer()).toBeLessThanOrEqual(RESERVATION_LIMITS.heldPixelsPerCaller);
  });

  it("lets a 100 by 100 purchase be held in one request, because that is a real one", async () => {
    const response = await POST(
      request({ rect: { x: 100, y: 100, w: 100, h: 100 }, buyerPubkey: BUYER, chain: "solana" }, GRIEFER),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.pixels).toBe(10_000);
    expect(body.totalBaseUnits).toBe(10_000_000_000);
    expect(await heldByGriefer()).toBe(RESERVATION_LIMITS.heldPixelsPerCaller);
  });
});
