import { assertStubPaymentsNotInProduction } from "../config";
import type { Order } from "./orders";

/**
 * The payment step, until batch 3 makes it real.
 *
 * This verifies nothing. It exists so the state machine, the dialog and the
 * confirmation screen can be built and driven end to end before a wallet, a
 * treasury or an RPC proxy exist. Batch 3 replaces this module wholesale with
 * an on-chain USDC verifier; the call site does not change.
 *
 * It is gated on an environment flag that fails startup in production, so the
 * route that uses it does not merely refuse there — it does not exist. The
 * check runs the moment this module is loaded, not on first call.
 */
assertStubPaymentsNotInProduction();

export function stubPaymentsAllowed(): boolean {
  return process.env.ALLOW_STUB_PAYMENTS?.trim() === "true";
}

export async function stubVerifyPayment(
  order: Order,
): Promise<{ ok: true; signature: string } | { ok: false; reason: string }> {
  if (!stubPaymentsAllowed()) {
    return { ok: false, reason: "Stub payments are not enabled." };
  }
  if (!order.hasContent) {
    return { ok: false, reason: "This order has no content yet." };
  }
  return { ok: true, signature: `stub-${order.id}` };
}
