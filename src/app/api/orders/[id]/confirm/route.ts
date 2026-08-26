import {
  getOrder,
  markPaid,
  OrderExpired,
  OrderNotFound,
  OrderNotReady,
  OrderNotYours,
  SignatureAlreadyUsed,
  toPublicOrder,
} from "../../../../../lib/board/orders";
import { stubPaymentsAllowed, stubVerifyPayment } from "../../../../../lib/board/payment-stub";
import { NO_STORE, identify, isUuid, json, problem } from "../../../../../lib/http";

/**
 * Confirm payment for a described order, via the batch-3 payment stub.
 *
 * The very first thing this handler does is check whether stub payments are
 * enabled at all — before looking anything up. In production, where that
 * flag is never set, this route must answer exactly as if it had never been
 * deployed: a 404, not a refusal that reveals the route exists.
 *
 * Ownership is checked immediately after the order loads, before
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

  const buyerPubkey =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>).buyerPubkey : undefined;
  if (typeof buyerPubkey !== "string" || buyerPubkey.trim() === "") {
    return problem(400, "A wallet address is required.");
  }

  const order = await getOrder(id);
  if (!order) return problem(404, "That order does not exist.");
  if (order.buyerPubkey !== buyerPubkey) return problem(403, new OrderNotYours().message);

  const verified = await stubVerifyPayment(order);
  if (!verified.ok) return problem(409, verified.reason);

  try {
    const paid = await markPaid(id, buyerPubkey, verified.signature);
    // Paid, and to its own buyer: both halves of `toPublicOrder`'s test.
    return json(toPublicOrder(paid, buyerPubkey), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OrderNotFound) return problem(404, error.message);
    if (error instanceof OrderNotYours) return problem(403, error.message);
    if (error instanceof OrderExpired) return problem(410, error.message);
    if (error instanceof OrderNotReady) return problem(409, error.message);
    if (error instanceof SignatureAlreadyUsed) return problem(409, error.message);
    throw error;
  }
}
