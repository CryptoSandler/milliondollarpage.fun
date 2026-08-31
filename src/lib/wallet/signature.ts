import { createPublicKey, verify } from "node:crypto";
import { base58Decode } from "./base58";

/**
 * Does this wallet's owner actually stand behind this sentence?
 *
 * Called by `src/lib/board/challenge.ts`, which is the database half of the
 * same question — it issues the nonce, spends it once, and asks here whether
 * the claimed address really produced the signature that came back. That
 * module cannot answer this itself: this half must be pure, because a
 * verifier that needs a database is a verifier nobody can exercise against a
 * key they generated in a test.
 *
 * ## What the three acts share
 *
 * Handing a hold back, attaching the content a rectangle will carry, and
 * settling a purchase all ask the same question — "this wallet, right now,
 * asked for this" — so all three present the same proof over the same five
 * fields. The domain says which site asked, the action says what was agreed
 * to, the order id binds the proof to one rectangle, the nonce makes it
 * single-use, and the issued-at bounds how long a captured message is worth
 * anything. `ChallengeAction` is what keeps them apart: a signature is only
 * ever good for the act named in the text that was signed, and the row the
 * text is rebuilt from stores that name (`migrations/010_challenge_actions.sql`).
 *
 * The on-chain half of payment lands in a later batch and adds nothing here.
 * Nothing in the message is payment-specific, and nothing needs to be: the
 * amount, the treasury and the transfer are all read from the order and from
 * the chain, never from something the buyer typed.
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

/**
 * What the signature authorises, and the whole of what it authorises.
 *
 * `release` hands a hold back, `attach` writes the image, link and caption a
 * rectangle will carry, and `pay` settles the purchase. Three acts rather than
 * one blanket "this is my wallet", because a proof that did not name its act
 * would let a signature collected for the cheapest of them perform the most
 * permanent: content on a paid block can never be edited, by anyone.
 *
 * The same three strings are listed in `release_challenges_action_known`
 * (`migrations/010_challenge_actions.sql`), which is what refuses a fourth.
 *
 * An array, with the type derived from it, so the challenge route can check a
 * string a caller sent against the same list the type is made of rather than
 * against a second copy of it that is free to drift.
 */
export const CHALLENGE_ACTIONS = ["release", "attach", "pay"] as const;

export type ChallengeAction = (typeof CHALLENGE_ACTIONS)[number];

/** The action a caller named, or null if it is not one we issue. */
export function readChallengeAction(value: unknown): ChallengeAction | null {
  return CHALLENGE_ACTIONS.find((action) => action === value) ?? null;
}

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
