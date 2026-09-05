import { describe, expect, it, vi } from "vitest";
import { execute, query } from "../../db";
import type { Rect } from "../../board/geometry";
import { reserveRect } from "../../board/reserve";
import {
  RESERVATION_LIMITS,
  SIGNED_WRITE_LIMITS,
  checkReservationLimits,
  checkSignedWriteLimits,
} from "../limits";

// The budget tests below drive real reservations, and each one is several
// round trips to a remote Neon branch.
vi.setConfig({ testTimeout: 30_000 });

const CALLER = "a".repeat(64);
const OTHER = "b".repeat(64);
const BUYER = "LimitsBuyerPubkey111111111111111111111111";

/**
 * The rectangle every check below asks about.
 *
 * Somewhere no fixture in this file ever puts a hold, because
 * `checkReservationLimits` now takes the rectangle being asked for and treats a
 * caller's own hold on EXACTLY that rectangle as a resumption rather than a new
 * hold. A shared fixture rectangle would quietly turn half these tests into
 * tests of the resume path.
 */
const FRESH: Rect = { x: 900, y: 500, w: 10, h: 10 };

async function hold(
  ipHash: string,
  x: number,
  minutesLeft: number,
  w = 10,
  h = 10,
  y = 0,
): Promise<void> {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at, ip_hash)
     VALUES ($1, $6, $4, $5, 'reserved', 1000000, 100000000, now() + ($2 || ' minutes')::interval, $3)`,
    [x, String(minutesLeft), ipHash, w, h, y],
  );
}

/** The pixels this caller is holding, as Postgres counts them. */
async function heldPixels(ipHash: string): Promise<number> {
  const rows = await query<{ pixels: string }>(
    `SELECT COALESCE(SUM(w * h), 0)::text AS pixels
       FROM blocks
      WHERE status = 'reserved' AND ip_hash = $1 AND expires_at > now()`,
    [ipHash],
  );
  return Number(rows[0].pixels);
}

describe("checkReservationLimits", () => {
  it("allows a caller with nothing outstanding", async () => {
    expect(await checkReservationLimits(CALLER, FRESH)).toEqual({ ok: true });
  });

  it("allows a caller right up to the live-hold ceiling", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller - 1; i++) {
      await hold(CALLER, i * 20, 30);
    }
    expect(await checkReservationLimits(CALLER, FRESH)).toEqual({ ok: true });
  });

  it("refuses a caller already holding the maximum", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      await hold(CALLER, i * 20, 30);
    }
    const decision = await checkReservationLimits(CALLER, FRESH);
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toBe("too_many_live");
      expect(Date.parse(decision.retryAt)).toBeGreaterThan(Date.now());
    }
  });

  it("does not count another caller's holds against this one", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      await hold(OTHER, i * 20, 30);
    }
    expect(await checkReservationLimits(CALLER, FRESH)).toEqual({ ok: true });
  });

  it("sweeps expired holds first, so a blocked caller unblocks itself by waiting", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      await hold(CALLER, i * 20, -5);
    }
    expect(await checkReservationLimits(CALLER, FRESH)).toEqual({ ok: true });
    const left = await query("SELECT id FROM blocks WHERE status = 'reserved'");
    expect(left, "the expired holds should be gone, not merely ignored").toEqual([]);
  });

  it("does not count an expired hold against the live-hold ceiling, independent of the sweep's DELETE", async () => {
    // liveHoldsPerCaller reserved rows exist in total, but only
    // liveHoldsPerCaller - 1 of them are actually live; the last is expired.
    // The count query itself must exclude the expired one — this assertion
    // must hold even if sweepExpiredReservations's DELETE were removed
    // entirely, because unlike the "sweeps expired holds first" test above,
    // this one never checks that the row was deleted, only that it was
    // never counted.
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller - 1; i++) {
      await hold(CALLER, i * 20, 30);
    }
    await hold(CALLER, (RESERVATION_LIMITS.liveHoldsPerCaller - 1) * 20, -5);
    expect(await checkReservationLimits(CALLER, FRESH)).toEqual({ ok: true });
  });

  it("counts a paid order against nothing, because it is no longer a hold", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at, ip_hash, approved_at)
       VALUES (0, 0, 10, 10, 'paid', 1000000, 100000000, NULL, $1, now())`,
      [CALLER],
    );
    expect(await checkReservationLimits(CALLER, FRESH)).toEqual({ ok: true });
  });
});

