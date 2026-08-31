import {
  getOrder,
  markPaid,
  OrderExpired,
  OrderNotFound,
  OrderNotReady,
  OrderNotYours,
  SignatureAlreadyUsed,
  toProvenOrder,
} from "../../../../../lib/board/orders";
import { consumeChallenge } from "../../../../../lib/board/challenge";
import { stubPaymentsAllowed, stubVerifyPayment } from "../../../../../lib/board/payment-stub";
import { NO_STORE, identify, isUuid, json, problem } from "../../../../../lib/http";

/**
 * The one thing every 403 here says, whatever went wrong.
 *
 * The same set as `/content` next door: no proof, an expired or replayed
 * challenge, one issued for a different order or a different act, or a
 * signature from another wallet. A stranger must not be able to tell which.
 */
const UNSIGNED =
  "Settling an order has to be signed by the wallet that holds it, and this was not. " +
  "Ask for a fresh challenge and sign that.";

/**
 * Confirm payment for a described order, via the batch-3 payment stub.
 *
 * The very first thing this handler does is check whether stub payments are
 * enabled at all — before looking anything up. In production, where that
 * flag is never set, this route must answer exactly as if it had never been
 * deployed: a 404, not a refusal that reveals the route exists.
 *
 * ## What replaced the address in the body
 *
 * This route used to take `buyerPubkey` in its body and compare it against
 * `blocks.buyer_pubkey`. A wallet address is public by construction, so that
 * compared one public value with another and proved nothing — the same hole
 * `migrations/003_release_challenges.sql` closed for the DELETE and the
 * 2026-08-28 audit found still open here (F1). Now the caller asks
 * `POST /api/orders/:id/challenge` for `{"action":"pay"}`, signs the sentence
 * it returns, and presents nonce, address and signature in this body;
 * `consumeChallenge` spends the nonce and verifies the signature, and only an
 * address it hands back is compared to the order's.
 *
 * That is the client's half of proving a purchase, and it stays necessary
 * when the on-chain half lands: the payer read off a confirmed transfer is
 * compared against `blocks.buyer_pubkey` as well, and neither check stands in
 * for the other.
 *
 * Ownership is proved immediately after the order loads, before
 * `stubVerifyPayment` ever runs: a stranger who does not own this order must
 * see the exact same 403 whether the order has content or not, never a 409
 * that discloses what state somebody else's order is in.
 *
 * `identify()` runs before the body is parsed, matching `/reserve`: this is
 * the point where the site starts knowing who is confirming a payment, not
 * only who is holding a rectangle.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!stubPaymentsAllowed()) return problem(404, "Not found.");

  const { id } = await params;
  if (!isUuid(id)) return problem(404, "That order does not exist.");

  const caller = identify(request);
  if (!caller.ok) return problem(400, caller.message);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "That request body is not JSON.");
  }

  const order = await getOrder(id);
  if (!order) return problem(404, "That order does not exist.");

  // Spent before it is examined, and before anything is verified or written.
  const proven = await consumeChallenge(id, "pay", body);
  if (proven === null || proven !== order.buyerPubkey) return problem(403, UNSIGNED);

  const verified = await stubVerifyPayment(order);
  if (!verified.ok) return problem(409, verified.reason);

  try {
    const paid = await markPaid(id, proven, verified.signature);
    // Paid, and to the wallet that just proved itself: the amount it was
    // asked to send comes back with the receipt and goes nowhere else.
    return json(toProvenOrder(paid), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OrderNotFound) return problem(404, error.message);
    if (error instanceof OrderNotYours) return problem(403, UNSIGNED);
    if (error instanceof OrderExpired) return problem(410, error.message);
    if (error instanceof OrderNotReady) return problem(409, error.message);
    if (error instanceof SignatureAlreadyUsed) return problem(409, error.message);
    throw error;
  }
}
