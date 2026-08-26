import { afterEach, describe, expect, it } from "vitest";
import { assertStubPaymentsNotInProduction, assertUntrustedClientIpNotInProduction } from "../config";

/**
 * The two flags that must never survive a trip to production, and the two
 * assertions that stop them.
 *
 * There is already a test that `POST /api/orders/:id/confirm` answers 404 when
 * `ALLOW_STUB_PAYMENTS` is unset ("does not exist at all when stub payments
 * are disabled", in src/app/api/__tests__/orders-api.test.ts). That is a
 * DIFFERENT thing and it does not cover this: it proves the route hides when
 * the flag is off, not that the server refuses to boot when the flag is on in
 * production. The dangerous configuration is the one where the flag IS set —
 * the route is wide open then, and the only thing standing in front of it is
 * the assertion below, called from src/instrumentation.ts before a single
 * request is served.
 *
 * `process.env.NODE_ENV` is written directly rather than through `vi.stubEnv`,
 * because these functions read it at call time and the point is to reproduce
 * exactly what a production boot would hand them.
 */

const NODE_ENV = process.env.NODE_ENV;
const STUB = process.env.ALLOW_STUB_PAYMENTS;
const UNTRUSTED = process.env.ALLOW_UNTRUSTED_CLIENT_IP;

function set(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  set("NODE_ENV", NODE_ENV);
  set("ALLOW_STUB_PAYMENTS", STUB);
  set("ALLOW_UNTRUSTED_CLIENT_IP", UNTRUSTED);
});

describe("assertStubPaymentsNotInProduction", () => {
  it("refuses to start in production with stub payments enabled", () => {
    set("NODE_ENV", "production");
    set("ALLOW_STUB_PAYMENTS", "true");
    expect(() => assertStubPaymentsNotInProduction()).toThrow();
  });

  it("refuses whatever the flag says, not only the word true", () => {
    // The flag is a presence check, not an equality one. "false", "0" and a
    // stray space are all somebody trying to turn it off and failing; the
    // stub itself only honours "true", but a boot that lets any of these
    // through is a boot that let an unverified payment path into production.
    set("NODE_ENV", "production");
    for (const value of ["true", "1", "false", "0", "yes", " true "]) {
      set("ALLOW_STUB_PAYMENTS", value);
      expect(() => assertStubPaymentsNotInProduction(), value).toThrow();
    }
  });

  it("says what it would have meant, not just that a flag was set", () => {
    set("NODE_ENV", "production");
    set("ALLOW_STUB_PAYMENTS", "true");
    expect(() => assertStubPaymentsNotInProduction()).toThrow(/without sending money/);
  });

  it("starts in production when the flag is absent, or empty", () => {
    set("NODE_ENV", "production");
    set("ALLOW_STUB_PAYMENTS", undefined);
    expect(() => assertStubPaymentsNotInProduction()).not.toThrow();
    set("ALLOW_STUB_PAYMENTS", "   ");
    expect(() => assertStubPaymentsNotInProduction()).not.toThrow();
  });

  it("leaves development and test alone, which is the whole point of the flag", () => {
    set("ALLOW_STUB_PAYMENTS", "true");
    for (const env of ["development", "test", undefined]) {
      set("NODE_ENV", env);
      expect(() => assertStubPaymentsNotInProduction(), String(env)).not.toThrow();
    }
  });
});

describe("assertUntrustedClientIpNotInProduction", () => {
  it("refuses to start in production with the shared rate-limit identity enabled", () => {
    set("NODE_ENV", "production");
    set("ALLOW_UNTRUSTED_CLIENT_IP", "true");
    expect(() => assertUntrustedClientIpNotInProduction()).toThrow(/single shared rate-limit/);
  });

  it("starts in production without it, and never blocks development", () => {
    set("NODE_ENV", "production");
    set("ALLOW_UNTRUSTED_CLIENT_IP", undefined);
    expect(() => assertUntrustedClientIpNotInProduction()).not.toThrow();
    set("NODE_ENV", "development");
    set("ALLOW_UNTRUSTED_CLIENT_IP", "true");
    expect(() => assertUntrustedClientIpNotInProduction()).not.toThrow();
  });
});