/**
 * The ceiling that counts PIXELS, which is the correction this batch exists
 * for. The old limit counted three rectangles, and a rectangle could be the
 * whole wall.
 *
 * Every number the refusals below are checked against is read back out of
 * Postgres — `SUM(w * h)` over the rows that actually exist — rather than added
 * up in the test from the sizes it asked for. That sum is the one the limit
 * itself takes, and a guard that re-derived it from the fixture would agree
 * with a bug that miscounted both.
 */
describe("the pixel ceiling", () => {
  it("refuses one hold bigger than the whole allowance", async () => {
    const decision = await checkReservationLimits(CALLER, { x: 0, y: 0, w: 400, h: 300 });
    expect(decision.ok, "the centre of the wall must not be holdable in one go").toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("too_many_pixels");
  });

  it("refuses the whole wall, which used to be a valid hold", async () => {
    const decision = await checkReservationLimits(CALLER, { x: 0, y: 0, w: 1250, h: 800 });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("too_many_pixels");
  });

  it("adds several holds together, so splitting a big one up does not evade it", async () => {
    // Two live holds, well inside the ceiling on their own and past it
    // together, and both inside the ROW ceiling — so a refusal here can only
    // be about area.
    await hold(CALLER, 0, 30, 70, 70);
    await hold(CALLER, 200, 30, 70, 70);
    const already = await heldPixels(CALLER);
    expect(already, "the fixture must sit under the ceiling by itself").toBeLessThan(
      RESERVATION_LIMITS.heldPixelsPerCaller,
    );

    const decision = await checkReservationLimits(CALLER, { x: 600, y: 600, w: 70, h: 70 });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("too_many_pixels");
  });

  it("allows a hold that lands exactly on the ceiling", async () => {
    const decision = await checkReservationLimits(CALLER, { x: 0, y: 0, w: 100, h: 100 });
    expect(decision, "a 100 by 100 purchase must still go through in one go").toEqual({ ok: true });
  });

  it("frees the allowance again once the pixels are given back", async () => {
    await hold(CALLER, 0, 30, 100, 100);
    expect((await checkReservationLimits(CALLER, FRESH)).ok).toBe(false);

    await execute("DELETE FROM blocks WHERE ip_hash = $1", [CALLER]);
    expect(await heldPixels(CALLER)).toBe(0);
    expect(await checkReservationLimits(CALLER, FRESH)).toEqual({ ok: true });
  });

  it("does not charge a caller twice for the rectangle they already hold", async () => {
    // The whole ceiling, held, and then asked for again — which is what
    // pressing Buy a second time on your own hold does. It must resume, not
    // be refused by its own pixels.
    const mine = { x: 300, y: 300, w: 100, h: 100 };
    await hold(CALLER, mine.x, 30, mine.w, mine.h, mine.y);
    expect(await heldPixels(CALLER)).toBe(RESERVATION_LIMITS.heldPixelsPerCaller);
    expect(await checkReservationLimits(CALLER, mine)).toEqual({ ok: true });
  });

  it("does not count another caller's pixels against this one", async () => {
    await hold(OTHER, 0, 30, 100, 100);
    expect(await checkReservationLimits(CALLER, { x: 600, y: 600, w: 100, h: 100 })).toEqual({
      ok: true,
    });
  });
});

/**
 * The pixel-minute budget, which is the half of the fix the sweep cannot do.
 *
 * These drive REAL reservations, because a charge is only written by the thing
 * that writes the hold, and the point of the ledger is that it outlives the
 * row. Fabricating meter rows here would test the arithmetic against itself.
 */
