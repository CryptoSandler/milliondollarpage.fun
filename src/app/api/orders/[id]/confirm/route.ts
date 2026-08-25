import {
  getOrder,
  markPaid,
  OrderExpired,
  OrderNotFound,
  OrderNotReady,
  OrderNotYours,
} from "../../../../../lib/board/orders";
import { stubPaymentsAllowed, stubVerifyPayment } from "../../../../../lib/board/payment-stub";
import { NO_STORE, json, problem } from "../../../../../lib/http";

/**
 * Confirm payment for a described order, via the batch-3 payment stub.
 *
 * The very first thing this handler does is check whether stub payments are
 * enabled at all — before looking anything up. In production, where that
 * flag is never set, this route must answer exactly as if it had never been
 * deployed: a 404, not a refusal that reveals the route exists.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!stubPaymentsAllowed()) return problem(404, "Not found.");

  const { id } = await params;

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

  const verified = await stubVerifyPayment(order);
  if (!verified.ok) return problem(409, verified.reason);

  try {
    const paid = await markPaid(id, buyerPubkey, verified.signature);
    return json(paid, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OrderNotFound) return problem(404, error.message);
    if (error instanceof OrderNotYours) return problem(403, error.message);
    if (error instanceof OrderExpired) return problem(410, error.message);
    if (error instanceof OrderNotReady) return problem(409, error.message);
    throw error;
  }
}
