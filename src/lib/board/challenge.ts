import { randomBytes } from "node:crypto";
import { execute, queryOne } from "../db";
import { challengeMessage, verifySignature, type ChallengeAction } from "../wallet/signature";
import { verifyEvmSignature } from "../wallet/evm";
import { isOwnerChain, type OwnerChain, type ProvenOwner } from "./owner";

/**
 * The single-use half of proving an order is yours.
 *
 * Two callers per act, and there are three acts:
 *
 * - `src/app/api/orders/[id]/challenge/route.ts` calls `issueChallenge` to
 *   hand a buyer something fresh to sign, for whichever act they named.
 * - `src/app/api/orders/[id]/route.ts` calls `consumeChallenge` in its DELETE
 *   (`release`), `src/app/api/orders/[id]/content/route.ts` calls it before it
 *   decodes a single byte of an upload (`attach`), and
 *   `src/app/api/orders/[id]/confirm/route.ts` calls it before it verifies a
 *   payment (`pay`). None of them writes anything unless an address comes back.
 *
 * No route could do this itself, because the two halves have to agree on the
 * exact text that was signed, and the honest way to guarantee that is one
 * module that builds it on both sides. `src/lib/wallet/signature.ts` does the
 * arithmetic; this does the bookkeeping — hand out a nonce for one act on one
 * order, spend it exactly once, and refuse a stale one.
 *
 * Why a challenge at all: the address an order belongs to is public. `/api/board`
 * publishes every live block's id, and a wallet address is not a secret, so
 * "send me the buyer's address" authenticated nobody. A signature proves the
 * key; the nonce is what stops that signature being useful to whoever copies
 * it out of a log or off the wire a minute later.
 *
 * It was called `release-challenge.ts` when handing a hold back was the only
 * act that had been converted. The table it writes is still `release_challenges`,
 * because an applied migration is never edited; see
 * `migrations/010_challenge_actions.sql` for that and for why the act is a
 * stored column rather than something the reading route supplies.
 */

/**
 * How long a challenge is worth signing.
 *
 * Two minutes: long enough for a wallet prompt somebody has to find, unlock
 * and read, and short enough that a signature scraped from anywhere is dead
 * before it can be used. The nonce being single-use is the real defence; this
 * bounds the window in which a challenge that was issued but never spent is
 * worth anything at all.
 */
export const CHALLENGE_TTL_MS = 120_000;

export type IssuedChallenge = {
  nonce: string;
  /** The exact text to sign. Sent whole so no client ever rebuilds the format. */
  message: string;
  expiresAt: string;
};

export type OwnershipProof = {
  nonce: string;
  /**
   * WHICH CHAIN THE ADDRESS AND THE SIGNATURE BELONG TO, named and never
   * inferred.
   *
   * CLAUDE.md's money rules say the chain is named rather than read off
   * whatever mode a wallet happens to be in, and the same reasoning reaches one
   * step earlier than a transaction: a verifier that guessed from the SHAPE of
   * an address would be guessing, and the two alphabets are close enough that a
   * guess is a decision nobody wrote down. There is no default. A proof that
   * does not say which chain it is from is not a proof this accepts.
   */
  chain: OwnerChain;
  /** The address claiming to have signed. Proved, never trusted. */
  publicKey: string;
  /** base58 for Solana, `0x` and 130 hex for an EVM `personal_sign`. */
  signature: string;
};

/**
 * Mints a nonce for one act on one order and returns what to sign.
 *
 * Issuing is deliberately unauthenticated: a challenge is worthless without
 * the private key, and requiring proof of identity to be given something to
 * prove identity with is a circle. It discloses nothing new either — the
 * caller already had to know the order id, and `GET /api/orders/:id` answers
 * whether that id exists.
 */
