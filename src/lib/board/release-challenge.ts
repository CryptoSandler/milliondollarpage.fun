import { randomBytes } from "node:crypto";
import { execute, queryOne } from "../db";
import { challengeMessage, verifySignature } from "../wallet/signature";

/**
 * The single-use half of proving a hold is yours.
 *
 * Two callers, both routes:
 *
 * - `src/app/api/orders/[id]/release-challenge/route.ts` calls
 *   `issueReleaseChallenge` to hand a holder something fresh to sign.
 * - `src/app/api/orders/[id]/route.ts` calls `consumeReleaseChallenge` in its
 *   DELETE, and releases nothing unless it comes back with an address.
 *
 * Neither route could do this itself, because the two halves have to agree on
 * the exact text that was signed, and the honest way to guarantee that is one
 * module that builds it on both sides. `src/lib/wallet/signature.ts` does the
 * arithmetic; this does the bookkeeping — hand out a nonce, spend it exactly
 * once, and refuse a stale one.
 *
 * Why a challenge at all: the address a hold belongs to is public. `/api/board`
 * publishes every live block's id, and a wallet address is not a secret, so
 * "send me the buyer's address" authenticated nobody. A signature proves the
 * key; the nonce is what stops that signature being useful to whoever copies
 * it out of a log or off the wire a minute later.
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

export type ReleaseProof = {
  nonce: string;
  /** The address claiming to have signed. Proved, never trusted. */
  publicKey: string;
  /** base58, 64 bytes, as every Solana wallet returns it. */
  signature: string;
};

/**
 * Mints a nonce for one order and returns what to sign.
 *
 * Issuing is deliberately unauthenticated: a challenge is worthless without
 * the private key, and requiring proof of identity to be given something to
 * prove identity with is a circle. It discloses nothing new either — the
 * caller already had to know the order id, and `GET /api/orders/:id` answers
 * whether that id exists.
 */
export async function issueReleaseChallenge(orderId: string): Promise<IssuedChallenge> {
  // ponytail: the sweep is this one statement on the issuing path rather than
  // a scheduled job. Expired rows are unusable the moment they expire, so
  // this is housekeeping and not a control; if issuing ever gets hot enough
  // that a DELETE per request shows up, move it to whatever sweeps holds.
  await execute("DELETE FROM release_challenges WHERE expires_at < now()");

  const nonce = randomBytes(32).toString("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);

  await execute(
    "INSERT INTO release_challenges (nonce, order_id, issued_at, expires_at) VALUES ($1, $2, $3, $4)",
    [nonce, orderId, issuedAt, expiresAt],
  );

  return {
    nonce,
    message: challengeMessage({
      action: "release",
      orderId,
      nonce,
      issuedAt: issuedAt.toISOString(),
    }),
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Spends a challenge and says which address proved itself, or null.
 *
 * Null for every failure there is, and on purpose: unknown nonce, a nonce
 * issued for a different order, an expired one, one already spent, a
 * malformed proof, a signature over different text, a signature from another
 * key. The caller answers 403 to all of them, so a stranger poking at order
 * ids learns nothing from which of these they tripped.
 *
 * The UPDATE is the whole replay defence. It stamps `used_at` in the same
 * statement that reads the row, with `used_at IS NULL` in its own WHERE, so
 * two requests carrying the same captured signature cannot both find the row
 * unspent — Postgres serialises them on the row lock and the second one
 * updates nothing. A read-then-write would have had a window between them.
 *
 * The nonce is spent BEFORE the signature is checked, which costs a holder
 * who fumbles a signature one round trip to ask for another challenge. That
 * is the right way round: the alternative leaves a nonce alive after a failed
 * attempt, which is exactly the replay window this exists to close.
 */
export async function consumeReleaseChallenge(
  orderId: string,
  proof: unknown,
): Promise<string | null> {
  const parsed = readProof(proof);
  if (!parsed) return null;

  const spent = await queryOne<{ issued_at: Date }>(
    `UPDATE release_challenges
        SET used_at = now()
      WHERE nonce = $1
        AND order_id = $2
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING issued_at`,
    [parsed.nonce, orderId],
  );
  if (!spent) return null;

  const message = challengeMessage({
    action: "release",
    orderId,
    nonce: parsed.nonce,
    issuedAt: spent.issued_at.toISOString(),
  });
  return verifySignature(message, parsed.signature, parsed.publicKey) ? parsed.publicKey : null;
}

/** The three strings, or null if what arrived is not that shape. */
function readProof(proof: unknown): ReleaseProof | null {
  if (typeof proof !== "object" || proof === null) return null;
  const record = proof as Record<string, unknown>;
  const nonce = record.nonce;
  const publicKey = record.publicKey;
  const signature = record.signature;
  if (typeof nonce !== "string" || typeof publicKey !== "string" || typeof signature !== "string") {
    return null;
  }
  if (nonce === "" || publicKey === "" || signature === "") return null;
  return { nonce, publicKey, signature };
}
