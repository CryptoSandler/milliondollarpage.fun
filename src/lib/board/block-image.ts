/**
 * Who is allowed to see a block's bitmap, and where that bitmap lives.
 *
 * Called by `src/components/BoardCanvas.tsx` (which points an `Image` at
 * `blockImageUrl` for every block the board says has one), by
 * `listLiveBlocks` and `getBlockImage` in `./blocks.ts` (which share
 * `hasPublicImageSql`, so the board can never advertise a URL the route would
 * refuse), and by `src/app/api/blocks/[id]/image/route.ts` through those.
 *
 * THE RULE: a reservation's upload is not public. A `reserved` block is
 * unpaid, unfinished content that may never be bought, and serving it would
 * let anyone with a block id scrape what a stranger is halfway through
 * uploading. Only a sale publishes pixels.
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
  return `(status = ANY($${statusesParam})
             AND pending_image IS NOT NULL
             AND pending_image_mime IS NOT NULL)`;
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
