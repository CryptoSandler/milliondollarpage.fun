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