describe("the pixel-minute budget", () => {
  /** Re-takes a rectangle the way an attacker does: let it lapse, take it again. */
  async function expireEverything(): Promise<void> {
    await execute("UPDATE blocks SET expires_at = now() - interval '1 minute' WHERE status = 'reserved'");
  }

  it("survives the sweep, so a lapsed hold still counts against its caller", async () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 };
    await reserveRect(rect, { chain: "solana", address: BUYER }, CALLER);
    await expireEverything();

    // The sweep runs inside this check and deletes the block. The charge must
    // not go with it.
    expect((await checkReservationLimits(CALLER, rect)).ok).toBe(true);
    const blocks = await query("SELECT id FROM blocks WHERE ip_hash = $1", [CALLER]);
    const charges = await query("SELECT block_id FROM hold_meter WHERE ip_hash = $1", [CALLER]);
    expect(blocks, "the sweep should have taken the hold").toHaveLength(0);
    expect(charges, "and left the charge behind").toHaveLength(1);
  });

  it("runs out when the same rectangle is taken again and again", async () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 };
    let taken = 0;

    // Renew until the budget refuses. A ceiling-sized hold costs its area
    // times its own clock, so this must stop, and it must stop because of the
    // budget rather than because of anything else.
    for (let attempt = 0; attempt < 10; attempt++) {
      const decision = await checkReservationLimits(CALLER, rect);
      if (!decision.ok) {
        expect(decision.reason).toBe("budget_spent");
        expect(Date.parse(decision.retryAt)).toBeGreaterThan(Date.now());
        break;
      }
      await reserveRect(rect, { chain: "solana", address: BUYER }, CALLER);
      taken += 1;
      await expireEverything();
    }

    expect(taken, "renewal must not be free forever").toBeLessThan(10);
    // Read the ledger, not the arithmetic: every renewal left a charge.
    const charges = await query("SELECT block_id FROM hold_meter WHERE ip_hash = $1", [CALLER]);
    expect(charges).toHaveLength(taken);
  });

  it("does not spend the budget on somebody else's holds", async () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 };
    for (let attempt = 0; attempt < 4; attempt++) {
      const decision = await checkReservationLimits(OTHER, rect);
      if (!decision.ok) break;
      await reserveRect(rect, { chain: "solana", address: BUYER }, OTHER);
      await expireEverything();
    }
    expect(await checkReservationLimits(CALLER, rect)).toEqual({ ok: true });
  });
});

/**
 * The ceiling the eight-point contract's point 8 asks for, on the three signed
 * writes that had none until the contract was checked against the code.
 *
 * The counter is module-level and per process, so every case here uses an
 * address of its own — a shared one would make the order of the tests decide
 * the answers.
 */
describe("checkSignedWriteLimits", () => {
  it("allows a purchase's worth of writes and then refuses, naming when", () => {
    const caller = "signed-write-ceiling";
    for (let i = 0; i < SIGNED_WRITE_LIMITS.perWindow; i++) {
      expect(checkSignedWriteLimits(caller).ok, `attempt ${i + 1}`).toBe(true);
    }
    const refused = checkSignedWriteLimits(caller);
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && Date.parse(refused.retryAt)).toBeGreaterThan(Date.now());
  });

  it("counts per caller, so one script cannot spend anybody else's budget", () => {
    const loud = "signed-write-loud";
    for (let i = 0; i < SIGNED_WRITE_LIMITS.perWindow; i++) checkSignedWriteLimits(loud);
    expect(checkSignedWriteLimits(loud).ok).toBe(false);
    expect(checkSignedWriteLimits("signed-write-quiet").ok).toBe(true);
  });

  /**
   * A real purchase is a challenge and a confirm, and a release is a challenge
   * and a DELETE. The ceiling exists to stop a script, not a buyer, so this
   * pins that the ordinary path is nowhere near it.
   */
  it("leaves room for many more purchases than anybody makes", () => {
    expect(SIGNED_WRITE_LIMITS.perWindow).toBeGreaterThanOrEqual(4 * 5);
  });
});
