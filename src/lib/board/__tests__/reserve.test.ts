import { describe, expect, it } from "vitest";
import { execute, query } from "../../db";
import { formatUsdc } from "../pricing";
import { RectangleInvalid, RectangleTaken, reserveRect } from "../reserve";

const BUYER = "BuyerPubkey1111111111111111111111111111111";
const CALLER = "c".repeat(64);

async function seedBlock(x: number, y: number, status: string, minutesLeft: number | null) {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at)
     VALUES ($1, $2, 20, 20, $3, 1000000, 400000000,
             CASE WHEN $4::text IS NULL THEN NULL ELSE now() + ($4 || ' minutes')::interval END)`,
    [x, y, status, minutesLeft === null ? null : String(minutesLeft)],
  );
}

describe("reserveRect", () => {
  it("holds a free rectangle and prices it from settings", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER);
    expect(held.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    expect(held.pixels).toBe(400);
    expect(held.pricePerPixelBaseUnits).toBe(1_000_000);
    expect(held.totalBaseUnits).toBe(400_000_000);
    expect(Date.parse(held.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("gives the hold a payment amount that is not round", async () => {
    // The fraction is how an incoming transfer is attributed to an order, so a
    // round amount is exactly the one that cannot be attributed.
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, { chain: "solana", address: BUYER }, CALLER);
    // A FRESH hold carries it: this caller created the row in this request.
    expect(held.paymentBaseUnits).toBeDefined();
    const payment = held.paymentBaseUnits!;
    expect(payment).toBeGreaterThan(held.totalBaseUnits);
    expect(payment - held.totalBaseUnits).toBeGreaterThanOrEqual(1);
    expect(payment - held.totalBaseUnits).toBeLessThanOrEqual(999_999);
  });

  it("snapshots the price so a settings change cannot move a live hold", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, { chain: "solana", address: BUYER }, CALLER);
    await execute("UPDATE settings SET value = '5000000' WHERE key = 'price_per_pixel_usdc'");
    try {
      const rows = await query<{ price_per_pixel_usdc: string }>(
        "SELECT price_per_pixel_usdc FROM blocks WHERE id = $1",
        [held.id],
      );
      expect(Number(rows[0].price_per_pixel_usdc)).toBe(1_000_000);
    } finally {
      await execute("UPDATE settings SET value = '1000000' WHERE key = 'price_per_pixel_usdc'");
    }
  });

  it("binds the hold to the buyer's pubkey and the caller's hash", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, { chain: "solana", address: BUYER }, CALLER);
    const rows = await query<{ owner_address: string; ip_hash: string }>(
      "SELECT owner_address, ip_hash FROM blocks WHERE id = $1",
      [held.id],
    );
    expect(rows[0].owner_address).toBe(BUYER);
    expect(rows[0].ip_hash).toBe(CALLER);
  });

  it("refuses a rectangle overlapping a minted block", async () => {
    await seedBlock(0, 0, "minted", null);
    await expect(reserveRect({ x: 10, y: 10, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER)).rejects.toBeInstanceOf(
      RectangleTaken,
    );
  });

  it("refuses a rectangle overlapping a live hold", async () => {
    await seedBlock(0, 0, "reserved", 30);
    await expect(reserveRect({ x: 10, y: 10, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER)).rejects.toBeInstanceOf(
      RectangleTaken,
    );
  });

  it("refuses a rectangle overlapping a paid order, which never expires", async () => {
    await seedBlock(0, 0, "paid", null);
    await expect(reserveRect({ x: 10, y: 10, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER)).rejects.toBeInstanceOf(
      RectangleTaken,
    );
  });

  it("ALLOWS a rectangle over an EXPIRED hold, sweeping it in the same transaction", async () => {
    // The whole reason the sweep lives inside the insert's transaction.
    await seedBlock(0, 0, "reserved", -1);
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER);
    expect(held.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    const rows = await query("SELECT id FROM blocks WHERE status = 'reserved'");
    expect(rows, "the expired hold should be gone, and only the new one left").toHaveLength(1);
  });

  it("allows a rectangle flush against a sold block, because edges do not overlap", async () => {
    await seedBlock(0, 0, "minted", null);
    const held = await reserveRect({ x: 20, y: 0, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER);
    expect(held.rect.x).toBe(20);
  });

  it("refuses a rectangle over a taken-down block, because a takedown is not a resale", async () => {
    await seedBlock(0, 0, "paid", null);
    await execute("UPDATE blocks SET hidden_at = now(), takedown_reason = 'a report'");
    await expect(reserveRect({ x: 0, y: 0, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER)).rejects.toBeInstanceOf(
      RectangleTaken,
    );
  });

  it("refuses a malformed rectangle before touching the database", async () => {
    // No area.
    await expect(reserveRect({ x: 0, y: 0, w: 0, h: 10 }, { chain: "solana", address: BUYER }, CALLER)).rejects.toBeInstanceOf(
      RectangleInvalid,
    );
    // Off the right edge, and off the bottom one.
    await expect(
      reserveRect({ x: 1240, y: 0, w: 20, h: 10 }, { chain: "solana", address: BUYER }, CALLER),
    ).rejects.toBeInstanceOf(RectangleInvalid);
    await expect(
      reserveRect({ x: 0, y: 790, w: 10, h: 20 }, { chain: "solana", address: BUYER }, CALLER),
    ).rejects.toBeInstanceOf(RectangleInvalid);
    // Not made of whole pixels. Postgres would have ROUNDED this into its
    // integer columns and sold a rectangle nobody asked for.
    await expect(
      reserveRect({ x: 137.5, y: 0, w: 10, h: 10 }, { chain: "solana", address: BUYER }, CALLER),
    ).rejects.toBeInstanceOf(RectangleInvalid);
  });

  it("holds a rectangle that lines up with nothing, because that is the model now", async () => {
    const held = await reserveRect({ x: 137, y: 41, w: 23, h: 7 }, { chain: "solana", address: BUYER }, CALLER);
    expect(held.rect).toEqual({ x: 137, y: 41, w: 23, h: 7 });
    expect(held.pixels).toBe(161);
  });

  it("lets exactly one of two concurrent overlapping reservations win", async () => {
    // The constraint, not the application, is what makes this true.
    const results = await Promise.allSettled([
      reserveRect({ x: 100, y: 100, w: 50, h: 50 }, { chain: "solana", address: BUYER }, CALLER),
      reserveRect({ x: 120, y: 120, w: 50, h: 50 }, { chain: "solana", address: BUYER }, CALLER),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(RectangleTaken);
  });

  it("lets both of two concurrent NON-overlapping reservations win", async () => {
    const results = await Promise.allSettled([
      reserveRect({ x: 100, y: 100, w: 50, h: 50 }, { chain: "solana", address: BUYER }, CALLER),
      reserveRect({ x: 200, y: 200, w: 50, h: 50 }, { chain: "solana", address: BUYER }, CALLER),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  });

  it("tells the caller exactly when a blocking live hold frees up", async () => {
    await seedBlock(0, 0, "reserved", 30);
    const error = await reserveRect({ x: 10, y: 10, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    const [row] = await query<{ expires_at: Date }>(
      "SELECT expires_at FROM blocks WHERE status = 'reserved'",
    );
    expect((error as RectangleTaken).availableAt).toBe(row.expires_at.toISOString());
  });

  it("says a minted block never frees up", async () => {
    await seedBlock(0, 0, "minted", null);
    const error = await reserveRect({ x: 10, y: 10, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect((error as RectangleTaken).availableAt).toBeNull();
  });

  it("says a paid order never frees up", async () => {
    await seedBlock(0, 0, "paid", null);
    const error = await reserveRect({ x: 10, y: 10, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect((error as RectangleTaken).availableAt).toBeNull();
  });

  it("picks the EARLIEST expiry when several live holds overlap the request", async () => {
    // The two seeded blocks must not overlap EACH OTHER (the exclusion
    // constraint would refuse the second insert), only the rectangle being
    // requested. The one at (30,30) expires sooner, so its expiry is what
    // the caller learns — the first moment anything could change.
    await seedBlock(0, 0, "reserved", 30);
    await seedBlock(30, 30, "reserved", 10);
    const error = await reserveRect({ x: 0, y: 0, w: 50, h: 50 }, { chain: "solana", address: BUYER }, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    const rows = await query<{ x: number; expires_at: Date }>(
      "SELECT x, expires_at FROM blocks WHERE status = 'reserved' ORDER BY x",
    );
    const earliest = rows.reduce((a, b) => (a.expires_at < b.expires_at ? a : b));
    expect((error as RectangleTaken).availableAt).toBe(earliest.expires_at.toISOString());
  });

  it("REGRESSION: a 10x10 at (990,620) with nothing there succeeds — this was not an edge bug", async () => {
    const held = await reserveRect({ x: 990, y: 620, w: 10, h: 10 }, { chain: "solana", address: BUYER }, CALLER);
    expect(held.rect).toEqual({ x: 990, y: 620, w: 10, h: 10 });
  });

  it.each([
    [1240, 790],
    [0, 790],
    [1240, 0],
  ])("REGRESSION: the board's other corners also succeed: (%i, %i)", async (x, y) => {
    const held = await reserveRect({ x, y, w: 10, h: 10 }, { chain: "solana", address: BUYER }, CALLER);
    expect(held.rect).toEqual({ x, y, w: 10, h: 10 });
  });

  it("rolls the sweep back when the insert fails, proving the sweep is in the transaction", async () => {
    // An expired hold somewhere harmless, and a minted block in the way of the
    // rectangle we are about to ask for.
    await seedBlock(0, 0, "reserved", -1);      // expired, would be swept
    await seedBlock(500, 500, "minted", null);  // blocks the request below

    await expect(
      reserveRect({ x: 500, y: 500, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER),
    ).rejects.toBeInstanceOf(RectangleTaken);

    // The sweep ran inside the failed transaction, so it was rolled back with it
    // and the expired hold is still there. If the sweep were issued on a pooled
    // connection outside the transaction, this row would be gone.
    const survivors = await query<{ x: number }>(
      "SELECT x FROM blocks WHERE status = 'reserved'",
    );
    expect(
      survivors,
      "the expired hold must survive a failed reservation, or the sweep is not in the transaction",
    ).toHaveLength(1);
  });
});

/**
 * A dollar a pixel, and a million dollars for the wall.
 *
 * Every number here is read back OUT of the database — `total_usdc` as it was
 * stored, and `w * h` as Postgres computes it — rather than recomputed in the
 * test from pixels times price. That multiplication is the one `reserveRect`
 * itself does, and a guard that repeated it would agree with the bug it was
 * supposed to catch. The dollar figures are written out as literals for the
 * same reason.
 */
describe("the price is the area", () => {
  type Charged = { pixels: string; total_usdc: string };

  async function chargedFor(rect: { x: number; y: number; w: number; h: number }): Promise<Charged> {
    const held = await reserveRect(rect, { chain: "solana", address: BUYER }, CALLER);
    const rows = await query<Charged>(
      "SELECT (w * h)::text AS pixels, total_usdc::text FROM blocks WHERE id = $1",
      [held.id],
    );
    return rows[0];
  }

  it.each([
    [1, 1, 1, "$1"],
    [1, 7, 7, "$7"],
    [37, 11, 407, "$407"],
    [23, 100, 2300, "$2,300"],
  ])("charges a %i by %i rectangle for its %i pixels", async (w, h, pixels, price) => {
    const charged = await chargedFor({ x: 0, y: 0, w, h });
    expect(Number(charged.pixels)).toBe(pixels);
    expect(formatUsdc(Number(charged.total_usdc))).toBe(price);
  });

  it("prices the whole wall at exactly one million dollars", async () => {
    const charged = await chargedFor({ x: 0, y: 0, w: 1250, h: 800 });
    expect(Number(charged.pixels)).toBe(1_000_000);
    expect(formatUsdc(Number(charged.total_usdc))).toBe("$1,000,000");
  });

  it("still comes to a million when the wall is sold off in odd pieces", async () => {
    // Six rectangles that tile 1250 x 800 exactly and share edges without
    // overlapping — including a strip one pixel tall, which the old board
    // could not have sold at all. The exclusion constraint accepting all six
    // is half the assertion; the sum is the other half.
    const strips = [
      { x: 0, y: 0, w: 137, h: 1 },
      { x: 137, y: 0, w: 613, h: 1 },
      { x: 750, y: 0, w: 500, h: 1 },
      { x: 0, y: 1, w: 137, h: 799 },
      { x: 137, y: 1, w: 613, h: 799 },
      { x: 750, y: 1, w: 500, h: 799 },
    ];
    // Together rather than in turn: six round trips to a hosted Postgres is
    // slower than this file's budget, and nothing here needs them ordered.
    await Promise.all(strips.map((strip) => reserveRect(strip, { chain: "solana", address: BUYER }, CALLER)));

    const [total] = await query<{ blocks: string; pixels: string; usdc: string }>(
      "SELECT COUNT(*)::text AS blocks, SUM(w * h)::text AS pixels, SUM(total_usdc)::text AS usdc FROM blocks",
    );
    expect(total.blocks).toBe("6");
    expect(Number(total.pixels)).toBe(1_000_000);
    expect(formatUsdc(Number(total.usdc))).toBe("$1,000,000");
  });
});

describe("disjoint rectangles never collide", () => {
  // Filed as a false 409: reserving 10x10 at (630,160) was reported as colliding
  // with a live 70x40 hold at (810,440), which shares neither an x range nor a y
  // range with it. If the axes were crossed, or width and height swapped, or the
  // constraint inclusive, this is the test that would catch it.
  //
  // It passes. That is the finding: the refusal was real and came from a
  // different row at the SAME coordinates, not from this one. Kept as a
  // regression guard so the hypothesis never has to be re-tested by hand.
  const REPORTED = { x: 630, y: 160, w: 10, h: 10 };
  const OTHER_HOLD = { x: 810, y: 440, w: 70, h: 40 };

  it("does not refuse the reported rectangle when only the far hold exists", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at)
       VALUES ($1, $2, $3, $4, 'reserved', 1000000, $5, now() + interval '30 minutes')`,
      [OTHER_HOLD.x, OTHER_HOLD.y, OTHER_HOLD.w, OTHER_HOLD.h, OTHER_HOLD.w * OTHER_HOLD.h * 1000000],
    );

    const held = await reserveRect(REPORTED, { chain: "solana", address: BUYER }, CALLER);
    expect(held.rect).toEqual(REPORTED);
  });

  it("refuses it only once a hold sits on those exact pixels", async () => {
    // The second request comes from a DIFFERENT buyer on purpose. This test is
    // about the constraint refusing a competing request for the same pixels;
    // the same buyer asking twice now resumes their own hold instead of being
    // refused, which is its own test in "resuming your own hold" below.
    const other = "OtherBuyerPubkey111111111111111111111111111";
    await reserveRect(REPORTED, { chain: "solana", address: BUYER }, CALLER);
    await expect(reserveRect(REPORTED, { chain: "solana", address: other }, CALLER)).rejects.toBeInstanceOf(RectangleTaken);
  });

  it("keeps the axes straight: swapping x for y is not a collision", async () => {
    await reserveRect({ x: 630, y: 160, w: 10, h: 20 }, { chain: "solana", address: BUYER }, CALLER);
    const mirrored = await reserveRect({ x: 160, y: 630, w: 20, h: 10 }, { chain: "solana", address: BUYER }, CALLER);
    expect(mirrored.rect).toEqual({ x: 160, y: 630, w: 20, h: 10 });
  });

  it("keeps width and height straight: a tall rect does not block a wide one beside it", async () => {
    await reserveRect({ x: 100, y: 200, w: 10, h: 80 }, { chain: "solana", address: BUYER }, CALLER);
    const wide = await reserveRect({ x: 110, y: 200, w: 80, h: 10 }, { chain: "solana", address: BUYER }, CALLER);
    expect(wide.rect.x).toBe(110);
  });

  it("treats a shared edge as disjoint, not as an overlap", async () => {
    await reserveRect({ x: 630, y: 160, w: 10, h: 10 }, { chain: "solana", address: BUYER }, CALLER);
    const flush = await reserveRect({ x: 640, y: 160, w: 10, h: 10 }, { chain: "solana", address: BUYER }, CALLER);
    expect(flush.rect.x).toBe(640);
  });
});

