import { execute, query } from "../db";

/**
 * Ceilings on reservation creation.
 *
 * Creating a hold is free and takes a rectangle off the board for half an hour,
 * which makes it the cheapest thing on this site to abuse: a script could hold
 * the whole board indefinitely for nothing.
 *
 * Every check sweeps expired holds FIRST, and that matters more than it looks.
 * Both the allow and the deny path go through the same sweep, so a caller who
 * has filled the limit unblocks itself simply by waiting, with no cleanup job
 * in the loop. The sweep is also what stops an attacker from holding a limit
 * past its own expiry window.
 */

export const RESERVATION_LIMITS = {
  /** Unpaid holds one caller may have at the same time. */
  liveHoldsPerCaller: 3,
  /** Holds one caller may create within the rolling window below. */
  createdPerWindow: 20,
  windowMinutes: 60,
} as const;

export type LimitDecision =
  | { ok: true }
  | { ok: false; reason: "too_many_live" | "too_many_recent"; message: string; retryAt: string };

async function sweepExpiredHolds(): Promise<void> {
  await execute(
    `DELETE FROM blocks
      WHERE status = 'reserved' AND (expires_at IS NULL OR expires_at <= now())`,
  );
}

export async function checkReservationLimits(ipHash: string): Promise<LimitDecision> {
  await sweepExpiredHolds();

  const live = await query<{ count: string; next_expiry: Date | null }>(
    `SELECT COUNT(*)::text AS count, MIN(expires_at) AS next_expiry
       FROM blocks
      WHERE status = 'reserved' AND ip_hash = $1`,
    [ipHash],
  );

  if (Number(live[0]?.count ?? 0) >= RESERVATION_LIMITS.liveHoldsPerCaller) {
    const next = live[0]?.next_expiry;
    return {
      ok: false,
      reason: "too_many_live",
      message: `You are already holding ${RESERVATION_LIMITS.liveHoldsPerCaller} rectangles. Finish one or let a hold expire.`,
      retryAt: (next ?? new Date(Date.now() + 60_000)).toISOString(),
    };
  }

  const recent = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM blocks
      WHERE ip_hash = $1 AND created_at > now() - ($2 || ' minutes')::interval`,
    [ipHash, String(RESERVATION_LIMITS.windowMinutes)],
  );

  if (Number(recent[0]?.count ?? 0) >= RESERVATION_LIMITS.createdPerWindow) {
    return {
      ok: false,
      reason: "too_many_recent",
      message: "Too many holds started recently. Try again later.",
      retryAt: new Date(Date.now() + RESERVATION_LIMITS.windowMinutes * 60_000).toISOString(),
    };
  }

  return { ok: true };
}
