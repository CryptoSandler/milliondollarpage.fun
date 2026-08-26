import {
  OrderNotFound,
  OrderNotReady,
  OrderNotYours,
  getOrder,
  releaseOwnReservation,
  toPublicOrder,
} from "../../../../lib/board/orders";
import { BUYER_PUBKEY_HEADER } from "../../../../lib/board/purchase-client";
import { NO_STORE, isUuid, json, problem } from "../../../../lib/http";

/**
 * An order's current state, for polling a hold or a confirmation screen.
 *
 * Never cached: a hold's status can flip (paid, expired) between two
 * requests a few seconds apart. `getOrder` never selects `pending_image`, so
 * there is nothing here for this route to accidentally leak either.
 *
 * This route is unauthenticated by design — polling a hold's status must not
 * require proving ownership of it. That is exactly why `toPublicOrder` runs
 * before the response goes out: `/board` already publishes every live
 * block's id, so an `Order` returned here with its `buyerPubkey` intact would
 * hand anyone the one credential `/content` and `/confirm` trust.
 *
 * Unauthenticated is not the same as undiscriminating. A caller MAY offer
 * their pubkey in `x-buyer-pubkey`, and if it is the buyer's, the caption and
 * link they wrote come back with the order; if it is absent or somebody
 * else's, an unpaid hold's words do not, because a reservation is free and a
 * free hold serving a stranger's link to every visitor is exactly the abuse
 * this closes. Offering nothing is never an error — the status, the rectangle
 * and the clock answer any caller who has the id, as they always did.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return problem(404, "That order does not exist.");

  const order = await getOrder(id);
  if (!order) return problem(404, "That order does not exist.");
  return json(toPublicOrder(order, request.headers.get(BUYER_PUBKEY_HEADER)), { headers: NO_STORE });
}

/**
 * Give a hold back before the thirty minutes are up.
 *
 * The one destructive endpoint on the site, and the only one whose whole job
 * is to delete a row, so every guard is stated twice: once here in the order
 * the other order routes use, and once inside `releaseOwnReservation`'s own
 * WHERE clause (see orders.ts — a paid order is undeletable there, not merely
 * refused here).
 *
 * The status ladder is exactly the one `/content` and `/confirm` already
 * walk, and for the same reason: an id that is not a uuid and an id that
 * names nothing both answer 404, so a caller cannot tell a malformed guess
 * from a wrong one; somebody else's order answers 403 whatever state it is
 * in, so a stranger cannot learn from the status code that an order exists in
 * a state theirs is not.
 *
 * `buyerPubkey` travels in the body rather than the URL: it is the only
 * credential this codebase has, and a query string ends up in access logs and
 * `Referer` headers. There is no `identify()` here — no rate limit hangs off
 * it, and a caller without the right pubkey can neither delete anything nor
 * learn anything by trying, which is the same reason GET above is
 * unauthenticated.
 *
 * Answers 204 with no body. There is nothing left to describe: the order the
 * caller named is gone, and returning a corpse of it would only invite a
 * client to render one.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return problem(404, "That order does not exist.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "That request body is not JSON.");
  }

  const buyerPubkey =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>).buyerPubkey : undefined;
  if (typeof buyerPubkey !== "string" || buyerPubkey.trim() === "") {
    return problem(400, "A wallet address is required.");
  }

  try {
    await releaseOwnReservation(id, buyerPubkey);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (error) {
    if (error instanceof OrderNotFound) return problem(404, error.message);
    if (error instanceof OrderNotYours) return problem(403, error.message);
    if (error instanceof OrderNotReady) return problem(409, error.message);
    throw error;
  }
}
