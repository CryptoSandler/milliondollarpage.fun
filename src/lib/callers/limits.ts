import { query } from "../db";
import { sweepExpiredReservations } from "../board/blocks";

/**
 * Ceilings on reservation creation, and on content submission.
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
 *
 * The sweep is convenience, not correctness, for the counts below: each count
 * also filters expiry itself, the same way `blocks.ts`'s LIVE predicate does,
 * so a caller is never over-counted merely because a sweep has not run yet.
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

export async function checkReservationLimits(ipHash: string): Promise<LimitDecision> {
  await sweepExpiredReservations();

  const live = await query<{ count: string; next_expiry: Date | null }>(
    `SELECT COUNT(*)::text AS count, MIN(expires_at) AS next_expiry
       FROM blocks
      WHERE status = 'reserved' AND ip_hash = $1
        AND expires_at IS NOT NULL AND expires_at > now()`,
    [ipHash],
  );

  if (Number(live[0]?.count ?? 0) >= RESERVATION_LIMITS.liveHoldsPerCaller) {
    const next = live[0]?.next_expiry;
    return {
      ok: false,
      reason: "too_many_live",
      message: `You are already holding ${RESERVATION_LIMITS.liveHoldsPerCaller} rectangles. Finish one, or let one go — your own holds are marked on the board.`,
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

/**
 * Ceiling on content submission, per caller.
 *
 * A content submission does not create a row the way a reservation does —
 * `attachContent` overwrites the same order's `pending_image` on every
 * resubmission, and an unauthenticated stranger can also point this at a
 * uuid that names no order at all. Neither case leaves anything in `blocks`
 * to count, so this cannot be built as another query against that table the
 * way `checkReservationLimits` is: it would need a new table or column to
 * record each attempt, and this fix wave must not carry a schema migration
 * that would need applying to a live database as a side effect of a bug fix.
 *
 * So this one counts in memory instead, per running process. That is a real
 * gap in a deployment with more than one instance — each instance has its
 * own count — but it still stops a single sustained script from hammering
 * one process, which is strictly better than the no-limit-at-all this route
 * had before. `RESERVATION_LIMITS` above stays the DB-backed source of truth
 * for anything that actually is a row in `blocks`.
 */
export const CONTENT_SUBMISSION_LIMITS = {
  perWindow: 20,
  windowMinutes: 10,
} as const;

const recentContentSubmissions = new Map<string, number[]>();

export function checkContentSubmissionLimits(ipHash: string): LimitDecision {
  const now = Date.now();
  const windowMs = CONTENT_SUBMISSION_LIMITS.windowMinutes * 60_000;
  const timestamps = (recentContentSubmissions.get(ipHash) ?? []).filter((t) => t > now - windowMs);

  if (timestamps.length >= CONTENT_SUBMISSION_LIMITS.perWindow) {
    recentContentSubmissions.set(ipHash, timestamps);
    return {
      ok: false,
      reason: "too_many_recent",
      message: "Too many content submissions recently. Try again later.",
      retryAt: new Date(timestamps[0] + windowMs).toISOString(),
    };
  }

  timestamps.push(now);
  recentContentSubmissions.set(ipHash, timestamps);
  return { ok: true };
}
