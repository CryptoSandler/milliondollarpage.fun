/**
 * The palette of the two things this site sends to other people's pages.
 *
 * WHO CALLS THIS: `share-card.ts`, which composes the 1200×630 card a shared
 * link unfurls into, and `badge.ts`, which draws the small SVG a buyer pastes
 * on their own site. Neither could hold it alone: they are the same object seen
 * at two sizes, and two files carrying the same six hexes are two files that
 * come to disagree about them.
 *
 * COPIED FROM DESIGN.md RATHER THAN READ FROM IT, for the reason
 * `schema-version.ts` already wrote down: the document is not traced into the
 * serverless bundle, so a runtime read works on a laptop and finds nothing in
 * production. These are the light register's `canvas`, `hairline-strong`,
 * `ink`, `body` and `primary` at the values the stylesheet currently sets, and
 * **they move with the register or the card stops matching the wall it
 * advertises.**
 *
 * IT IS THE LIGHT REGISTER IN BOTH THEMES, and that is deliberate: a card and a
 * badge are read on somebody else's page, where this site's `data-theme` does
 * not reach and where a near-black slab reads as a hole rather than as a
 * register. It is the same argument the purchase panel already carries in
 * `DECISIONS.md` — the receipt is white in both themes because it is the
 * receipt.
 */
export const OFF_SITE = {
  ground: "#f3ede0",
  line: "#c9baa0",
  ink: "#2b241c",
  body: "#6b6154",
  quiet: "#827968",
  accent: "#c2451e",
} as const;