export async function issueChallenge(
  orderId: string,
  action: ChallengeAction,
): Promise<IssuedChallenge> {
  // ponytail: the sweep is this one statement on the issuing path rather than
  // a scheduled job. Expired rows are unusable the moment they expire, so
  // this is housekeeping and not a control; if issuing ever gets hot enough
  // that a DELETE per request shows up, move it to whatever sweeps holds.
  await execute("DELETE FROM release_challenges WHERE expires_at < now()");

  const nonce = randomBytes(32).toString("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);

  // The act is written down here, in the same statement as the nonce, and it
  // is what the message is rebuilt from when the proof comes back. A row that
  // did not carry it could be presented at any of the three routes.
  await execute(
    `INSERT INTO release_challenges (nonce, order_id, action, issued_at, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [nonce, orderId, action, issuedAt, expiresAt],
  );

  return {
    nonce,
    message: challengeMessage({ action, orderId, nonce, issuedAt: issuedAt.toISOString() }),
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Spends a challenge and says which address proved itself for this act, or null.
 *
 * Null for every failure there is, and on purpose: unknown nonce, a nonce
 * issued for a different order, a nonce issued for a different act, an expired
 * one, one already spent, a malformed proof, a signature over different text,
 * a signature from another key. The caller answers 403 to all of them, so a
 * stranger poking at order ids learns nothing from which of these they tripped.
 *
 * The UPDATE is the whole replay defence. It stamps `used_at` in the same
 * statement that reads the row, with `used_at IS NULL` in its own WHERE, so
 * two requests carrying the same captured signature cannot both find the row
 * unspent — Postgres serialises them on the row lock and the second one
 * updates nothing. A read-then-write would have had a window between them.
 *
 * The nonce is spent BEFORE the signature is checked, which costs a buyer who
 * fumbles a signature one round trip to ask for another challenge. That is the
 * right way round: the alternative leaves a nonce alive after a failed
 * attempt, which is exactly the replay window this exists to close. The act is
 * compared after the spend for the same reason — a challenge presented at the
 * wrong route is spent by being presented, not left alive for the right one.
 *
 * WHY THE ACT IS COMPARED AT ALL, given the message is rebuilt from the row.
 * Rebuilding from the row is what stops a client dictating the text; it is not
 * on its own what binds a proof to an act. A wallet asked to sign
 * `Action: release` really did sign that exact text, so a release challenge
 * presented to `/content` would verify perfectly if the only thing checked was
 * the arithmetic. The equality below is the check that makes the signature
 * mean the act the person agreed to.
 */
export async function consumeChallenge(
  orderId: string,
  action: ChallengeAction,
  proof: unknown,
): Promise<ProvenOwner | null> {
  const parsed = readProof(proof);
  if (!parsed) return null;

  const spent = await queryOne<{ issued_at: Date; action: ChallengeAction }>(
    `UPDATE release_challenges
        SET used_at = now()
      WHERE nonce = $1
        AND order_id = $2
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING issued_at, action`,
    [parsed.nonce, orderId],
  );
  if (!spent) return null;
  if (spent.action !== action) return null;

  const message = challengeMessage({
    // From the row, never from the argument: the stored act is the one the
    // wallet was shown, and the two are equal by the line above.
    action: spent.action,
    orderId,
    nonce: parsed.nonce,
    issuedAt: spent.issued_at.toISOString(),
  });
  /*
    ONE VERIFIER PER CHAIN, PICKED BY WHAT THE PROOF SAYS IT IS.

    They cannot be tried in turn: ed25519 and secp256k1 refuse each other's
    signatures outright, so falling through from one to the other would not be
    "being lenient", it would be letting the CLAIM decide which cryptography
    applies. The proof names its chain and is judged by that one.
  */
  const ok =
    parsed.chain === "robinhood"
      ? verifyEvmSignature(message, parsed.signature, parsed.publicKey)
      : verifySignature(message, parsed.signature, parsed.publicKey);

  return ok ? { chain: parsed.chain, address: parsed.publicKey } : null;
}

/** The four fields, or null if what arrived is not that shape. */
function readProof(proof: unknown): OwnershipProof | null {
  if (typeof proof !== "object" || proof === null) return null;
  const record = proof as Record<string, unknown>;
  const nonce = record.nonce;
  const publicKey = record.publicKey;
  const signature = record.signature;
  const chain = record.chain;
  if (typeof nonce !== "string" || typeof publicKey !== "string" || typeof signature !== "string") {
    return null;
  }
  if (nonce === "" || publicKey === "" || signature === "") return null;
  // No default. A proof that does not name its chain is refused rather than
  // assumed to be the older one — see `OwnershipProof.chain`.
  if (!isOwnerChain(chain)) return null;
  return { nonce, chain, publicKey, signature };
}
