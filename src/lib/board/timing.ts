/**
 * How long any one request in the purchase flow may keep a screen loading.
 *
 * Shared by `PurchaseDialog` (hold, confirm, release) and `ContentForm` (the
 * upload) so all four requests race the identical clock rather than four
 * components each guessing their own number. See `with-timeout.ts` for what
 * happens at the ceiling and why it is composed under `singleFlight` rather
 * than over it.
 *
 * Ten seconds is longer than every one of these calls takes when anything is
 * working at all — the slowest of the JSON ones is a reserve, which the
 * exclusion constraint settles in under two — and short enough that a buyer
 * has not yet decided the site is broken and closed the tab. The upload
 * carries a file rather than a few bytes of JSON, so it is the one most
 * likely to still be running when this fires; it gets the same number rather
 * than a longer one; a buyer staring at a spinner does not know or care which
 * of the four requests it is.
 */
export const STEP_CEILING_MS = 10_000;
