import type { PoolClient } from "pg";
import { execute, query } from "../db";

/**
 * The pixel-minute ledger: what keeping pixels off the board costs a caller.
 *
 * Three callers, and none of them could keep this themselves:
 *
 * - `src/lib/board/reserve.ts` charges a hold the moment it inserts one, on
 *   its own transaction's connection — so a reservation that loses the race to
 *   the exclusion constraint is rolled back without ever being charged.
 * - `src/lib/callers/limits.ts` reads a caller's spend and refuses a hold that
 *   would take them past their budget. It cannot compute the spend from
 *   `blocks`, because the rows it would have to count have been deleted.
 * - `src/lib/board/orders.ts` settles a charge when a hold is given back or
 *   turns into a sale.
 *
 * Why a table at all: `migrations/008_hold_meter.sql` has the long version. The
 * short one is that the sweep DELETEs expired holds and must, so a charge kept
 * on the block row is a charge that an attacker clears by waiting half an hour.
 */

/**
 * How long a settled charge is kept after it has left every window that could
 * still read it.
 *
 * Twice the longest rolling window any caller of `spentPixelMinutes` uses,
 * which is `RESERVATION_LIMITS.windowMinutes`. Doubling it rather than matching
 * it means a window that is widened by a constant edit does not silently start
 * reading a table that has already thrown the rows away — it reads short
 * numbers, which favours the caller, which is the wrong direction to fail in.
 * Raise this if the window is ever raised past half of it.
 */
export const METER_RETENTION_MINUTES = 2 * 60;

/**
 * Records what a new hold will cost its caller, on the caller's own connection.
 *
 * Takes a client rather than the pool because this must live or die with the
 * INSERT it accompanies. A charge written outside the reservation's transaction
 * would survive a rectangle that was never actually held — the exclusion
 * constraint refuses one of two racing callers, and the loser must walk away
 * owing nothing.
 *
 * THE AREA AND THE CLOCK ARE READ OFF THE BLOCK, not handed in. `w * h` and
 * `expires_at` come out of the row this charge is for, in the same statement
 * that writes the charge, so the ledger cannot disagree with the hold it is
 * pricing. Passing the expiry in through JavaScript did exactly that once:
 * `timestamptz` keeps microseconds and a `Date` keeps milliseconds, so the two
 * were a few microseconds apart every time.
 *
 * The prune rides along in the same statement, scoped to this caller: it is
 * their own rows, they are already the ones being written, and it costs no
 * extra round trip. Nothing schedules a sweep of this table because nothing has
 * to — a caller who never comes back has at most a handful of rows, and a
 * caller who does comes back and clears them.
 */
export async function chargeHold(
  client: PoolClient,
  charge: { blockId: string; ipHash: string },
): Promise<void> {
  await client.query(
    `WITH pruned AS (
       DELETE FROM hold_meter
        WHERE ip_hash = $2
          AND charged_until < now() - ($3 || ' minutes')::interval
     )
     INSERT INTO hold_meter (block_id, ip_hash, pixels, charged_until)
     SELECT id, $2, w * h, expires_at
       FROM blocks
      WHERE id = $1 AND expires_at IS NOT NULL`,
    [charge.blockId, charge.ipHash, String(METER_RETENTION_MINUTES)],
  );
}

export type Spend = {
  /** Pixel-minutes this caller has spent inside the window. */
  pixelMinutes: number;
  /**
   * When the oldest charge still inside the window leaves it entirely — the
   * first moment this caller's spend is certain to have fallen. Null when
   * there is nothing charged, in which case there is nothing to wait for.
   *
   * It is a hint for `retry-after`, not a promise: later charges may still
   * hold the budget down past it.
   */
  easesAt: Date | null;
};

/**
 * What one caller has spent in the last `windowMinutes`, in pixel-minutes.
 *
 * A row contributes the part of its charged interval that lies inside the
 * window, so a charge decays out gradually rather than falling off a cliff,
 * and a live hold contributes the minutes it has already committed to as well
 * as the ones it has used. That last part is deliberate: a hold that has just
 * been created has already taken those pixels off the board for its whole
 * clock, and a budget that only counted elapsed time would let a caller open
 * the maximum hold on every rectangle at once and pay for it a minute later.
 */
export async function spentPixelMinutes(ipHash: string, windowMinutes: number): Promise<Spend> {
  const rows = await query<{ pixel_minutes: string | null; oldest_charged_until: Date | null }>(
    `SELECT SUM(
              pixels
              * EXTRACT(EPOCH FROM (charged_until - GREATEST(started_at, now() - $2::interval)))
              / 60
            )::text AS pixel_minutes,
            MIN(charged_until) AS oldest_charged_until
       FROM hold_meter
      WHERE ip_hash = $1
        AND charged_until > now() - $2::interval`,
    [ipHash, `${windowMinutes} minutes`],
  );

  const row = rows[0];
  const oldest = row?.oldest_charged_until ?? null;
  return {
    pixelMinutes: Math.round(Number(row?.pixel_minutes ?? 0)),
    easesAt: oldest === null ? null : new Date(oldest.getTime() + windowMinutes * 60_000),
  };
}

/**
 * A hold handed back stops costing now.
 *
 * `LEAST` rather than a plain assignment, so releasing a hold that has already
 * expired cannot extend its charge past what it actually was.
 */
export async function endHoldCharge(blockId: string): Promise<void> {
  await execute(
    "UPDATE hold_meter SET charged_until = LEAST(charged_until, now()) WHERE block_id = $1",
    [blockId],
  );
}

/**
 * A hold that became a sale never cost anything.
 *
 * The budget exists to price pixels taken off the board and not paid for.
 * Somebody who pays has taken those pixels off the board permanently and given
 * us the money for them, and charging that against the allowance they need to
 * buy the next rectangle would make this limit a tax on buying.
 */
export async function cancelHoldCharge(blockId: string): Promise<void> {
  await execute("UPDATE hold_meter SET charged_until = started_at WHERE block_id = $1", [blockId]);
}
