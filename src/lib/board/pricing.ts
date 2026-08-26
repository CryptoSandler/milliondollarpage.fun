/**
 * Money, in integer base units, always.
 *
 * A price of $1 is 1_000_000, not 1. Nothing here converts to a float and
 * back: 0.1 + 0.2 is a famous joke everywhere except in a checkout, and the
 * number the buyer is asked to send has to be the number we compute.
 */

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
