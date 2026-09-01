/**
 * Whether a payment is worth opening a wallet for.
 *
 * WHO CALLS THIS. Nothing yet, and that is a real exception to CLAUDE.md's rule
 * that a module names its caller — stated rather than hidden. The owner asked
 * for the mechanism to exist before the money path does, because the failure it
 * prevents is a buyer staring at a red banner in Phantom, and that is not
 * something to discover from buyers. Its caller is the payment route, and the
 * batch that writes that route owes it: `docs/wallet-warnings.md` is the
 * argument, and this file is the half of it that can be written today.
 *
 * WHAT IT IS AND IS NOT. It is the DECISION, not the data-gathering. It takes
 * numbers and a simulation result and answers "open the wallet, or say what is
 * missing" — no RPC client, no `@solana/*`, nothing to mock. The batch that adds
 * the RPC calls feeds this; keeping the two apart is what makes every branch
 * below testable now, and it is why this file has no dependency to add.
 *
 * WHY THE ORDER MATTERS. The balance is checked before the simulation because a
 * buyer who is short can be told exactly how short, and a simulation failure
 * cannot say that — it comes back as an opaque refusal. Both would fail; only
 * one of them can explain itself.
 */

/** Lamports per SOL, so a shortfall can be said in the unit a person holds. */
const LAMPORTS_PER_SOL = 1_000_000_000;

export type SimulationOutcome =
  | { ok: true }
  /** `err` is whatever the RPC reported; it is logged, never shown to a buyer. */
  | { ok: false; err: unknown };

export type PreflightInput = {
  /** The payer's balance, in lamports, read from our own RPC. */
  balanceLamports: number;
  /** What the transfer itself moves, in lamports. */
  amountLamports: number;
  /** The estimated network fee, in lamports. */
  feeLamports: number;
  /**
   * `simulateTransaction` with `sigVerify: false`, against our RPC.
   *
   * `sigVerify` is false because the buyer has not signed yet — the whole point
   * is to find out whether it is worth asking them to. Phantom runs the same
   * check when the prompt opens, so a transaction that fails here is the one
   * that produces "this dApp could be malicious" there.
   */
  simulation: SimulationOutcome;
};

export type PreflightVerdict =
  | { ok: true }
  | { ok: false; reason: "insufficient_funds" | "simulation_failed"; message: string };

/** A lamport count as SOL, trimmed, for a sentence a person reads. */
export function solText(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  // Nine decimals is a lamport; trailing zeroes help nobody.
  return sol.toFixed(9).replace(/\.?0+$/, "");
}

/**
 * The verdict, and the sentence that goes with a refusal.
 *
 * ONE SENTENCE, AND IT NAMES THE NUMBER WHERE THERE IS ONE. A buyer who is
 * short does not need a stack trace; they need to know how much more to send,
 * and a retry button that would fail identically is worse than no button.
 */
export function preflight(input: PreflightInput): PreflightVerdict {
  const { balanceLamports, amountLamports, feeLamports, simulation } = input;

  if (!Number.isFinite(balanceLamports) || !Number.isFinite(amountLamports) || !Number.isFinite(feeLamports)) {
    // Unreadable numbers are not a buyer's problem to solve, and guessing that
    // they can afford it is the one wrong way to resolve them.
    return {
      ok: false,
      reason: "simulation_failed",
      message: "This payment could not be checked just now. Try again in a moment.",
    };
  }

  const needed = amountLamports + feeLamports;
  if (balanceLamports < needed) {
    const short = needed - balanceLamports;
    return {
      ok: false,
      reason: "insufficient_funds",
      message: `You need ${solText(short)} more SOL for this.`,
    };
  }

  if (!simulation.ok) {
    // Deliberately says nothing about the RPC's error. It is for our log: a
    // buyer cannot act on "AccountNotFound", and a wallet that shows a warning
    // right after we showed them one reads as two separate faults.
    return {
      ok: false,
      reason: "simulation_failed",
      message: "This payment would not go through. Nothing has been charged — try again in a moment.",
    };
  }

  return { ok: true };
}
