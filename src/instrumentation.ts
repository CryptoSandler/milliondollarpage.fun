/**
 * Runs once when a real Next.js server instance boots — not during `next
 * build`'s page-data collection, which imports route modules but never
 * calls this hook. That distinction is why the stub-payments guard lives
 * here rather than at the top of `payment-stub.ts`: a throw there would
 * fail the build itself the moment any route imports that module.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const {
    assertStubPaymentsNotInProduction,
    assertUntrustedClientIpNotInProduction,
    assertPaymentClusterNotMisconfigured,
  } = await import("./lib/config");
  assertStubPaymentsNotInProduction();
  assertUntrustedClientIpNotInProduction();
  assertPaymentClusterNotMisconfigured();
}
