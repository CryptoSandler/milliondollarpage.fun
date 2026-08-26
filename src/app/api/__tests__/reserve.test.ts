import { describe, expect, it, vi } from "vitest";
import { execute } from "../../../lib/db";
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
    const response = await POST(request({ rect: { x: 0, y: 0, w: 20, h: 20 }, buyerPubkey: BUYER }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.pixels).toBe(400);
    expect(body.totalBaseUnits).toBe(400_000_000);
    expect(body.paymentBaseUnits).toBeGreaterThan(body.totalBaseUnits);
    expect(typeof body.id).toBe("string");
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("is never cached", async () => {
    const response = await POST(request({ rect: { x: 0, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 409, not 500, when the pixels were just taken", async () => {
    await POST(request({ rect: { x: 0, y: 0, w: 20, h: 20 }, buyerPubkey: BUYER }));
    const second = await POST(
      request({ rect: { x: 10, y: 10, w: 20, h: 20 }, buyerPubkey: BUYER }, "203.0.113.8"),
    );
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(typeof body.message).toBe("string");
  });

  it("carries availableAt and names a time when a live hold blocks the rectangle", async () => {
    const first = await POST(request({ rect: { x: 0, y: 0, w: 20, h: 20 }, buyerPubkey: BUYER }));
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const second = await POST(
      request({ rect: { x: 10, y: 10, w: 20, h: 20 }, buyerPubkey: BUYER }, "203.0.113.9"),
    );
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.availableAt).toBe(firstBody.expiresAt);
    // Names a clock time (e.g. "2:34 PM"), not just a vague refusal.
    expect(body.message).toMatch(/\d{1,2}:\d{2}/);
  });

  it("answers 409 with availableAt: null and a permanence message when a sold block blocks it", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc)
       VALUES (0, 0, 20, 20, 'paid', 1000000, 400000000)`,
    );
    const response = await POST(
      request({ rect: { x: 10, y: 10, w: 20, h: 20 }, buyerPubkey: BUYER }, "203.0.113.10"),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.availableAt).toBeNull();
    expect(body.message.toLowerCase()).toMatch(/sold|permanent/);
  });

  it("answers 400 for a rectangle off the grid", async () => {
    const response = await POST(request({ rect: { x: 5, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }));
    expect(response.status).toBe(400);
  });

  it("answers 400 for a malformed body", async () => {
    for (const body of [{}, { rect: {} }, { rect: { x: 0, y: 0, w: 10, h: 10 } }, { buyerPubkey: BUYER }]) {
      const response = await POST(request(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("answers 429 with a retry-after once the caller's ceiling is reached", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      const ok = await POST(request({ rect: { x: i * 30, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }));
      expect(ok.status).toBe(201);
    }
    const refused = await POST(request({ rect: { x: 500, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).not.toBeNull();
  });

  it("counts callers separately", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      await POST(request({ rect: { x: i * 30, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }, "198.51.100.1"));
    }
    const other = await POST(
      request({ rect: { x: 500, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }, "198.51.100.2"),
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
      body: JSON.stringify({ rect: { x: 0, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }),
    });
    const response = await POST(anonymous);
    expect(response.status).toBe(400);
  });
});
