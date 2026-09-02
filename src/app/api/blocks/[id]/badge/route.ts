import { renderBadge } from "../../../../../lib/board/badge";
import { getBlockPage } from "../../../../../lib/board/blocks";
import { isUuid, problem } from "../../../../../lib/http";

/**
 * The badge a buyer pastes on their own site.
 *
 * WHO CALLS THIS: somebody else's page. Nothing in this repository fetches it —
 * `src/app/b/[id]/page.tsx` prints the snippet that points here, and the buyer
 * copies it. That is the whole mechanism.
 *
 * ## It publishes exactly what the page and the card publish
 *
 * `getBlockPage` decides, which is `publishesTextSql` — so a hold has no badge
 * and neither has a rectangle whose content has been taken down. All three
 * surfaces agree by sharing the predicate rather than by three files each
 * remembering it.
 *
 * **A takedown breaks the badge on the buyer's page, on purpose.** It becomes a
 * 404 and their `<img>` shows nothing. A badge that kept working would be this
 * site vouching, on somebody else's page, for content it has removed.
 *
 * ## No rate limit, and the reason is the cost
 *
 * The card route next door has one because it composes two images with `sharp`,
 * which is the most expensive read here. This is a primary-key lookup and a
 * string — the same cost as `/api/blocks/<id>`, which has no limiter either —
 * and the immutable header below means the CDN answers it rather than us. If
 * that ever stops being true, the card's fixed window is the thing to copy.
 *
 * ## Cached like the bitmap and the card, and for the same reason
 *
 * A year, immutable. What this draws is the rectangle's two dimensions, and
 * those are frozen the moment the block is paid for. The one way it stops being
 * correct is a takedown, which is why a takedown is a cache purge and not only
 * a database update.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  // The same ladder every `[id]` route walks: a non-uuid answers the SAME 404
  // an absent id gets, rather than reaching Postgres and raising 22P02 as an
  // unauthenticated 500.
  if (!isUuid(id)) return problem(404, "That block has no badge.");

  const block = await getBlockPage(id);
  if (!block) return problem(404, "That block has no badge.");

  const badge = renderBadge(block);

  return new Response(badge.svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
      // Every byte of this document is written by `badge.ts` out of two
      // integers, and it still says nosniff: the header is the contract, and a
      // contract that holds only while the current implementation is careful is
      // not one.
      "x-content-type-options": "nosniff",
      // The document references nothing and runs nothing. This says so where a
      // browser can enforce it, so an edit that adds a remote font or a script
      // fails in the page rather than in review.
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
