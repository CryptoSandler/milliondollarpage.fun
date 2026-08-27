/**
 * Money, in integer base units, always.
 *
 * A price of $1 is 1_000_000, not 1. Nothing here converts to a float and
 * back: 0.1 + 0.2 is a famous joke everywhere except in a checkout, and the
 * number the buyer is asked to send has to be the number we compute.
 */

import { TOTAL_PIXELS } from "./geometry";

export const USDC_DECIMALS = 6;

export function totalBaseUnits(pixels: number, perPixel: number): number {
  return pixels * perPixel;
}

/**
 * Base units as display text.
 *
 * Whole dollars lose the decimals, because "$100.00" beside "$10,000.00" is
 * noise on a board where most prices are round. A fraction of a cent is shown
 * in full rather than rounded: if a price ever has one, hiding it would make
 * the displayed total disagree with the amount actually charged.
 */
export function formatUsdc(baseUnits: number): string {
  const dollars = Math.floor(baseUnits / 10 ** USDC_DECIMALS);
  const fraction = baseUnits % 10 ** USDC_DECIMALS;
  const grouped = dollars.toLocaleString("en-US");

  if (fraction === 0) return `$${grouped}`;

  const digits = fraction.toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  const padded = digits.length < 2 ? digits.padEnd(2, "0") : digits;
  return `$${grouped}.${padded}`;
}

/**
 * A sold-percentage, as display text.
 *
 * Two decimals, not the four `percentSold` itself carries — the raw number
 * stays that precise for anything that does math with it, but nobody reading
 * the board needs "10.8100%". A whole percentage drops its decimals the same
 * way `formatUsdc` drops cents on a whole dollar: "100%", not "100.00%".
 *
 * A board that has sold literally nothing reads as a plain "0%" rather than
 * "0.00%" — the zero should look like a fact, not like a measurement that
 * happens to round to nothing. But a board that HAS sold something can round
 * to 0.00% at two decimals (a handful of pixels out of a million), and
 * showing that as "0%" would be a lie in the other direction: it would claim
 * the board is untouched when it is not. That case reads as "<0.01%" — a
 * floor, not a rounding.
 */
export function formatPercentSold(percent: number): string {
  if (percent === 0) return "0%";

  const rounded = Math.round(percent * 100) / 100;
  if (rounded === 0) return "<0.01%";

  return `${Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2)}%`;
}

/**
 * THE WALL'S OWN LINE, and the whole product in one sentence.
 *
 * `1,000,000 pixels · $1 per pixel · yours forever` — the offer, the price and
 * the term, and nothing else. Every clause has something under it: the million
 * is `TOTAL_PIXELS`, which is the board's two dimensions multiplied rather
 * than a number anybody typed; the price is the settings row the checkout
 * charges from, so a board that ever charged something else could not end up
 * with a header disagreeing with its own till; and "yours forever" is the
 * sentence `SECURITY.md` opens with, held up by a trigger for ownership and a
 * CHECK for expiry.
 *
 * WHAT IT MUST NEVER SAY. Nothing about revenue: not a million dollars raised,
 * not a total, not an implied one. Selling a million pixels at a dollar is
 * what is on offer; what it adds up to is arithmetic somebody else can do, and
 * putting it on the wall would turn an offer into a forecast.
 */
export function offerLine(perPixel: number): string {
  return `${TOTAL_PIXELS.toLocaleString("en-US")} pixels · ${formatUsdc(perPixel)} per pixel · yours forever`;
}

/**
 * What may be selected, said where somebody is selecting.
 *
 * A different sentence from `offerLine` and deliberately so: the bar states
 * the offer, and the controls answer the question a buyer has with a pointer
 * in their hand, which is what shapes and sizes they are allowed to draw. Both
 * still come from here, so neither is a wording a component invented.
 *
 * It says "a pixel" because the pixel is now what is actually for sale. It
 * used to say the opposite — "sold in 10×10 blocks · $100 each" — and that
 * sentence was true then and is a lie now: there is no block, no grid and no
 * minimum, and a buyer who wants one pixel for one dollar can have exactly
 * that.
 */
export function unitOfSale(perPixel: number): string {
  return `${formatUsdc(perPixel)} a pixel · any rectangle, from one pixel up`;
}
