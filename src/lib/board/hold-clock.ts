/**
 * How long a hold lasts, given how big it is.
 *
 * Four callers, and no two of them could agree on this by themselves:
 *
 * - `src/lib/board/reserve.ts` writes `expires_at` from it, which makes this
 *   the rule and everything else a report of it.
 * - `src/lib/callers/limits.ts` prices a hold against the caller's pixel-minute
 *   budget, and the price is area times exactly these minutes.
 * - `src/components/BoardView.tsx` tells a buyer how long the button is about
 *   to hold their rectangle, before they press it.
 * - `src/app/faq/page.tsx` answers the same question in prose.
 *
 * It is its own module rather than part of `reserve.ts` because two of those
 * four run in the browser, and `reserve.ts` reaches for the connection pool.
 * Nothing is imported here on purpose: the rule is arithmetic and must stay
 * safe to bundle.
 */

/**
 * The ceiling, and what an ordinary purchase still gets.
 *
 * Thirty minutes exists so a person can find a photograph, crop it, and get a
 * wallet open. That argument is about a human, not about a rectangle, so it
 * does not grow with area — and the whole reason the number is a ceiling
 * rather than a constant is that it should not.
 */
export const RESERVATION_MINUTES = 30;

/**
 * The floor. A large hold still has to be long enough to finish a real
 * purchase in, or the mitigation has become the bug: a buyer who cannot
 * complete a $10,000 rectangle inside the clock is a buyer we refused.
 */
export const SHORT_HOLD_MINUTES = 10;

/**
 * The pivot, in pixel-minutes: the area-times-duration a hold is allowed
 * before its clock starts shortening.
 *
 * 75,000 puts the full thirty minutes on everything up to 2,500 pixels — a
 * 50 x 50 rectangle, and comfortably every ordinary purchase — and shortens
 * from there: 15 minutes at 5,000 pixels, and the ten-minute floor from 7,500
 * up. A hold big enough to be worth taking hostage therefore reopens sooner
 * than a small one, which is the point.
 */
export const HOLD_PIXEL_MINUTES = 75_000;

/**
 * The minutes a hold of this many pixels gets.
 *
 * Whole minutes, because the buyer reads it as a sentence and a countdown
 * reads it as a clock, and neither wants 12.5.
 */
export function holdMinutes(pixels: number): number {
  if (!Number.isFinite(pixels) || pixels <= 0) return SHORT_HOLD_MINUTES;
  const scaled = Math.floor(HOLD_PIXEL_MINUTES / pixels);
  return Math.min(RESERVATION_MINUTES, Math.max(SHORT_HOLD_MINUTES, scaled));
}
