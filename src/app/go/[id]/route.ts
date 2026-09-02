import { countClick } from "../../../lib/board/audience";
import { getBlockDetails } from "../../../lib/board/blocks";
import { isUuid } from "../../../lib/http";

/**
 * The way out of the wall, and the only one a purchased link has.
 *
 * WHO CALLS THIS: nothing in this repository links here directly — the browser
 * arrives because `BlockCard` renders a rectangle's link as `/go/<id>` rather
 * than as the address the buyer typed. That indirection is the whole feature:
 * it is what makes a click countable at all.
 *
 * ## THE DESTINATION IS NEVER TAKEN FROM THE REQUEST
 *
 * This is the one thing this file exists to get right. A redirector that reads
 * where to go from a query parameter is an open redirect: anybody can send
 * `milliondollarpage.fun/go?to=<their phishing page>` and borrow this domain's
 * name for it. There is no parameter here. The route takes an id, reads the
 * block, and redirects to the link stored ON that block — so the set of places
 * this endpoint can send anybody is exactly the set of links buyers have
 * attached, and nothing a caller writes can change it.
 *
 * `getBlockDetails` is what decides whether the link is public at all, which is
 * the same `publishesTextSql` the composite, the image route and the details
 * route use. A hold's link is not public, so a hold's `/go` is a 404 — a
 * reservation is thirty free minutes and this would otherwise make them thirty
 * free minutes of a redirect from this domain.
 *
 * ## What it costs, said out loud
 *
 * The link stops being direct. A visitor who copies it copies ours; a crawler
 * that follows it sees a 302; and a buyer who wanted their own domain in the
 * status bar does not get it. The alternative is a direct `href` with a
 * `sendBeacon` on click, which keeps the buyer's URL in the status bar and
 * loses every click from a middle-click, a long-press, a "copy link" and any
 * browser that blocks the beacon. This chose counting over cosmetics, and
 * `DECISIONS.md` carries the other option with both futures written out.
 *
 * ## Why 302 and not 301
 *
 * A permanent redirect is cached by the browser forever, and a cached redirect
 * is a click this never sees again. It is also wrong on its own terms: the
 * block's link can be replaced by its owner, and 301 would strand every visitor
 * who ever followed the old one.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  // The same ladder every `[id]` route here walks: a non-uuid answers 404
  // rather than reaching Postgres and raising 22P02 as an unauthenticated 500,
  // and it answers the SAME 404 an absent id gets.
  if (!isUuid(id)) return new Response("Not found", { status: 404 });

  const block = await getBlockDetails(id);
  if (!block || !block.link) return new Response("Not found", { status: 404 });

  /*
    COUNTED BEFORE THE REDIRECT AND AWAITED, because a serverless function is
    frozen the moment it responds: a floating promise here is a click that is
    sometimes counted and sometimes not, which is worse than one that is never
    counted because nobody can tell. A failure is swallowed rather than served —
    the visitor asked to go somewhere, and a counter that is down is not their
    problem.
  */
  try {
    await countClick(id);
  } catch {
    // See above. The redirect is the contract; the count is bookkeeping.
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: block.link,
      // Never cached, by the browser or by anything between: a cached 302 is a
      // click this endpoint never hears about again.
      "cache-control": "no-store",
      // A destination this page vouches for is not a destination this page
      // hands its own referrer to.
      "referrer-policy": "no-referrer",
    },
  });
}
