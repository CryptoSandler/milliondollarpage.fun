import {
  OrderNotFound,
  OrderNotReady,
  OrderNotYours,
  getOrder,
  releaseOwnReservation,
  toPublicOrder,
} from "../../../../lib/board/orders";
import { BUYER_PUBKEY_HEADER } from "../../../../lib/board/purchase-client";
import { consumeReleaseChallenge } from "../../../../lib/board/release-challenge";
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
 * The one thing every 403 here says, whatever went wrong.
 *
 * A missing signature, an expired challenge, a replayed one, a challenge
 * issued for a different order, and a signature from somebody else's wallet
 * all answer this. That is the point: a stranger walking the board must not
 * be able to tell which of those they tripped, because the differences between
 * them are facts about somebody else's order.
 */
const UNSIGNED =
  "Letting a hold go has to be signed by the wallet that started it, and this was not. " +
  "Ask for a fresh challenge and sign that.";

/**
 * Give a hold back before the thirty minutes are up.
 *
 * The one destructive endpoint on the site, and the only one whose whole job
 * is to delete a row, so every guard is stated twice: once here in the order
 * the other order routes use, and once inside `releaseOwnReservation`'s own
 * WHERE clause (see orders.ts — a paid order is undeletable there, not merely
 * refused here).
 *
 * ## What replaced the address in the body
 *
 * This route used to take `buyerPubkey` in its body and compare it to the
 * order's. That authenticated nobody. `/api/board` publishes every live
 * block's id, and a wallet address is public by construction — it is printed
 * on every explorer there is — so the whole credential was a value an
 * attacker could look up, which made releasing a stranger's rectangle a
 * two-request walk of the board.
 *
 * Now the caller signs. `POST /api/orders/:id/release-challenge` mints a
 * single-use nonce bound to this order; the wallet signs the sentence it
 * comes back with; and the proof — nonce, address, signature — travels in
 * this body. `consumeReleaseChallenge` spends the nonce and verifies the
 * signature, and only an address it hands back is compared to the order's.
 * See `src/lib/board/release-challenge.ts`; the payment step will present the
 * same proof in the same shape.
 *
 * ## The ladder, and what it deliberately does not disclose
 *
 * An id that is not a uuid and an id that names nothing both answer 404, so a
 * caller cannot tell a malformed guess from a wrong one. Anything wrong with
 * the signature answers 403, and it is checked BEFORE the order's status, so
 * a stranger gets the identical 403 whether the rectangle they are poking at
 * is held or sold — the 409 that says "this one is paid for" is only ever
 * seen by the wallet that can prove it owns it. Then, and only then, a paid
 * order answers 409 and a held one is deleted.
 *
 * The proof travels in the body rather than the URL: a query string ends up
 * in access logs, in `Referer`, and in a browser's own history, and a nonce
 * that is meant to be spent once should not be written down three times on
 * its way in. There is no `identify()` — no rate limit hangs off this, and a
 * caller without the key can neither delete anything nor learn anything by
 * trying, which is the same reason GET above is unauthenticated.
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

  const order = await getOrder(id);
  if (!order) return problem(404, "That order does not exist.");

  // The nonce is spent whatever happens next, including on a wrong key: the
  // caller presented it, so it is used up. Nothing about the order is read
  // out of this — an address comes back, or nothing does.
  const proven = await consumeReleaseChallenge(id, body);
  if (proven === null || proven !== order.buyerPubkey) return problem(403, UNSIGNED);

  try {
    await releaseOwnReservation(id, proven);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (error) {
    if (error instanceof OrderNotFound) return problem(404, error.message);
    if (error instanceof OrderNotYours) return problem(403, UNSIGNED);
    if (error instanceof OrderNotReady) return problem(409, error.message);
    throw error;
  }
}
