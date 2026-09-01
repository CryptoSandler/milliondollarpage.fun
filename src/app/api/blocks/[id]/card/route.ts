import { renderShareCard } from "../../../../../lib/board/share-card";
import { identify, isUuid, problem } from "../../../../../lib/http";

/**
 * One sold rectangle as a picture somebody can post.
 *
 * Called by the browser: the receipt in `PurchaseDialog` links here, and an
 * `og:image` on a block's page would too. Nothing on the board links here, and
 * nothing should — a card is something a buyer chooses to share, not a second
 * copy of the wall.
 *
 * ## Why this route composes rather than serves
 *
 * The card is not stored. `share-card.ts` has the arithmetic; the short version
 * is that a card over a photograph weighs 116 KiB against a 100 KiB cap that
 * cannot move, so storing one is not available and composing one costs nothing
 * that is not already on disk.
 *
 * ## Cached exactly as the bitmap beside it is, and for exactly the same reason
 *
 * A year, immutable, shared caches included. These pixels are frozen the moment
 * the block is paid for: content attaches only to a reservation, a paid row is
 * never swept, and no endpoint replaces an image. The URL is keyed by the
 * block's uuid, so different pixels are always a different URL and the case
 * `immutable` would be wrong for cannot arise.
 *
 * **The one way it stops being correct is a takedown**, and `hidden_at` takes
 * this route to a 404 the moment one lands — which is why it says a year and
 * not forever, and why a takedown is a cache purge rather than only a database
 * update. That sentence is copied from `/image` deliberately: two routes
 * serving the same block's content under the same header must not have two
 * different arguments for it.
 *
 * ## The rate limit, and what it honestly does
 *
 * A GET that composes two images is the most expensive read on this site, and
 * it is reachable with any block id from `/api/board`. The immutable header
 * above already means the CDN asks the origin about a given block roughly once,
 * so the traffic worth bounding is a caller walking many ids at once.
 *
 * ponytail: a fixed window in this process's memory, keyed by the same salted
 * caller hash the reservation limiter counts against. IT IS PER INSTANCE, which
 * on serverless means a determined caller spread across cold starts gets more
 * than the number below, and that is stated rather than papered over — the
 * point is to make a loop from one client expensive, not to be a distributed
 * quota. A distributed one would mean a write on a read path, which is a worse
 * trade for a route whose whole job is to be cached. If this ever needs to be
 * exact, the upgrade is the same table `presence` uses and nothing else here
 * changes.
 */

/** Cards one caller may compose per window. Generous: a person shares one. */
const CARDS_PER_WINDOW = 30;
const WINDOW_MS = 60_000;

const seen = new Map<string, { count: number; resetAt: number }>();

function withinLimit(callerHash: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const entry = seen.get(callerHash);

  if (!entry || now >= entry.resetAt) {
    // Sweep on write rather than on a timer: the map only grows while requests
    // arrive, so the requests themselves are the only clock it needs.
    for (const [key, value] of seen) if (now >= value.resetAt) seen.delete(key);
    seen.set(callerHash, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }

  if (entry.count >= CARDS_PER_WINDOW) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)) };
  }

  entry.count += 1;
  return { ok: true };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  // The same status ladder every `[id]` route walks: an id that is not a uuid
  // answers 404 rather than reaching Postgres and raising 22P02 as an
  // unauthenticated 500, and it answers the SAME 404 an absent id gets.
  if (!isUuid(id)) return problem(404, "That block has no card.");

  const caller = identify(request);
  if (!caller.ok) return problem(400, caller.message);

  const allowed = withinLimit(caller.ipHash);
  if (!allowed.ok) {
    return problem(
      429,
      "Too many cards at once. Try again in a moment.",
      {},
      { "retry-after": String(allowed.retryAfter) },
    );
  }

  const card = await renderShareCard(id);
  if (!card) return problem(404, "That block has no card.");

  return new Response(new Uint8Array(card.bytes), {
    headers: {
      "content-type": "image/png",
      "content-length": String(card.bytes.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
      // The bytes inside this card came from a stranger. The PNG wrapper is
      // ours and the content-type is exact, and this stops a browser sniffing
      // the body and deciding otherwise.
      "x-content-type-options": "nosniff",
    },
  });
}