describe("resuming your own hold", () => {
  // A buyer drags a rectangle, presses Buy, then abandons the dialog. Every
  // retry on that rectangle collided with their own thirty-minute hold, and
  // the refusal was correct and useless: they were locked out of their own
  // pixels with nothing to do about it.
  const RECT = { x: 300, y: 300, w: 20, h: 20 };

  it("returns the SAME order rather than refusing, when the only blocker is your own exact hold", async () => {
    const first = await reserveRect(RECT, { chain: "solana", address: BUYER }, CALLER);
    const again = await reserveRect(RECT, { chain: "solana", address: BUYER }, CALLER);
    expect(again.id).toBe(first.id);
    expect(again.rect).toEqual(RECT);
  });

  /**
   * The residue the 2026-08-28 audit left open, closed.
   *
   * A resume is asked for with a wallet address and a rectangle, both of which
   * are public — so this is the one path that could hand the attribution
   * fraction to somebody who proved nothing, and the fraction is what lets an
   * observer match a transfer on the chain to an order id. A fresh hold still
   * carries it, because that caller made the row in the same request.
   */
  it("does not hand the payment fraction back on a resume", async () => {
    const fresh = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, { chain: "solana", address: BUYER }, CALLER);
    expect(fresh.paymentBaseUnits, "a fresh hold still carries it").toBeDefined();

    const resumed = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, { chain: "solana", address: BUYER }, CALLER);
    expect(resumed.id, "same hold, not a second one").toBe(fresh.id);
    expect(resumed.paymentBaseUnits).toBeUndefined();
    // And the rest of the hold still comes back, so this withheld one field
    // rather than breaking the resume.
    expect(resumed.totalBaseUnits).toBe(fresh.totalBaseUnits);
    expect(resumed.expiresAt).toBeTruthy();
  });

  it("resumes the hold that exists rather than creating a second row", async () => {
    await reserveRect(RECT, { chain: "solana", address: BUYER }, CALLER);
    await reserveRect(RECT, { chain: "solana", address: BUYER }, CALLER);
    const rows = await query("SELECT id FROM blocks WHERE status = 'reserved'");
    expect(rows, "a resume must not open a second hold on the same pixels").toHaveLength(1);
  });

  it("keeps the original expiry and payment fraction, so the clock is not restarted", async () => {
    const first = await reserveRect(RECT, { chain: "solana", address: BUYER }, CALLER);
    const again = await reserveRect(RECT, { chain: "solana", address: BUYER }, CALLER);
    expect(again.expiresAt).toBe(first.expiresAt);
    expect(again.totalBaseUnits).toBe(first.totalBaseUnits);
    expect(again.pricePerPixelBaseUnits).toBe(first.pricePerPixelBaseUnits);

    // The fraction attributes an incoming transfer to this order; a resume that
    // minted a new one would leave a payment already in flight unattributable.
    // Read off the ROW rather than off the response, because the response
    // deliberately no longer carries it — the property is about what the
    // database holds, and publishing it was only ever how it was observed.
    const [row] = await query<{ payment_fraction: number }>(
      "SELECT payment_fraction FROM blocks WHERE id = $1",
      [first.id],
    );
    expect(row.payment_fraction).toBe(first.paymentBaseUnits! - first.totalBaseUnits);
  });

  it("does NOT resume a different buyer's hold on the same rectangle", async () => {
    const other = "OtherBuyerPubkey111111111111111111111111111";
    await reserveRect(RECT, { chain: "solana", address: other }, CALLER);
    const error = await reserveRect(RECT, { chain: "solana", address: BUYER }, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect(
      (error as RectangleTaken).yourOrderIds,
      "somebody else's row must never appear in yourOrderIds",
    ).toEqual([]);
  });

  it("does NOT resume on partial overlap, and hands back your own blocking id instead", async () => {
    const held = await reserveRect({ x: 100, y: 100, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER);
    const error = await reserveRect({ x: 110, y: 110, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect((error as RectangleTaken).yourOrderIds).toEqual([held.id]);
  });

  it("does NOT resume when anything else is in the way as well", async () => {
    // Your own exact hold, plus a stranger's block inside the same request.
    await reserveRect({ x: 300, y: 300, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER);
    await seedBlock(320, 320, "minted", null);
    const error = await reserveRect({ x: 300, y: 300, w: 50, h: 50 }, { chain: "solana", address: BUYER }, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect((error as RectangleTaken).availableAt, "a sold block never frees up").toBeNull();
  });

  it("does NOT resume a PAID rectangle of your own — a sale is not a hold", async () => {
    const held = await reserveRect(RECT, { chain: "solana", address: BUYER }, CALLER);
    await execute("UPDATE blocks SET status = 'paid', expires_at = NULL WHERE id = $1", [held.id]);
    const error = await reserveRect(RECT, { chain: "solana", address: BUYER }, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect((error as RectangleTaken).availableAt).toBeNull();
  });

  it("lists only YOUR blocking ids when yours and a stranger's are both in the way", async () => {
    const mine = await reserveRect({ x: 400, y: 400, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER);
    const theirs = await reserveRect(
      { x: 440, y: 400, w: 20, h: 20 },
      { chain: "solana", address: "OtherBuyerPubkey111111111111111111111111111" },
      CALLER,
    );
    const error = await reserveRect({ x: 400, y: 400, w: 100, h: 20 }, { chain: "solana", address: BUYER }, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect((error as RectangleTaken).yourOrderIds).toEqual([mine.id]);
    expect((error as RectangleTaken).yourOrderIds).not.toContain(theirs.id);
  });
});

/**
 * How long a hold lasts, read off the row rather than recomputed.
 *
 * Every number here comes out of Postgres as `expires_at - created_at`, and the
 * two minute-figures are written as literals. `holdMinutes` is the arithmetic
 * under test, so a guard that called it would agree with a version of it that
 * had been flattened back into a constant — which is exactly the regression
 * this exists to catch.
 */
describe("a big hold expires sooner than a small one", () => {
  /** The hold's own clock, as the database measures it. */
  async function grantedMinutes(id: string): Promise<number> {
    const rows = await query<{ minutes: string }>(
      "SELECT (EXTRACT(EPOCH FROM (expires_at - created_at)) / 60)::text AS minutes FROM blocks WHERE id = $1",
      [id],
    );
    return Number(rows[0].minutes);
  }

  it("gives one pixel the full half hour and the largest holdable rectangle ten minutes", async () => {
    const small = await reserveRect({ x: 1200, y: 700, w: 1, h: 1 }, { chain: "solana", address: BUYER }, CALLER);
    const large = await reserveRect({ x: 0, y: 0, w: 100, h: 100 }, { chain: "solana", address: BUYER }, CALLER);

    expect(await grantedMinutes(small.id)).toBe(30);
    expect(await grantedMinutes(large.id)).toBe(10);
  });

  it("shortens the clock as the rectangle grows, and never below ten minutes", async () => {
    // Four sizes across the whole range, held at once so they share a clock.
    const sizes = [1, 50, 70, 100];
    const granted: number[] = [];
    for (const [index, side] of sizes.entries()) {
      const held = await reserveRect({ x: index * 110, y: 0, w: side, h: side }, { chain: "solana", address: BUYER }, CALLER);
      granted.push(await grantedMinutes(held.id));
    }

    for (let i = 1; i < granted.length; i++) {
      expect(granted[i], `${sizes[i]} square must not last longer than ${sizes[i - 1]} square`)
        .toBeLessThanOrEqual(granted[i - 1]);
    }
    expect(Math.min(...granted), "no hold may be too short to finish a purchase in").toBeGreaterThanOrEqual(10);
    expect(Math.max(...granted), "and none may last longer than the half hour").toBeLessThanOrEqual(30);
    expect(granted[granted.length - 1]).toBeLessThan(granted[0]);
  });

  it("charges the hold against its caller for exactly the clock the row was given", async () => {
    // The ledger and the block must agree, or the budget is pricing a hold
    // that is not the one standing.
    const held = await reserveRect({ x: 0, y: 0, w: 100, h: 100 }, { chain: "solana", address: BUYER }, CALLER);
    const rows = await query<{ agrees: boolean; pixels: number }>(
      `SELECT m.charged_until = b.expires_at AS agrees, m.pixels
         FROM hold_meter m JOIN blocks b ON b.id = m.block_id
        WHERE m.block_id = $1`,
      [held.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].agrees).toBe(true);
    expect(rows[0].pixels).toBe(10_000);
  });

  it("charges nothing to the caller who loses a race for the same pixels", async () => {
    await seedBlock(0, 0, "minted", null);
    await expect(reserveRect({ x: 0, y: 0, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER)).rejects.toBeInstanceOf(
      RectangleTaken,
    );
    const charges = await query("SELECT block_id FROM hold_meter WHERE ip_hash = $1", [CALLER]);
    expect(charges, "a refused hold is a hold nobody had").toEqual([]);
  });
});
