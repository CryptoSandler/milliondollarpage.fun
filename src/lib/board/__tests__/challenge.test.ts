import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { execute } from "../../db";
import { testEvmWallet, testWallet } from "../../wallet/__tests__/keypair";
import { consumeChallenge, issueChallenge } from "../challenge";

/**
 * The chain half of a proof, at the one place that decides what a signature
 * means.
 *
 * `src/lib/board/challenge.ts` is called by the three signed routes — release,
 * attach and confirm — and none of them can check any of this itself: the
 * message that was signed is rebuilt from a stored row, and picking the
 * verifier is the same decision as reading the proof. This file is the suite's
 * only direct caller; the routes are covered end to end in `orders-api`, which
 * is a slower and much less pointed way to ask these questions.
 *
 * The e2e suite exercised the happy path before migration 016, but nothing
 * asked what happens when a proof LIES about its chain — and that is the
 * question the pair was introduced to answer.
 */
let slot = 0;

/** A hold to hang challenges off; the FK is `ON DELETE CASCADE` to blocks. */
async function held(): Promise<string> {
  const id = randomUUID();
  const x = 600 + slot++ * 20;
  await execute(
    `INSERT INTO blocks (id, x, y, w, h, status, price_per_pixel_usdc, total_usdc,
                         owner_address, owner_chain, expires_at, created_at)
     VALUES ($1, $2, 700, 10, 10, 'reserved', 1000000, 100000000,
             'irrelevant-here', 'solana', now() + interval '30 minutes', now())`,
    [id, x],
  );
  return id;
}

describe("proving an order is yours", () => {
  it("returns the pair, not the address, when a Solana wallet signs", async () => {
    const id = await held();
    const wallet = testWallet();
    const challenge = await issueChallenge(id, "release");
    const proven = await consumeChallenge(id, "release", {
      nonce: challenge.nonce,
      chain: "solana",
      publicKey: wallet.address,
      signature: wallet.sign(challenge.message),
    });
    expect(proven).toEqual({ chain: "solana", address: wallet.address });
  });

  it("returns the pair when an EVM wallet signs, through the other verifier", async () => {
    const id = await held();
    const wallet = testEvmWallet();
    const challenge = await issueChallenge(id, "release");
    const proven = await consumeChallenge(id, "release", {
      nonce: challenge.nonce,
      chain: "robinhood",
      publicKey: wallet.address,
      signature: wallet.sign(challenge.message),
    });
    expect(proven).toEqual({ chain: "robinhood", address: wallet.address });
  });

  /**
   * THE CLAIM DOES NOT GET TO PICK ITS OWN CRYPTOGRAPHY, and this is the case
   * that would pass if the verifiers were tried in turn instead.
   *
   * A real Solana signature, presented as a Robinhood one, must fail: the EVM
   * verifier is the only one asked, and it does not recognise ed25519. Falling
   * through to the other verifier "to be lenient" is the bug this test exists
   * to catch, because it would make the chain field decorative.
   */
  it("refuses a signature that names the wrong chain, rather than trying both", async () => {
    const id = await held();
    const wallet = testWallet();
    const challenge = await issueChallenge(id, "release");
    expect(
      await consumeChallenge(id, "release", {
        nonce: challenge.nonce,
        chain: "robinhood",
        publicKey: wallet.address,
        signature: wallet.sign(challenge.message),
      }),
    ).toBeNull();
  });

  it("refuses a proof that names no chain at all, rather than assuming Solana", async () => {
    const id = await held();
    const wallet = testWallet();
    const challenge = await issueChallenge(id, "release");
    // Byte for byte the proof that worked before migration 016. It is refused
    // now, and a client that still sends it is a client that has to be fixed
    // rather than one silently guessed at.
    expect(
      await consumeChallenge(id, "release", {
        nonce: challenge.nonce,
        publicKey: wallet.address,
        signature: wallet.sign(challenge.message),
      }),
    ).toBeNull();
  });

  /**
   * A chainless proof is refused BEFORE the nonce is spent, so a client with a
   * stale payload can be fixed and retried rather than being told to go and
   * ask for another challenge. The nonce below is the same one.
   */
  it("and refusing it does not burn the nonce", async () => {
    const id = await held();
    const wallet = testWallet();
    const challenge = await issueChallenge(id, "release");
    await consumeChallenge(id, "release", {
      nonce: challenge.nonce,
      publicKey: wallet.address,
      signature: wallet.sign(challenge.message),
    });
    const proven = await consumeChallenge(id, "release", {
      nonce: challenge.nonce,
      chain: "solana",
      publicKey: wallet.address,
      signature: wallet.sign(challenge.message),
    });
    expect(proven).toEqual({ chain: "solana", address: wallet.address });
  });
});
