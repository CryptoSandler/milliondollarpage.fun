import { query } from "../db";
import { sweepExpiredReservations } from "../board/blocks";
import type { Rect } from "../board/geometry";
import { holdMinutes } from "../board/hold-clock";
import { spentPixelMinutes } from "./hold-meter";

/**
 * Ceilings on reservation creation, and on content submission.
 *
 * Creating a hold is free and takes a rectangle off the board, which makes it
 * the cheapest thing on this site to abuse. It used to be abusable in one
 * request: the only ceiling was a count of rectangles, `rectIsValid` capped no
 * area, and so a single caller could hold the whole 1250 x 800 wall — a
 * million dollars of inventory at list — for nothing, and renew it twice an
 * hour forever. Three of the four limits below exist because of that, and each
 * one closes a different half of it: how many rectangles, how much AREA, and
 * for how LONG.
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
 * The pixel-minute budget is the one thing here the sweep cannot help with at
 * all, and that is exactly why it is kept in its own table — see
 * `./hold-meter.ts`.
 */

export const RESERVATION_LIMITS = {
  /** Unpaid holds one caller may have at the same time. */
  liveHoldsPerCaller: 3,
  /** Holds one caller may create within the rolling window below. */
  createdPerWindow: 20,
  windowMinutes: 60,
  /**
   * Pixels one caller may have held at any one moment, across every hold.
   *
   * 10,000, and the three reasons in the order they carried weight:
   *
   * - It is 1% of the wall. One visitor holding more than a hundredth of the
   *   inventory is not a shopper.
   * - It still fits a 100 x 100 purchase in a single rectangle. At a dollar a
   *   pixel that is a $10,000 order, which is an enormous single purchase for
   *   a wall of this size, so the ceiling sits above every plausible one.
   * - It prices the attack that used to be free. Immobilising the middle of
   *   the wall — 400 x 300, 120,000 pixels, $120,000 of inventory — was one
   *   caller and one hold; the ceiling alone makes it twelve, and the budget
   *   below makes it twenty-four.
   *
   * Counted in PIXELS rather than in rows, which is the whole correction: the
   * old limit counted three rectangles and a rectangle could be the wall.
   */
  heldPixelsPerCaller: 10_000,
  /**
   * Pixel-minutes one caller may spend inside the rolling window.
   *
   * The single budget that replaces two separate knobs. Area, duration and
   * renewal multiply into one number, so there is nothing to tune against
   * itself: a big hold, a long hold and a hold taken again and again all draw
   * on the same allowance, and the way to spend less is to hold fewer pixels
   * for less time.
   *
   * 300,000 over sixty minutes is the ceiling above held for half of every
   * hour, or — the number that actually matters — a SUSTAINED 5,000 pixels
   * per caller, since pixel-minutes divided by the window is pixels held
   * continuously. That is half a percent of the wall each, against the whole
   * wall each before this existed.
   *
   * What it costs a real buyer: nothing, in the ordinary case. A hold that
   * becomes a sale is refunded in full (`cancelHoldCharge`) and a hold given
   * back stops costing the moment it is given back (`endHoldCharge`), so the
   * budget only ever bills pixels that were taken off the board and not paid
   * for. Even a buyer who abandons the largest hold this ceiling allows can
   * do it three times an hour before it bites.
   */
  pixelMinutesPerWindow: 300_000,
} as const;

export type LimitDecision =
  | { ok: true }
  | {
      ok: false;
      reason: "too_many_live" | "too_many_pixels" | "too_many_recent" | "budget_spent";
      message: string;
      retryAt: string;
    };

type LiveHolds = {
  count: string;
  next_expiry: Date | null;
  pixels_elsewhere: string;
  resuming: boolean;
};

/**
 * Whether this caller may take this rectangle.
 *
 * Takes the rectangle, not just the caller, because two of the four limits are
 * about area and cannot be answered without it. The caller is
 * `src/app/api/reserve/route.ts`, which checks `rectIsValid` first — a
 * rectangle with no area would otherwise be priced against a budget as if it
 * had some.
 *
 * `resuming` is what keeps this from refusing a buyer their own pixels. A
 * caller who already holds EXACTLY this rectangle is about to resume that hold
 * rather than create a second one (see `resumableHold` in
 * `../board/reserve.ts`), so neither the area nor the budget may be charged
 * twice for it — otherwise pressing Buy again on a 100 x 100 you already hold
 * would answer 429 on your own rectangle.
 */
export async function checkReservationLimits(ipHash: string, rect: Rect): Promise<LimitDecision> {
  await sweepExpiredReservations();

  const pixels = rect.w * rect.h;

  const live = await query<LiveHolds>(
    `SELECT COUNT(*)::text AS count,
            MIN(expires_at) AS next_expiry,
            COALESCE(SUM(w * h) FILTER (WHERE NOT same), 0)::text AS pixels_elsewhere,
            COALESCE(bool_or(same), false) AS resuming
       FROM (
         SELECT expires_at, w, h,
                (x = $2 AND y = $3 AND w = $4 AND h = $5) AS same
           FROM blocks
          WHERE status = 'reserved' AND ip_hash = $1
            AND expires_at IS NOT NULL AND expires_at > now()
       ) live`,
    [ipHash, rect.x, rect.y, rect.w, rect.h],
  );

  const row = live[0];
  const resuming = row?.resuming ?? false;
  const nextExpiry = row?.next_expiry ?? null;
  const soon = () => (nextExpiry ?? new Date(Date.now() + 60_000)).toISOString();

  if (Number(row?.count ?? 0) >= RESERVATION_LIMITS.liveHoldsPerCaller) {
    return {
      ok: false,
      reason: "too_many_live",
      message: `You are already holding ${RESERVATION_LIMITS.liveHoldsPerCaller} rectangles. Finish one, or let one go — your own holds are marked on the board.`,
      retryAt: soon(),
    };
  }

  const heldPixels = Number(row?.pixels_elsewhere ?? 0) + (resuming ? 0 : pixels);
  if (heldPixels > RESERVATION_LIMITS.heldPixelsPerCaller) {
    return {
      ok: false,
      reason: "too_many_pixels",
      message:
        `A hold takes pixels off the board for everybody, so one visitor may hold ` +
        `${RESERVATION_LIMITS.heldPixelsPerCaller.toLocaleString("en-US")} of them at a time — a ` +
        `100 by 100 rectangle. Buy what you are holding, or let a hold go, and pick again. ` +
        `Owning more than that is fine: this counts pixels held, never pixels bought.`,
      retryAt: soon(),
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

  const spend = await spentPixelMinutes(ipHash, RESERVATION_LIMITS.windowMinutes);
  const wouldSpend = spend.pixelMinutes + (resuming ? 0 : pixels * holdMinutes(pixels));
  if (wouldSpend > RESERVATION_LIMITS.pixelMinutesPerWindow) {
    return {
      ok: false,
      reason: "budget_spent",
      message:
        "Holds are free, so there is a limit on how many pixels one visitor can keep off the " +
        "board and for how long, and yours is used up for the moment. Paying for a rectangle " +
        "you are holding clears what it cost. Otherwise the allowance comes back as your recent " +
        "holds age out.",
      retryAt: (
        spend.easesAt ?? new Date(Date.now() + RESERVATION_LIMITS.windowMinutes * 60_000)
      ).toISOString(),
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
