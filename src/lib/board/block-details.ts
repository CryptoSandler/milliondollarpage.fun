import type { BlockDetails } from "./blocks";

/**
 * Fetching one rectangle's caption and link, from the browser, on demand.
 *
 * Called by `src/components/BoardView.tsx`, which keeps the results in a map
 * and hands that map to the hover card and to `BoardCanvas`'s live region.
 * BoardView could not do this itself in one line and keep the URL honest: the
 * shape of the route belongs beside a function that names it, the way
 * `blockImageUrl` already does for the bitmap, and a fetch that answers "null"
 * for every reason at once is a rule rather than an expression.
 *
 * WHY ANYTHING IS FETCHED AT ALL. The board payload used to carry every
 * block's words. It cannot now — at a pixel per purchase there may be tens of
 * thousands of them, and a visitor reads the one under their pointer. This is
 * the trade the composite made: one bitmap for all the artwork, one small
 * request for the words of the rectangle somebody is actually looking at.
 *
 * The type comes from `./blocks.ts`, which is a server module — `import type`
 * erases at compile time, so nothing of the pool or of `pg` follows it into
 * the browser bundle. Same arrangement `BoardCanvas` already has.
 */

/**
 * Where a rectangle's words live.
 *
 * Nothing is escaped because nothing needs to be: `id` comes from a `uuid`
 * column, and the route 404s anything that is not one before it touches the
 * database.
 */
export function blockDetailsUrl(id: string): string {
  return `/api/blocks/${id}`;
}

/**
 * Where one rectangle's own page lives.
 *
 * Called by `PurchaseDialog`, which offers it on the receipt, and by
 * `src/app/b/[id]/page.tsx` for its own canonical URL. One definition rather
 * than a template literal in each, for the reason `blockImageUrl` already gives
 * next door: two places that build the same URL are two places that can come to
 * disagree about it, and this one is about to be pasted into other people's
 * pages.
 *
 * `/b/` and not `/blocks/` because it is the URL a buyer copies. Nothing is
 * escaped because `id` is a uuid, and the page 404s anything that is not one.
 */
export function blockPageUrl(id: string): string {
  return `/b/${id}`;
}

/**
 * One rectangle's words, or null.
 *
 * Null covers every reason together — a 404, a network failure, a body that
 * is not what we expect — because the caller does the same thing with all
 * three: it draws the rectangle without a caption. A hover card that said
 * "could not load" would be a worse answer than the one the board already
 * gives, which is the rectangle itself.
 */
export async function fetchBlockDetails(id: string): Promise<BlockDetails | null> {
  try {
    const response = await fetch(blockDetailsUrl(id), { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as BlockDetails;
  } catch {
    return null;
  }
}
