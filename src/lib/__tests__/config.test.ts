import { afterEach, describe, expect, it } from "vitest";
import {
  assertRobinhoodRailConfigured,
  assertStubPaymentsNotInProduction,
  assertUntrustedClientIpNotInProduction,
} from "../config";

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
const TREASURY = process.env.ROBINHOOD_TREASURY_ADDRESS;
const RAIL = process.env.ROBINHOOD_PAYMENTS;
const RPC = process.env.ROBINHOOD_RPC_URL;

function set(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  set("NODE_ENV", NODE_ENV);
  set("ALLOW_STUB_PAYMENTS", STUB);
  set("ALLOW_UNTRUSTED_CLIENT_IP", UNTRUSTED);
  set("ROBINHOOD_TREASURY_ADDRESS", TREASURY);
  set("ROBINHOOD_PAYMENTS", RAIL);
  set("ROBINHOOD_RPC_URL", RPC);
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
    for (const env of ["development", "test"]) {
      set("NODE_ENV", env);
      expect(() => assertStubPaymentsNotInProduction(), String(env)).not.toThrow();
    }
  });

  /**
   * This case used to sit in the loop above, asserting that an UNSET `NODE_ENV`
   * was a developer and the flag was fine. The 2026-08-28 audit is why it moved
   * and inverted: the guard now asks whether it has been shown proof this is a
   * developer's machine, and an absent value is not proof of anything. A bare
   * container with no `NODE_ENV` is a deploy, and this flag makes every
   * rectangle on the board free.
   *
   * The cost of the new answer is that a developer running a bare script has to
   * set one variable. The cost of the old one was silent free pixels.
   */
  it("treats an unset NODE_ENV as deployed rather than as a developer", () => {
    set("ALLOW_STUB_PAYMENTS", "true");
    set("NODE_ENV", undefined);
    expect(() => assertStubPaymentsNotInProduction()).toThrow(/ALLOW_STUB_PAYMENTS/);
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

/**
 * The treasury, which is the one value that cannot have a default.
 *
 * WHAT THIS GUARDS. A rail switched on with nowhere to send the money takes
 * USDG from buyers and credits rectangles against a transfer to nobody. The
 * owner asked for the treasury to be an empty variable "with a test that
 * refuses to start without it"; this is that test, and the scoping — tied to
 * the rail being switched on rather than firing on every deploy — is recorded
 * in `DECISIONS.md` and argued in the function's own comment, because this site
 * has no payment rail at all today and an unconditional guard would take it
 * down at the next deploy.
 */
describe("assertRobinhoodRailConfigured", () => {
  it("refuses to start with the rail on and no treasury", () => {
    set("ROBINHOOD_PAYMENTS", "true");
    set("ROBINHOOD_TREASURY_ADDRESS", "");
    set("ROBINHOOD_RPC_URL", "https://node.example");
    expect(() => assertRobinhoodRailConfigured()).toThrow(/ROBINHOOD_TREASURY_ADDRESS/);
  });

  it("refuses to start with the rail on and no node to read payments from", () => {
    set("ROBINHOOD_PAYMENTS", "true");
    set("ROBINHOOD_TREASURY_ADDRESS", "0x1111111111111111111111111111111111111111");
    set("ROBINHOOD_RPC_URL", "");
    expect(() => assertRobinhoodRailConfigured()).toThrow(/ROBINHOOD_RPC_URL/);
  });

  /**
   * A typo in an address is worse than an empty one: it boots, it takes money,
   * and the money lands where nobody holds a key. So the shape is checked
   * whenever a value is present — rail on or off, deployed or not.
   */
  it("refuses a malformed treasury even with the rail switched off", () => {
    set("ROBINHOOD_PAYMENTS", undefined);
    set("ROBINHOOD_RPC_URL", "");
    for (const bad of [
      "0x111",
      "1111111111111111111111111111111111111111",
      "0x111111111111111111111111111111111111111g",
      "0x11111111111111111111111111111111111111112",
    ]) {
      set("ROBINHOOD_TREASURY_ADDRESS", bad);
      expect(() => assertRobinhoodRailConfigured(), bad).toThrow(/EVM address/);
    }
  });

  it("starts with the rail off and the treasury empty, which is today", () => {
    set("ROBINHOOD_PAYMENTS", undefined);
    set("ROBINHOOD_TREASURY_ADDRESS", "");
    set("ROBINHOOD_RPC_URL", "");
    expect(() => assertRobinhoodRailConfigured()).not.toThrow();
  });

  it("starts with the rail on and both values present", () => {
    set("ROBINHOOD_PAYMENTS", "true");
    set("ROBINHOOD_TREASURY_ADDRESS", "0x1111111111111111111111111111111111111111");
    set("ROBINHOOD_RPC_URL", "https://node.example");
    expect(() => assertRobinhoodRailConfigured()).not.toThrow();
  });
});
