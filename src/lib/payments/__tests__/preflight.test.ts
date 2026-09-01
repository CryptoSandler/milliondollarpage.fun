import { describe, expect, it } from "vitest";
import { preflight, solText, type PreflightInput } from "../preflight";

/**
 * A branch per outcome, because the outcome a buyer sees IS the feature.
 *
 * The failure being guarded is not "the code threw". It is a wallet opening on
 * a transaction that cannot succeed, which Phantom answers with a red banner —
 * see `docs/wallet-warnings.md`. Every case below is a reason the wallet must
 * not open, plus the sentence the buyer gets instead.
 */
const SOL = 1_000_000_000;

function input(over: Partial<PreflightInput> = {}): PreflightInput {
  return {
    balanceLamports: 2 * SOL,
    amountLamports: 1 * SOL,
    feeLamports: 5_000,
    simulation: { ok: true },
    ...over,
  };
}

describe("preflight", () => {
  it("opens the wallet when the money is there and it simulates", () => {
    expect(preflight(input())).toEqual({ ok: true });
  });

  it("refuses when the balance does not cover the amount, and names the shortfall", () => {
    const verdict = preflight(input({ balanceLamports: 0.5 * SOL, amountLamports: 1 * SOL }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe("insufficient_funds");
    // The exact shortfall, in the unit the buyer holds: 1 SOL + fee - 0.5 SOL.
    expect(verdict.message).toBe("You need 0.500005 more SOL for this.");
  });

  it("counts the FEE, so a balance equal to the amount is still short", () => {
    // The commonest near-miss there is: a buyer sends themselves exactly the
    // price and the transaction cannot pay for itself.
    const verdict = preflight(input({ balanceLamports: 1 * SOL, amountLamports: 1 * SOL, feeLamports: 5_000 }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe("insufficient_funds");
    expect(verdict.message).toBe("You need 0.000005 more SOL for this.");
  });

  it("opens the wallet when the balance covers amount and fee exactly", () => {
    expect(preflight(input({ balanceLamports: 1 * SOL + 5_000, amountLamports: 1 * SOL }))).toEqual({
      ok: true,
    });
  });

  it("refuses a transaction that does not simulate, and says nothing about the RPC's error", () => {
    const verdict = preflight(input({ simulation: { ok: false, err: { InstructionError: [0, "AccountNotFound"] } } }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe("simulation_failed");
    // A buyer cannot act on "AccountNotFound", and echoing it would put a second
    // frightening message next to the wallet's own.
    expect(verdict.message).not.toMatch(/AccountNotFound|InstructionError/);
    expect(verdict.message).toMatch(/Nothing has been charged/);
  });

  it("reports the shortfall before the simulation, because only one of them can explain itself", () => {
    // Both wrong at once: the buyer must get the sentence with the number in it.
    const verdict = preflight(
      input({ balanceLamports: 0, simulation: { ok: false, err: "whatever" } }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe("insufficient_funds");
  });

  it("refuses rather than guessing when a number is unreadable", () => {
    for (const broken of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const verdict = preflight(input({ balanceLamports: broken }));
      expect(verdict.ok, String(broken)).toBe(false);
    }
  });
});

describe("solText", () => {
  it("says a lamport without scientific notation, and trims what nobody reads", () => {
    expect(solText(1)).toBe("0.000000001");
    expect(solText(SOL)).toBe("1");
    expect(solText(1_500_000_000)).toBe("1.5");
  });
});
