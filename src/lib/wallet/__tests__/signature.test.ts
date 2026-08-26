import { describe, expect, it } from "vitest";
import { base58Encode } from "../base58";
import { SIGNING_DOMAIN, challengeMessage, verifySignature } from "../signature";
import { testWallet } from "./keypair";

/**
 * The verifier is the whole of the release endpoint's security, so every way
 * of being wrong gets its own case here rather than being covered once
 * through the route.
 */

const CHALLENGE = {
  action: "release",
  orderId: "3f1b9c2e-7a4d-4f6b-9c11-8d2e5a6b7c80",
  nonce: "a".repeat(64),
  issuedAt: "2026-08-25T12:00:00.000Z",
} as const;

describe("challengeMessage", () => {
  it("names the domain, the action, the order, the nonce and the issued-at", () => {
    const message = challengeMessage(CHALLENGE);
    expect(message).toContain(SIGNING_DOMAIN);
    expect(message).toContain("Action: release");
    expect(message).toContain(`Order: ${CHALLENGE.orderId}`);
    expect(message).toContain(`Nonce: ${CHALLENGE.nonce}`);
    expect(message).toContain(`Issued At: ${CHALLENGE.issuedAt}`);
  });

  it("is byte-for-byte the same text for the same challenge", () => {
    // The DELETE rebuilds this from the row it just spent, so a format that
    // depended on anything but its five inputs would fail every verification.
    expect(challengeMessage(CHALLENGE)).toBe(challengeMessage({ ...CHALLENGE }));
  });

  it("changes when any one field changes", () => {
    const base = challengeMessage(CHALLENGE);
    expect(challengeMessage({ ...CHALLENGE, nonce: "b".repeat(64) })).not.toBe(base);
    expect(challengeMessage({ ...CHALLENGE, orderId: "00000000-0000-0000-0000-000000000000" })).not.toBe(base);
    expect(challengeMessage({ ...CHALLENGE, issuedAt: "2026-08-25T12:00:01.000Z" })).not.toBe(base);
  });
});

describe("verifySignature", () => {
  const message = challengeMessage(CHALLENGE);

  it("accepts a signature the claimed address really made", () => {
    const wallet = testWallet();
    expect(verifySignature(message, wallet.sign(message), wallet.address)).toBe(true);
  });

  it("refuses a signature made by a different key", () => {
    const owner = testWallet();
    const stranger = testWallet();
    expect(verifySignature(message, stranger.sign(message), owner.address)).toBe(false);
  });

  it("refuses a signature over text that has since been altered", () => {
    const wallet = testWallet();
    const signature = wallet.sign(message);
    const tampered = challengeMessage({ ...CHALLENGE, orderId: "00000000-0000-0000-0000-000000000000" });
    expect(verifySignature(tampered, signature, wallet.address)).toBe(false);
    // Even a single character: this is what binds the proof to the order.
    expect(verifySignature(`${message} `, signature, wallet.address)).toBe(false);
  });

  it("refuses a malformed address", () => {
    const wallet = testWallet();
    const signature = wallet.sign(message);
    for (const address of ["", "not base58 at all!", "0OIl", "  "]) {
      expect(verifySignature(message, signature, address), address).toBe(false);
    }
  });

  it("refuses a malformed signature", () => {
    const wallet = testWallet();
    for (const signature of ["", "not base58 at all!", "1111", base58Encode(new Uint8Array(63))]) {
      expect(verifySignature(message, signature, wallet.address), signature).toBe(false);
    }
  });

  it("refuses an address that is valid base58 but not 32 bytes", () => {
    const wallet = testWallet();
    const signature = wallet.sign(message);
    for (const length of [16, 31, 33, 64]) {
      const address = base58Encode(Uint8Array.from({ length }, (_, i) => (i + 1) % 256));
      expect(verifySignature(message, signature, address), `${length} bytes`).toBe(false);
    }
  });

  it("refuses 32 bytes that are not a point on the curve, rather than throwing", () => {
    // All-ones is not a valid ed25519 public key; node throws building it.
    const address = base58Encode(Uint8Array.from({ length: 32 }, () => 0xff));
    const wallet = testWallet();
    expect(verifySignature(message, wallet.sign(message), address)).toBe(false);
  });
});
