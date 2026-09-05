import { expect } from "vitest";
import type { ChallengeAction } from "../../../lib/wallet/signature";
import type { TestWallet } from "../../../lib/wallet/__tests__/keypair";
import type { OwnerChain } from "../../../lib/board/owner";
import { POST as POST_CHALLENGE } from "../orders/[id]/challenge/route";

/**
 * The two requests a signed write really takes, as a test can spend them.
 *
 * Imported by `orders-api.test.ts`, `small-purchase.test.ts` and
 * `large-purchase.test.ts` — every suite that drives `/content`, `/confirm`
 * or the DELETE, which since the challenge landed is every suite that buys
 * anything. Not a `.test.ts` file, so vitest collects it as a module rather
 * than running it as a suite; `keypair.ts` next to `signature.test.ts` is the
 * same shape and is what makes the wallets these functions sign with.
 *
 * It goes through the real challenge ROUTE rather than calling
 * `issueChallenge` directly, because that is what a browser does and it is
 * what keeps a test honest about the round trip: a challenge that the route
 * would refuse is one no test should be able to spend.
 */

export type Challenge = { nonce: string; message: string; expiresAt: string };

/**
 * A DIFFERENT ADDRESS FOR EVERY CHALLENGE A TEST ASKS FOR.
 *
 * `SIGNED_WRITE_LIMITS` is thirty in ten minutes per caller, and `orders-api`
 * alone spends more than that — it drove seventeen failures the first time this
 * helper used one address, all of them 429s from a ceiling doing exactly its
 * job. A suite file is not one buyer, and pretending it is would mean either a
 * looser ceiling in production or tests that fail by arithmetic.
 *
 * The ceiling itself is exercised where it can be exercised honestly:
 * `limits.test.ts` counts to it directly.
 */
let caller = 0;
function challengeCaller(): string {
  caller += 1;
  return `198.51.100.${caller % 250}`;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Asks for a challenge for one act on one order, and fails loudly if refused. */
export async function challengeFor(orderId: string, action: ChallengeAction): Promise<Challenge> {
  const response = await POST_CHALLENGE(
    new Request("http://localhost/", {
      method: "POST",
      // The challenge route identifies its caller now — it inserts a row, and
      // point 8 of the contract wants a ceiling on that — so a request with no
      // trustworthy address is refused before it reaches the nonce.
      headers: { "content-type": "application/json", "x-forwarded-for": challengeCaller() },
      body: JSON.stringify({ action }),
    }),
    ctx(orderId),
  );
  expect(response.status, "the challenge endpoint should have issued one").toBe(200);
  return (await response.json()) as Challenge;
}

/**
 * The proof a wallet would build: ask for a challenge, sign it, present it.
 *
 * `chain` is spelled out rather than defaulted inside `readProof`, because
 * that is exactly what a real client has to do since migration 016 — a proof
 * that names no chain is refused, and a helper that quietly supplied one would
 * be testing a leniency the server does not have. It is a parameter so a test
 * can present the wrong chain deliberately; every caller here signs with an
 * ed25519 `TestWallet`, so the default is the chain that judges those.
 */
export async function proofFor(
  orderId: string,
  action: ChallengeAction,
  wallet: TestWallet,
  chain: OwnerChain = "solana",
): Promise<Record<string, string>> {
  const challenge = await challengeFor(orderId, action);
  return {
    nonce: challenge.nonce,
    chain,
    publicKey: wallet.address,
    signature: wallet.sign(challenge.message),
  };
}
