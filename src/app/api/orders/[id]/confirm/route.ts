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
import { verifyUsdgPayment, type PaymentVerdict } from "../../../../../lib/payments/robinhood";
import { robinhoodRailEnabled } from "../../../../../lib/payments/usdg";
import { NO_STORE, identify, isUuid, json, problem } from "../../../../../lib/http";
import { sameOwner } from "../../../../../lib/board/owner";
import { checkSignedWriteLimits } from "../../../../../lib/callers/limits";

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
 * `blocks.owner_address`. A wallet address is public by construction, so that
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
 * compared against `blocks.owner_address` as well, and neither check stands in
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
  /*
    THE ROUTE EXISTS WHEN THERE IS A WAY TO PAY, and there are two of them: the
    stub, which cannot be switched on in a deployed environment, and the
    Robinhood rail. Which one applies is decided per ORDER a few lines down —
    off its owner's chain — because a board that sells to two chains has to be
    able to say "not this way" to one of them without pretending the route is
    missing.
  */
  if (!stubPaymentsAllowed() && !robinhoodRailEnabled()) return problem(404, "Not found.");

  const { id } = await params;
  if (!isUuid(id)) return problem(404, "That order does not exist.");

  const caller = identify(request);
  if (!caller.ok) return problem(400, caller.message);
  /*
    POINT 8 OF THE CONTRACT: every write route on the money path is rate
    limited. This one had no ceiling at all until the contract was checked
    against the code line by line — see `DECISIONS.md`. One budget covers the
    challenge, the confirm and the release, because they are steps of one act.
  */
  const limit = checkSignedWriteLimits(caller.ipHash);
  if (!limit.ok) {
    const seconds = Math.max(1, Math.ceil((Date.parse(limit.retryAt) - Date.now()) / 1000));
    return problem(429, limit.message, { retryAt: limit.retryAt }, { "retry-after": String(seconds) });
  }


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
  /*
    BOTH HALVES OF THE OWNER, and `sameOwner` is where that is written once.
    Comparing addresses alone is the shape this code had before migration 016
    and is the bug that migration exists to prevent: the same twenty bytes
    proved on one chain would have satisfied a rectangle owned on the other.
  */
  if (proven === null || !sameOwner(proven, { chain: order.ownerChain, address: order.ownerAddress })) {
    return problem(403, UNSIGNED);
  }

  /*
    ONE VERIFIER PER CHAIN, PICKED BY THE ORDER'S OWN OWNER — never by anything
    in the request. A rectangle held on Robinhood Chain is settled by a transfer
    read back off that chain; anything else falls to the stub, which is refused
    outright on a deployed instance and is the only reason this branch exists at
    all before a Solana rail is built.
  */
  const verified =
    order.ownerChain === "robinhood" && robinhoodRailEnabled()
      ? await verifyUsdgPayment(order, (body as { txHash?: unknown }).txHash)
      : stubAsVerdict(await stubVerifyPayment(order));

  if (!verified.ok) {
    // A node we cannot reach is OUR problem and is worth retrying; a hash that
    // is not a hash is the caller's; everything else is a payment that exists
    // but does not settle this rectangle.
    if (verified.reason === "unavailable") return problem(503, verified.message);
    if (verified.reason === "malformed") return problem(400, verified.message);
    return problem(409, verified.message);
  }

  try {
    const paid = await markPaid(id, proven.address, verified.signature);
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

/**
 * The stub's answer in the rail's shape, so this route has one verdict type.
 *
 * The stub predates the rail and says `{ ok, reason }` where the rail says
 * `{ ok, reason, message }`. Adapting here rather than editing `payment-stub.ts`
 * keeps the module that will be DELETED from growing a vocabulary it only needs
 * in order to be deleted.
 */
function stubAsVerdict(
  result: { ok: true; signature: string } | { ok: false; reason: string },
): PaymentVerdict {
  if (result.ok) return result;
  return { ok: false, reason: "no_matching_transfer", message: result.reason };
}
