import { createPublicKey, verify } from "node:crypto";
import { base58Decode } from "./base58";

/**
 * Does this wallet's owner actually stand behind this sentence?
 *
 * Called by `src/lib/board/release-challenge.ts`, which is the database half
 * of the same question — it issues the nonce, spends it once, and asks here
 * whether the claimed address really produced the signature that came back.
 * That module cannot answer this itself: this half must be pure, because a
 * verifier that needs a database is a verifier nobody can exercise against a
 * key they generated in a test.
 *
 * ## What the payment step reuses
 *
 * Payment verification lands in a later batch and needs the same proof —
 * "this wallet, right now, asked for this" — before it will look for a USDC
 * transfer on chain. It reuses ALL of this file: `verifySignature` unchanged,
 * and `challengeMessage` with a second action added to `ChallengeAction`
 * (`"pay"`). The five fields are already the ones a payment challenge needs:
 * the domain says which site asked, the action says what was agreed to, the
 * order id binds the proof to one rectangle so a signature collected for a
 * release cannot settle a purchase, the nonce makes it single-use, and the
 * issued-at bounds how long a captured message is worth anything. Nothing in
 * the message is payment-specific, and nothing needs to be: the amount, the
 * treasury and the transfer are all read from the order and from the chain,
 * never from something the buyer typed.
 *
 * ## Why there is no dependency here
 *
 * Node verifies ed25519 natively. A Solana address is a base58-encoded raw
 * 32-byte ed25519 public key, and `crypto.verify` wants a `KeyObject`, so the
 * twelve DER bytes below turn the one into the other. That is the whole gap
 * between the standard library and what this needs, and it is not worth a
 * package.
 */

/**
 * The DER SubjectPublicKeyInfo header for an ed25519 key, followed by the raw
 * 32 bytes. Fixed for every ed25519 key there is: SEQUENCE(42) {
 * SEQUENCE(5) { OID 1.3.101.112 }, BIT STRING(33, 0 unused bits) }.
 */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const PUBLIC_KEY_BYTES = 32;
const SIGNATURE_BYTES = 64;

/**
 * The site asking. A constant rather than an environment read: this string is
 * inside the text a buyer's wallet shows them before they sign, and its whole
 * job is to be the same sentence every time so that a message quoting some
 * other domain looks wrong at a glance.
 */
export const SIGNING_DOMAIN = "milliondollarpage.fun";

/** What the signature authorises. Payment adds `"pay"`; see the header. */
export type ChallengeAction = "release";

export type Challenge = {
  action: ChallengeAction;
  /** The one rectangle this proof is good for, and no other. */
  orderId: string;
  /** Single-use, issued by us, and spent by the request that presents it. */
  nonce: string;
  /** ISO 8601, so the text a wallet displays says plainly how fresh it is. */
  issuedAt: string;
};

/**
 * The exact bytes a wallet is asked to sign.
 *
 * Built here and nowhere else, and never stored: the DELETE rebuilds it from
 * the challenge row it just spent, so there is no second copy of the format
 * that could drift from this one. Sign-In With Solana's shape, trimmed to the
 * fields that carry weight — a statement a person can read, then one
 * `Key: value` line each for the five things the server checks.
 */
export function challengeMessage(challenge: Challenge): string {
  return [
    `${SIGNING_DOMAIN} needs to know this wallet is yours.`,
    "",
    `Action: ${challenge.action}`,
    `Order: ${challenge.orderId}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt}`,
    "",
    "Signing this sends nothing, spends nothing, and approves no transaction.",
  ].join("\n");
}

/**
 * True when `address` really did sign `message`.
 *
 * Every way of being wrong answers false rather than throwing: an address
 * that is not base58, an address that decodes to the wrong number of bytes, a
 * signature of the wrong length, a signature over different text, a signature
 * from a different key. A caller at a trust boundary has one question and
 * gets one bit back, and cannot accidentally treat a thrown error as a pass.
 *
 * The message is compared as UTF-8 bytes, which is what a wallet signs.
 */
export function verifySignature(message: string, signature: string, address: string): boolean {
  const publicKeyBytes = base58Decode(address);
  if (!publicKeyBytes || publicKeyBytes.length !== PUBLIC_KEY_BYTES) return false;

  const signatureBytes = base58Decode(signature);
  if (!signatureBytes || signatureBytes.length !== SIGNATURE_BYTES) return false;

  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
      format: "der",
      type: "spki",
    });
    // `null` is the digest algorithm: ed25519 signs the message itself rather
    // than a hash of it, and Node rejects any other value for this curve.
    return verify(null, Buffer.from(message, "utf8"), key, signatureBytes);
  } catch {
    // A well-formed 32 bytes can still fail to be a point on the curve, and
    // `createPublicKey` throws when it is not. That is a malformed address
    // like any other.
    return false;
  }
}
