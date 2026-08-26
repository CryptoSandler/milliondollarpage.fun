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
 * `reserved` is deliberately absent (see above) and `removed` is absent
 * because a moderated block's rectangle is back on sale — its bytes must stop
 * being served the moment it is removed, not linger behind a cached URL.
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
 * "This row's own words are public", as SQL.
 *
 * The status half of `hasPublicImageSql`, on its own, because a caption and a
 * link have no `pending_image` to also require. `listLiveBlocks` wraps it
 * around `caption` and `link` in a CASE, so a held block comes back with
 * both columns null rather than being filtered out of the board entirely — a
 * hold still has to be drawn, it just has nothing to say.
 *
 * `statusesParam` is the same 1-based bind position, carrying the same
 * `IMAGE_BEARING_STATUSES` array. Nothing is spliced into the string.
 */
export function publishesTextSql(statusesParam: number): string {
  return `status = ANY($${statusesParam})`;
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
