import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { base58Encode } from "../base58";

/**
 * A throwaway wallet, for tests that need something real to sign with.
 *
 * Imported by `signature.test.ts` next door and by
 * `src/app/api/__tests__/orders-api.test.ts`, which exercises the release
 * endpoint end to end and therefore needs a key the server has never seen and
 * a second one to be refused with. Not a `.test.ts` file, so vitest collects
 * it as a module rather than running it as a suite.
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
