import { describe, expect, it } from "vitest";
import { execute, query } from "../../db";
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
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, BUYER, CALLER);
    expect(held.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    expect(held.pixels).toBe(400);
    expect(held.pricePerPixelBaseUnits).toBe(1_000_000);
    expect(held.totalBaseUnits).toBe(400_000_000);
    expect(Date.parse(held.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("gives the hold a payment amount that is not round", async () => {
    // The fraction is how an incoming transfer is attributed to an order, so a
    // round amount is exactly the one that cannot be attributed.
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    expect(held.paymentBaseUnits).toBeGreaterThan(held.totalBaseUnits);
    expect(held.paymentBaseUnits - held.totalBaseUnits).toBeGreaterThanOrEqual(1);
    expect(held.paymentBaseUnits - held.totalBaseUnits).toBeLessThanOrEqual(999_999);
  });

  it("snapshots the price so a settings change cannot move a live hold", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
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
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const rows = await query<{ buyer_pubkey: string; ip_hash: string }>(
      "SELECT buyer_pubkey, ip_hash FROM blocks WHERE id = $1",
      [held.id],
    );
    expect(rows[0].buyer_pubkey).toBe(BUYER);
    expect(rows[0].ip_hash).toBe(CALLER);
  });

  it("refuses a rectangle overlapping a minted block", async () => {
    await seedBlock(0, 0, "minted", null);
    await expect(reserveRect({ x: 10, y: 10, w: 20, h: 20 }, BUYER, CALLER)).rejects.toBeInstanceOf(
      RectangleTaken,
    );
  });

  it("refuses a rectangle overlapping a live hold", async () => {
    await seedBlock(0, 0, "reserved", 30);
    await expect(reserveRect({ x: 10, y: 10, w: 20, h: 20 }, BUYER, CALLER)).rejects.toBeInstanceOf(
      RectangleTaken,
    );
  });

  it("refuses a rectangle overlapping a paid order, which never expires", async () => {
    await seedBlock(0, 0, "paid", null);
    await expect(reserveRect({ x: 10, y: 10, w: 20, h: 20 }, BUYER, CALLER)).rejects.toBeInstanceOf(
      RectangleTaken,
    );
  });

  it("ALLOWS a rectangle over an EXPIRED hold, sweeping it in the same transaction", async () => {
    // The whole reason the sweep lives inside the insert's transaction.
    await seedBlock(0, 0, "reserved", -1);
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, BUYER, CALLER);
    expect(held.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    const rows = await query("SELECT id FROM blocks WHERE status = 'reserved'");
    expect(rows, "the expired hold should be gone, and only the new one left").toHaveLength(1);
  });

  it("allows a rectangle flush against a sold block, because edges do not overlap", async () => {
    await seedBlock(0, 0, "minted", null);
    const held = await reserveRect({ x: 20, y: 0, w: 20, h: 20 }, BUYER, CALLER);
    expect(held.rect.x).toBe(20);
  });

  it("allows a rectangle over a removed block, whose pixels are for sale again", async () => {
    await seedBlock(0, 0, "removed", null);
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, BUYER, CALLER);
    expect(held.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });

  it("refuses a malformed rectangle before touching the database", async () => {
    await expect(reserveRect({ x: 5, y: 0, w: 10, h: 10 }, BUYER, CALLER)).rejects.toBeInstanceOf(
      RectangleInvalid,
    );
    await expect(reserveRect({ x: 0, y: 0, w: 0, h: 10 }, BUYER, CALLER)).rejects.toBeInstanceOf(
      RectangleInvalid,
    );
    await expect(
      reserveRect({ x: 990, y: 0, w: 20, h: 10 }, BUYER, CALLER),
    ).rejects.toBeInstanceOf(RectangleInvalid);
  });

  it("lets exactly one of two concurrent overlapping reservations win", async () => {
    // The constraint, not the application, is what makes this true.
    const results = await Promise.allSettled([
      reserveRect({ x: 100, y: 100, w: 50, h: 50 }, BUYER, CALLER),
      reserveRect({ x: 120, y: 120, w: 50, h: 50 }, BUYER, CALLER),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(RectangleTaken);
  });

  it("lets both of two concurrent NON-overlapping reservations win", async () => {
    const results = await Promise.allSettled([
      reserveRect({ x: 100, y: 100, w: 50, h: 50 }, BUYER, CALLER),
      reserveRect({ x: 200, y: 200, w: 50, h: 50 }, BUYER, CALLER),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  });

  it("tells the caller exactly when a blocking live hold frees up", async () => {
    await seedBlock(0, 0, "reserved", 30);
    const error = await reserveRect({ x: 10, y: 10, w: 20, h: 20 }, BUYER, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    const [row] = await query<{ expires_at: Date }>(
      "SELECT expires_at FROM blocks WHERE status = 'reserved'",
    );
    expect((error as RectangleTaken).availableAt).toBe(row.expires_at.toISOString());
  });

  it("says a minted block never frees up", async () => {
    await seedBlock(0, 0, "minted", null);
    const error = await reserveRect({ x: 10, y: 10, w: 20, h: 20 }, BUYER, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect((error as RectangleTaken).availableAt).toBeNull();
  });

  it("says a paid order never frees up", async () => {
    await seedBlock(0, 0, "paid", null);
    const error = await reserveRect({ x: 10, y: 10, w: 20, h: 20 }, BUYER, CALLER).catch((e) => e);
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
    const error = await reserveRect({ x: 0, y: 0, w: 50, h: 50 }, BUYER, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    const rows = await query<{ x: number; expires_at: Date }>(
      "SELECT x, expires_at FROM blocks WHERE status = 'reserved' ORDER BY x",
    );
    const earliest = rows.reduce((a, b) => (a.expires_at < b.expires_at ? a : b));
    expect((error as RectangleTaken).availableAt).toBe(earliest.expires_at.toISOString());
  });

  it("REGRESSION: a 10x10 at (990,620) with nothing there succeeds — this was not an edge bug", async () => {
    const held = await reserveRect({ x: 990, y: 620, w: 10, h: 10 }, BUYER, CALLER);
    expect(held.rect).toEqual({ x: 990, y: 620, w: 10, h: 10 });
  });

  it.each([
    [990, 990],
    [0, 990],
    [990, 0],
  ])("REGRESSION: the board's other corners also succeed: (%i, %i)", async (x, y) => {
    const held = await reserveRect({ x, y, w: 10, h: 10 }, BUYER, CALLER);
    expect(held.rect).toEqual({ x, y, w: 10, h: 10 });
  });

  it("rolls the sweep back when the insert fails, proving the sweep is in the transaction", async () => {
    // An expired hold somewhere harmless, and a minted block in the way of the
    // rectangle we are about to ask for.
    await seedBlock(0, 0, "reserved", -1);      // expired, would be swept
    await seedBlock(500, 500, "minted", null);  // blocks the request below

    await expect(
      reserveRect({ x: 500, y: 500, w: 20, h: 20 }, BUYER, CALLER),
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

    const held = await reserveRect(REPORTED, BUYER, CALLER);
    expect(held.rect).toEqual(REPORTED);
  });

  it("refuses it only once a hold sits on those exact pixels", async () => {
    // The second request comes from a DIFFERENT buyer on purpose. This test is
    // about the constraint refusing a competing request for the same pixels;
    // the same buyer asking twice now resumes their own hold instead of being
    // refused, which is its own test in "resuming your own hold" below.
    const other = "OtherBuyerPubkey111111111111111111111111111";
    await reserveRect(REPORTED, BUYER, CALLER);
    await expect(reserveRect(REPORTED, other, CALLER)).rejects.toBeInstanceOf(RectangleTaken);
  });

  it("keeps the axes straight: swapping x for y is not a collision", async () => {
    await reserveRect({ x: 630, y: 160, w: 10, h: 20 }, BUYER, CALLER);
    const mirrored = await reserveRect({ x: 160, y: 630, w: 20, h: 10 }, BUYER, CALLER);
    expect(mirrored.rect).toEqual({ x: 160, y: 630, w: 20, h: 10 });
  });

  it("keeps width and height straight: a tall rect does not block a wide one beside it", async () => {
    await reserveRect({ x: 100, y: 200, w: 10, h: 80 }, BUYER, CALLER);
    const wide = await reserveRect({ x: 110, y: 200, w: 80, h: 10 }, BUYER, CALLER);
    expect(wide.rect.x).toBe(110);
  });

  it("treats a shared edge as disjoint, not as an overlap", async () => {
    await reserveRect({ x: 630, y: 160, w: 10, h: 10 }, BUYER, CALLER);
    const flush = await reserveRect({ x: 640, y: 160, w: 10, h: 10 }, BUYER, CALLER);
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
    const first = await reserveRect(RECT, BUYER, CALLER);
    const again = await reserveRect(RECT, BUYER, CALLER);
    expect(again.id).toBe(first.id);
    expect(again.rect).toEqual(RECT);
  });

  it("resumes the hold that exists rather than creating a second row", async () => {
    await reserveRect(RECT, BUYER, CALLER);
    await reserveRect(RECT, BUYER, CALLER);
    const rows = await query("SELECT id FROM blocks WHERE status = 'reserved'");
    expect(rows, "a resume must not open a second hold on the same pixels").toHaveLength(1);
  });

  it("keeps the original expiry and payment fraction, so the clock is not restarted", async () => {
    const first = await reserveRect(RECT, BUYER, CALLER);
    const again = await reserveRect(RECT, BUYER, CALLER);
    expect(again.expiresAt).toBe(first.expiresAt);
    // The fraction attributes an incoming transfer to this order; a resume
    // that minted a new one would leave a payment already in flight
    // unattributable.
    expect(again.paymentBaseUnits).toBe(first.paymentBaseUnits);
    expect(again.totalBaseUnits).toBe(first.totalBaseUnits);
    expect(again.pricePerPixelBaseUnits).toBe(first.pricePerPixelBaseUnits);
  });

  it("does NOT resume a different buyer's hold on the same rectangle", async () => {
    const other = "OtherBuyerPubkey111111111111111111111111111";
    await reserveRect(RECT, other, CALLER);
    const error = await reserveRect(RECT, BUYER, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect(
      (error as RectangleTaken).yourOrderIds,
      "somebody else's row must never appear in yourOrderIds",
    ).toEqual([]);
  });

  it("does NOT resume on partial overlap, and hands back your own blocking id instead", async () => {
    const held = await reserveRect({ x: 100, y: 100, w: 20, h: 20 }, BUYER, CALLER);
    const error = await reserveRect({ x: 110, y: 110, w: 20, h: 20 }, BUYER, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect((error as RectangleTaken).yourOrderIds).toEqual([held.id]);
  });

  it("does NOT resume when anything else is in the way as well", async () => {
    // Your own exact hold, plus a stranger's block inside the same request.
    await reserveRect({ x: 300, y: 300, w: 20, h: 20 }, BUYER, CALLER);
    await seedBlock(320, 320, "minted", null);
    const error = await reserveRect({ x: 300, y: 300, w: 50, h: 50 }, BUYER, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect((error as RectangleTaken).availableAt, "a sold block never frees up").toBeNull();
  });

  it("does NOT resume a PAID rectangle of your own — a sale is not a hold", async () => {
    const held = await reserveRect(RECT, BUYER, CALLER);
    await execute("UPDATE blocks SET status = 'paid', expires_at = NULL WHERE id = $1", [held.id]);
    const error = await reserveRect(RECT, BUYER, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect((error as RectangleTaken).availableAt).toBeNull();
  });

  it("lists only YOUR blocking ids when yours and a stranger's are both in the way", async () => {
    const mine = await reserveRect({ x: 400, y: 400, w: 20, h: 20 }, BUYER, CALLER);
    const theirs = await reserveRect(
      { x: 440, y: 400, w: 20, h: 20 },
      "OtherBuyerPubkey111111111111111111111111111",
      CALLER,
    );
    const error = await reserveRect({ x: 400, y: 400, w: 100, h: 20 }, BUYER, CALLER).catch((e) => e);
    expect(error).toBeInstanceOf(RectangleTaken);
    expect((error as RectangleTaken).yourOrderIds).toEqual([mine.id]);
    expect((error as RectangleTaken).yourOrderIds).not.toContain(theirs.id);
  });
});
