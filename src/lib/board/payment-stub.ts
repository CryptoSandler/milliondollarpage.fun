import type { Order } from "./orders";

/**
 * The payment step, until batch 3 makes it real.
 *
 * This verifies nothing. It exists so the state machine, the dialog and the
 * confirmation screen can be built and driven end to end before a wallet, a
 * treasury or an RPC proxy exist. Batch 3 replaces this module wholesale with
 * an on-chain USDC verifier; the call site does not change.
 *
 * It is gated on an environment flag that fails startup in production. That
 * check lives in `src/instrumentation.ts`'s `register()`, not here: `next
 * build` statically evaluates every route module while collecting page
 * data, and this module will be imported by routes from Task 6 onward, so a
 * throw at THIS module's top level would fail the build itself rather than
 * refusing at real server startup. `register()` runs once when a server
 * instance actually boots, which build-time collection is not.
 */
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
