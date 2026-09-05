import { randomBytes } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { describe, expect, it } from "vitest";
import { verifyEvmSignature } from "../evm";
import { verifySignature } from "../signature";
import { testEvmWallet as evmWallet, testWallet } from "./keypair";

describe("personal_sign", () => {
  const message =
    "milliondollarpage.fun: prove this order is yours\nnonce: abc";

  it("accepts a signature the signer really made", () => {
    const w = evmWallet();
    expect(verifyEvmSignature(message, w.sign(message), w.address)).toBe(true);
  });

  /*
    27/28 IS THE WALLET CONVENTION AND 0/1 IS THE LIBRARY ONE. Which one arrives
    is a property of the wallet rather than of the signer, so a buyer whose
    wallet chose the other is not a buyer with a bad signature.
  */
  it("accepts both recovery-byte conventions", () => {
    const w = evmWallet();
    expect(
      verifyEvmSignature(message, w.sign(message, "wallet"), w.address),
    ).toBe(true);
    expect(
      verifyEvmSignature(message, w.sign(message, "library"), w.address),
    ).toBe(true);
  });

  it("does not care how the address is capitalised", () => {
    const w = evmWallet();
    const shouty = `0x${w.address.slice(2).toUpperCase()}`;
    expect(verifyEvmSignature(message, w.sign(message), shouty)).toBe(true);
  });

  it("refuses another message, another signer, and a mangled signature", () => {
    const w = evmWallet();
    const other = evmWallet();
    expect(
      verifyEvmSignature("something else", w.sign(message), w.address),
    ).toBe(false);
    expect(verifyEvmSignature(message, w.sign(message), other.address)).toBe(
      false,
    );
    expect(
      verifyEvmSignature(
        message,
        `${w.sign(message).slice(0, -2)}09`,
        w.address,
      ),
    ).toBe(false);
  });

  it("refuses anything that is not an address, or not a signature", () => {
    const w = evmWallet();
    for (const address of [
      "",
      "0x",
      "not-an-address",
      w.address.slice(0, -1),
    ]) {
      expect(
        verifyEvmSignature(message, w.sign(message), address),
        address,
      ).toBe(false);
    }
    for (const sig of ["", "0x00", w.sign(message).slice(0, 40)]) {
      expect(verifyEvmSignature(message, sig, w.address), sig).toBe(false);
    }
  });

  /**
   * THE PREFIX IS WHAT KEEPS A SIGNED MESSAGE FROM BEING A SIGNED TRANSACTION.
   * A verifier that hashed the message bare would accept signatures produced
   * for something else entirely, so this pins the digest rather than trusting
   * it: a signature over the RAW keccak of the message must not verify.
   */
  it("verifies the EIP-191 digest and not the bare message", () => {
    const priv = randomBytes(32);
    const pub = secp256k1.getPublicKey(priv, false);
    const address = `0x${Buffer.from(keccak_256(pub.slice(1)).slice(-20)).toString("hex")}`;
    const bare = secp256k1.sign(keccak_256(Buffer.from(message, "utf8")), priv);
    const forged = `0x${Buffer.from(bare.toCompactRawBytes()).toString("hex")}${(bare.recovery + 27).toString(16)}`;

    // The same key, the same message, everything but the prefix.
    expect(verifyEvmSignature(message, forged, address)).toBe(false);
  });
});

/**
 * THE CASE THE OWNER ASKED FOR: a signature from one chain must not work on the
 * other. They are different curves over different alphabets, so this is not a
 * near miss — it is each verifier refusing the other's evidence outright, which
 * is what makes `(chain, address)` a pair that has to be read together.
 */
describe("a signature from one chain does not work on the other", () => {
  const message = "one message, two chains";

  it("a Solana signature does not satisfy the EVM verifier", () => {
    const sol = testWallet();
    expect(verifySignature(message, sol.sign(message), sol.address)).toBe(true);
    expect(verifyEvmSignature(message, sol.sign(message), sol.address)).toBe(
      false,
    );
  });

  it("an EVM signature does not satisfy the Solana verifier", () => {
    const evm = evmWallet();
    expect(verifyEvmSignature(message, evm.sign(message), evm.address)).toBe(
      true,
    );
    expect(verifySignature(message, evm.sign(message), evm.address)).toBe(
      false,
    );
  });
});
