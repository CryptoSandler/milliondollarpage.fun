import { expect } from "vitest";
import type { ChallengeAction } from "../../../lib/wallet/signature";
import type { TestWallet } from "../../../lib/wallet/__tests__/keypair";
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

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Asks for a challenge for one act on one order, and fails loudly if refused. */
export async function challengeFor(orderId: string, action: ChallengeAction): Promise<Challenge> {
  const response = await POST_CHALLENGE(
    new Request("http://localhost/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }),
    ctx(orderId),
  );
  expect(response.status, "the challenge endpoint should have issued one").toBe(200);
  return (await response.json()) as Challenge;
}

/** The proof a wallet would build: ask for a challenge, sign it, present it. */
export async function proofFor(
  orderId: string,
  action: ChallengeAction,
  wallet: TestWallet,
): Promise<Record<string, string>> {
  const challenge = await challengeFor(orderId, action);
  return {
    nonce: challenge.nonce,
    publicKey: wallet.address,
    signature: wallet.sign(challenge.message),
  };
}
