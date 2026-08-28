import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPaymentClusterNotMisconfigured,
  assertStubPaymentsNotInProduction,
  assertUntrustedClientIpNotInProduction,
  isDeployed,
} from "../config";

/**
 * The guards that decide whether a dangerous flag is allowed to be on.
 *
 * WHY THESE EXIST AS TESTS. The 2026-08-28 audit found both asserts keyed on
 * `NODE_ENV === "production"`, which Next's launcher does not normalise: under
 * `NODE_ENV=staging` they were silent, and a silent stub-payments guard means
 * anybody can mark any order paid. The cases below are that bug, written down
 * so it cannot come back.
 */
afterEach(() => vi.unstubAllEnvs());

describe("isDeployed", () => {
  it("treats a developer's machine as not deployed", () => {
    vi.stubEnv("VERCEL_ENV", "");
    for (const node of ["development", "test"]) {
      vi.stubEnv("NODE_ENV", node);
      expect(isDeployed(), node).toBe(false);
    }
  });

  it("treats an unfamiliar NODE_ENV as deployed, because a typo must not disarm a guard", () => {
    vi.stubEnv("VERCEL_ENV", "");
    for (const node of ["production", "staging", "prod", "Production", ""]) {
      vi.stubEnv("NODE_ENV", node);
      expect(isDeployed(), node || "(empty)").toBe(true);
    }
  });

  it("treats every Vercel environment as deployed, previews included", () => {
    // A preview is a public URL. Stub payments there are as free as in production.
    vi.stubEnv("NODE_ENV", "development");
    for (const env of ["production", "preview", "development"]) {
      vi.stubEnv("VERCEL_ENV", env);
      expect(isDeployed(), env).toBe(true);
    }
  });
});

describe("the dangerous flags", () => {
  it("refuses stub payments under a NODE_ENV that is not the word production", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("ALLOW_STUB_PAYMENTS", "true");
    expect(() => assertStubPaymentsNotInProduction()).toThrow(/ALLOW_STUB_PAYMENTS/);
  });

  it("refuses stub payments on a Vercel preview", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("ALLOW_STUB_PAYMENTS", "true");
    expect(() => assertStubPaymentsNotInProduction()).toThrow(/ALLOW_STUB_PAYMENTS/);
  });

  it("still lets a developer run both flags locally", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_STUB_PAYMENTS", "true");
    vi.stubEnv("ALLOW_UNTRUSTED_CLIENT_IP", "true");
    expect(() => assertStubPaymentsNotInProduction()).not.toThrow();
    expect(() => assertUntrustedClientIpNotInProduction()).not.toThrow();
  });
});

describe("the cluster pin", () => {
  it("refuses a deployed instance pointed at anything but mainnet", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SOLANA_CLUSTER", "devnet");
    expect(() => assertPaymentClusterNotMisconfigured()).toThrow(/mainnet-beta/);

    vi.stubEnv("SOLANA_CLUSTER", "");
    vi.stubEnv("SOLANA_RPC_URL", "https://api.devnet.solana.com");
    expect(() => assertPaymentClusterNotMisconfigured()).toThrow(/test cluster/);
  });

  it("does NOT demand configuration that does not exist yet", () => {
    // There is no payment code in this repository. A presence check here would
    // refuse to start the deploy that has no payments in it.
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SOLANA_CLUSTER", "");
    vi.stubEnv("SOLANA_RPC_URL", "");
    expect(() => assertPaymentClusterNotMisconfigured()).not.toThrow();
  });

  it("leaves a developer on devnet alone", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SOLANA_CLUSTER", "devnet");
    expect(() => assertPaymentClusterNotMisconfigured()).not.toThrow();
  });
});
