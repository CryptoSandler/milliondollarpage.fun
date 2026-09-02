/**
 * Who is allowed to see what a block's buyer chose, and where its bitmap
 * lives.
 *
 * Called by `src/components/BoardCanvas.tsx` (which points an `Image` at
 * `blockImageUrl` for every block the board says has one), by
 * `listLiveBlocks` and `getBlockImage` in `./blocks.ts` (which share
 * `hasPublicImageSql`, so the board can never advertise a URL the route would
 * refuse), and by `src/app/api/blocks/[id]/image/route.ts` through those.
 *
 * THE RULE: a reservation's content is not public. A `reserved` block is
 * unpaid, unfinished content that may never be bought, and serving it would
 * let anyone with a block id scrape what a stranger is halfway through
 * uploading. Only a sale publishes pixels.
 *
 * AND THE SAME RULE COVERS THE WORDS. The caption and the link are content
 * too, and for a while only the bytes were protected: a hold could carry a
 * convincing caption and a phishing link, the board served both to every
 * visitor for half an hour, the reservation was never paid for, and the whole
 * thing was repeatable for free. `publishesText` and `publishesTextSql` below
 * are that rule, and they are deliberately the SAME list as the pixels rather
 * than a second one that could drift.
 *
 * PURE, AND IT HAS TO STAY PURE. `BoardCanvas` is a client component, so
 * anything imported here is imported into the browser bundle. Importing
 * `../db` from this file drags `pg` in behind it and the page stops building
 * — which is exactly how the reads below ended up in `blocks.ts` rather than
 * here. Decisions live here; the queries that use them live next to the pool.
 */

/**
 * The statuses whose pixels are public: the two that mean somebody paid.
 *
 * `reserved` is deliberately absent (see above), and it is now the only status
 * absent. `removed` used to be the other one, on the argument that a moderated
 * block's rectangle went back on sale; migration 006 retired that status
 * outright, because a takedown must not hand a paid rectangle back to the
 * board. What a takedown is instead is `hidden_at`, and status has nothing to
 * say about it — see `notTakenDownSql` below.
 */
export const IMAGE_BEARING_STATUSES = ["paid", "minted"] as const;

export type ImageBearingStatus = (typeof IMAGE_BEARING_STATUSES)[number];

/** True when a block in this status may serve its bitmap to anyone who asks. */
export function servesImage(status: string): boolean {
  return (IMAGE_BEARING_STATUSES as readonly string[]).includes(status);
}

/**
 * True when a block in this status may publish its caption and its link.
 *
 * The same predicate as the pixels, on purpose and by construction — one
 * function, aliased, not a copy that agrees today. A caption and a link are
 * as much the buyer's content as the bitmap is, and a hold that has paid for
 * neither publishes neither.
 *
 * The owner of a hold is a separate question and is NOT asked here: this
 * takes a status and nothing else. `toPublicOrder` in `./orders.ts` is where
 * "or it is your own" gets added, because that is the only place that knows
 * who is asking.
 *
 * A TAKEDOWN IS ALSO NOT ASKED HERE, and that is the one thing to know about
 * this pair of functions. Hiding is a flag on a row, not a status, so it is
 * unreachable from a status alone — every SQL reader below adds
 * `notTakenDownSql` and every one of them must. `toPublicOrder` is the single
 * caller that is allowed to stop at the status, because the only reader it
 * serves is the block's own buyer asking about their own order.
 */
export const publishesText = servesImage;

/**
 * "This row has a bitmap the public may have", as SQL.
 *
 * One definition for the two readers that need it — `getBlockImage`, which
 * serves the bytes, and `listLiveBlocks`, which tells the board a URL exists.
 * Two hand-written copies would eventually disagree, and the way they would
 * disagree is a board advertising an image that 404s, or worse, a held block
 * advertising one it must not serve.
 *
 * `statusesParam` is the 1-based position of the bind parameter carrying
 * `IMAGE_BEARING_STATUSES`; the statuses themselves are bound, never spliced
 * into the string.
 */
export function hasPublicImageSql(statusesParam: number): string {
  return `(${publishesTextSql(statusesParam)}
             AND pending_image IS NOT NULL
             AND pending_image_mime IS NOT NULL)`;
}

/**
 * "This row has not been taken down", as SQL.
 *
 * Its own function rather than a string typed out three times, because it is
 * the half of publication that a status cannot express. Migration 006 made a
 * takedown a flag on a row that stays `paid` or `minted` — precisely so the
 * rectangle can never be resold — which means every reader that used to be
 * able to answer "may I publish this" from `status` alone now cannot.
 *
 * A legal purge nulls the bytes and the words as well, so this predicate is
 * belt and braces for that case and the whole answer for a normal takedown,
 * where every byte is still sitting in the row untouched and reversibly.
 */
export function notTakenDownSql(): string {
  return "hidden_at IS NULL";
}

/**
 * "This row's own words are public", as SQL.
 *
 * `hasPublicImageSql` without its two byte clauses, because a caption and a
 * link have no `pending_image` to also require. Both halves it does keep are
 * load-bearing: somebody paid for this rectangle, AND nobody has taken it
 * down.
 *
 * `statusesParam` is the same 1-based bind position, carrying the same
 * `IMAGE_BEARING_STATUSES` array. Nothing is spliced into the string.
 */
export function publishesTextSql(statusesParam: number): string {
  return `(status = ANY($${statusesParam}) AND ${notTakenDownSql()})`;
}

/**
 * Where a block's bitmap lives.
 *
 * One definition, so the board payload, the canvas and the route can never
 * disagree about the shape of the URL. Nothing is escaped here because
 * nothing needs to be: `id` is a uuid straight out of a `uuid` column, and
 * the route 404s anything that is not one before it touches the database.
 */
export function blockImageUrl(id: string): string {
  return `/api/blocks/${id}/image`;
}

/**
 * Where a block's share card lives.
 *
 * Here rather than in `share-card.ts` for one reason: that module imports
 * `sharp`, and a URL is a string. Anything that only needs to POINT at a card —
 * the receipt in `PurchaseDialog`, the `og:image` on `src/app/b/[id]/page.tsx` —
 * would otherwise drag an image pipeline in behind a template literal.
 *
 * Same escaping argument as above: `id` is a uuid out of a `uuid` column, and
 * the route 404s anything that is not one before it touches the database.
 */
export function shareCardUrl(id: string): string {
  return `/api/blocks/${id}/card`;
}
