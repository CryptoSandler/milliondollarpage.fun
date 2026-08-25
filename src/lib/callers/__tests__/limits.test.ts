import { describe, expect, it } from "vitest";
import { execute, query } from "../../db";
import { RESERVATION_LIMITS, checkReservationLimits } from "../limits";

const CALLER = "a".repeat(64);
const OTHER = "b".repeat(64);

async function hold(ipHash: string, x: number, minutesLeft: number): Promise<void> {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at, ip_hash)
     VALUES ($1, 0, 10, 10, 'reserved', 1000000, 100000000, now() + ($2 || ' minutes')::interval, $3)`,
    [x, String(minutesLeft), ipHash],
  );
}

describe("checkReservationLimits", () => {
  it("allows a caller with nothing outstanding", async () => {
    expect(await checkReservationLimits(CALLER)).toEqual({ ok: true });
  });

  it("allows a caller right up to the live-hold ceiling", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller - 1; i++) {
      await hold(CALLER, i * 20, 30);
    }
    expect(await checkReservationLimits(CALLER)).toEqual({ ok: true });
  });

  it("refuses a caller already holding the maximum", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      await hold(CALLER, i * 20, 30);
    }
    const decision = await checkReservationLimits(CALLER);
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
    expect(await checkReservationLimits(CALLER)).toEqual({ ok: true });
  });

  it("sweeps expired holds first, so a blocked caller unblocks itself by waiting", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      await hold(CALLER, i * 20, -5);
    }
    expect(await checkReservationLimits(CALLER)).toEqual({ ok: true });
    const left = await query("SELECT id FROM blocks WHERE status = 'reserved'");
    expect(left, "the expired holds should be gone, not merely ignored").toEqual([]);
  });

  it("counts a paid order against nothing, because it is no longer a hold", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at, ip_hash)
       VALUES (0, 0, 10, 10, 'paid', 1000000, 100000000, NULL, $1)`,
      [CALLER],
    );
    expect(await checkReservationLimits(CALLER)).toEqual({ ok: true });
  });
});
