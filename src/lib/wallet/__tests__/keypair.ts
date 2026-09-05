import { generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { base58Encode } from "../base58";
import { personalSignDigest } from "../evm";

/**
 * A throwaway wallet, for tests that need something real to sign with.
 *
 * Imported by `signature.test.ts` and `evm.test.ts` next door, by
 * `challenge.test.ts`, and by `src/app/api/__tests__/orders-api.test.ts`,
 * which exercises the release endpoint end to end and therefore needs a key
 * the server has never seen and a second one to be refused with. Not a
 * `.test.ts` file, so vitest collects it as a module rather than running it as
 * a suite.
 *
 * Real keys rather than fixed fixtures: an ed25519 keypair costs microseconds
 * to generate, and a hard-coded secret in a repository is a habit worth not
 * having even when the key guards nothing.
 */
export type TestWallet = {
  /** base58, exactly as a Solana wallet would report it. */
  address: string;
  /** Signs the message and returns the signature in base58. */
  sign: (message: string) => string;
};

export function testWallet(): TestWallet {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    address: base58Encode(rawPublicKey(publicKey)),
    sign: (message: string) =>
      base58Encode(new Uint8Array(sign(null, Buffer.from(message, "utf8"), privateKey))),
  };
}

/** The last 32 bytes of the DER SPKI encoding are the key itself. */
function rawPublicKey(publicKey: KeyObject): Uint8Array {
  const der = publicKey.export({ format: "der", type: "spki" });
  return new Uint8Array(der.subarray(der.length - 32));
}

/**
 * The same idea on the other curve: a throwaway wallet that signs the way
 * `personal_sign` does.
 *
 * It lives beside the ed25519 one rather than inside `evm.test.ts` because
 * `challenge.test.ts` needs a real EVM signature too — to prove the chain in
 * a proof, and not a fallthrough between verifiers, is what decides which
 * cryptography judges it.
 *
 * `convention` is the recovery byte: wallets send 27/28, libraries send 0/1,
 * and which one arrives is a property of the wallet rather than of the signer.
 */
export type TestEvmWallet = {
  /** Lowercase hex, `0x`-prefixed, as `eth_accounts` reports it. */
  address: string;
  sign: (message: string, convention?: "wallet" | "library") => string;
};

export function testEvmWallet(): TestEvmWallet {
  const priv = randomBytes(32);
  // Uncompressed, then drop the 0x04 tag: the address is the last 20 bytes of
  // the keccak hash of the 64 bytes that follow it.
  const pub = secp256k1.getPublicKey(priv, false);
  return {
    address: `0x${Buffer.from(keccak_256(pub.slice(1)).slice(-20)).toString("hex")}`,
    sign(message, convention = "wallet") {
      const sig = secp256k1.sign(personalSignDigest(message), priv);
      const byte = convention === "wallet" ? sig.recovery + 27 : sig.recovery;
      return `0x${Buffer.from(sig.toCompactRawBytes()).toString("hex")}${byte.toString(16).padStart(2, "0")}`;
    },
  };
}
