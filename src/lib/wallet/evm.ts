import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

/**
 * Proving that an EVM address signed something, with `personal_sign`.
 *
 * WHO CALLS THIS: `src/lib/board/challenge.ts`, and only through the one place
 * that picks a verifier by the chain a claim names. Nothing else — a second
 * caller reaching in here directly would be a second place deciding which chain
 * a signature belongs to.
 *
 * ## Why `personal_sign` and not `eth_signTypedData_v4`
 *
 * The challenge is already a sentence built and stored by the server, used
 * once, and never rebuilt by a client. Typed data exists to make a STRUCT
 * legible in a wallet, and there is no struct here: there is one string, which
 * is what typed data would have had to carry anyway. `personal_sign` shows that
 * string as written, which is the property being bought, and every EVM wallet
 * supports it without a domain separator to get wrong.
 *
 * ## EIP-191, and why the prefix is not optional
 *
 * `personal_sign` does not sign the message. It signs the keccak of
 * `0x19` + "Ethereum Signed Message:" + newline + length + message. That prefix
 * is what makes a signed message unusable as a signed TRANSACTION — without it,
 * a wallet asked to sign arbitrary bytes could be tricked into authorising a
 * transfer. Verifying without it would accept signatures produced for something
 * else entirely, so it is applied here rather than trusted to have been applied
 * by whoever sent the bytes.
 *
 * ## The recovery byte
 *
 * A signature is 65 bytes: r, s and a recovery byte. Wallets emit that byte as
 * 27/28, libraries as 0/1. Both are accepted and normalised, because which one
 * arrives is a property of the wallet rather than of the signer — a buyer whose
 * wallet chose the other convention is not a buyer with a bad signature.
 *
 * ## What is deliberately NOT here
 *
 * ERC-1271. A contract wallet proves ownership by answering a call rather than
 * by producing a recoverable signature, which needs an RPC round trip and a
 * chain to make it on. `DECISIONS.md` carries it as the open door; until then a
 * smart-contract wallet cannot own a rectangle.
 */

/** `0x` and 40 hex characters, in either case. */
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** `0x` and 130 hex characters: r (32) + s (32) + v (1). */
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1)
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** The last twenty bytes of the keccak of the public key, lower-cased. */
function addressOf(publicKey: Uint8Array): string {
  // An uncompressed key carries a 0x04 tag that is not part of the hashed body.
  const body = publicKey.length === 65 ? publicKey.slice(1) : publicKey;
  return `0x${Buffer.from(keccak_256(body).slice(-20)).toString("hex")}`;
}

/** What `personal_sign` actually puts through keccak. Exported for its test. */
export function personalSignDigest(message: string): Uint8Array {
  const body = Buffer.from(message, "utf8");
  const prefix = Buffer.from(
    `\u0019Ethereum Signed Message:\n${body.length}`,
    "utf8",
  );
  return keccak_256(Buffer.concat([prefix, body]));
}

/**
 * Did `address` sign `message` with `personal_sign`?
 *
 * Compared case-insensitively: EIP-55 checksumming is a display convention, and
 * refusing an otherwise correct lower-case address would refuse a good wallet
 * for how it capitalises.
 */
export function verifyEvmSignature(
  message: string,
  signature: string,
  address: string,
): boolean {
  if (!ADDRESS.test(address) || !SIGNATURE.test(signature)) return false;

  try {
    const bytes = hexToBytes(signature);
    const raw = bytes[64];
    const recovery = raw === 27 || raw === 28 ? raw - 27 : raw;
    if (recovery !== 0 && recovery !== 1) return false;

    const sig = secp256k1.Signature.fromCompact(
      bytes.slice(0, 64),
    ).addRecoveryBit(recovery);
    const recovered = sig
      .recoverPublicKey(personalSignDigest(message))
      .toRawBytes(false);
    return addressOf(recovered) === address.toLowerCase();
  } catch {
    // A well-formed 65 bytes can still fail to recover a point on the curve.
    // That is a malformed signature like any other.
    return false;
  }
}
