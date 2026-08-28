import { describe, expect, it } from "vitest";
import { base58Decode, base58Encode } from "../base58";

/**
 * The vectors below are the ones the leading-zero handling gets wrong when it
 * is written naively, plus a real Solana address, plus the round trip.
 */

describe("base58Decode", () => {
  it("decodes the known short vectors", () => {
    expect(Array.from(base58Decode("2")!)).toEqual([1]);
    expect(Array.from(base58Decode("z")!)).toEqual([57]);
    expect(Array.from(base58Decode("21")!)).toEqual([58]);
  });

  it("counts one leading zero byte per leading '1', and not one more", () => {
    // The bug this module was copied with: an accumulator seeded with a zero
    // byte makes every one of these a byte longer than it should be, which
    // would have made one Solana address in 256 undecodable as a 32-byte key.
    expect(Array.from(base58Decode("1")!)).toEqual([0]);
    expect(Array.from(base58Decode("11")!)).toEqual([0, 0]);
    expect(Array.from(base58Decode("1z")!)).toEqual([0, 57]);
  });

  it("decodes a 32-byte Solana address to exactly 32 bytes", () => {
    // The USDC mint on mainnet: a real address, and one nothing here spends.
    const decoded = base58Decode("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(decoded).not.toBeNull();
    expect(decoded!.length).toBe(32);
  });

  it("returns null for the empty string and for anything outside the alphabet", () => {
    expect(base58Decode("")).toBeNull();
    // 0, O, I and l are the four characters base58 leaves out on purpose.
    for (const input of ["0", "O", "I", "l", "hello world", "abc+def", "ñ"]) {
      expect(base58Decode(input), input).toBeNull();
    }
  });
});

describe("base58Encode", () => {
  it("round-trips arbitrary bytes, leading zeros included", () => {
    const cases: number[][] = [
      [0],
      [0, 0, 0],
      [1],
      [255, 255, 255, 255],
      [0, 0, 1, 2, 3],
      Array.from({ length: 64 }, (_, i) => (i * 37) % 256),
    ];
    for (const bytes of cases) {
      const encoded = base58Encode(Uint8Array.from(bytes));
      expect(Array.from(base58Decode(encoded)!), encoded).toEqual(bytes);
    }
  });
});

describe("the length bound", () => {
  /**
   * The decoder is O(n^2), and `verifySignature` only learns the result is the
   * wrong size AFTER paying for it. Without a bound, one unauthenticated
   * request blocks the event loop for minutes.
   *
   * Timed rather than asserted on the return value alone: a guard that
   * returned null after doing the work would satisfy a null check and would
   * not fix anything.
   */
  it("refuses an input too long to be a key or a signature, without decoding it", () => {
    const started = process.hrtime.bigint();
    expect(base58Decode("z".repeat(100_000))).toBeNull();
    const ms = Number(process.hrtime.bigint() - started) / 1e6;

    // Unbounded, this input measured ~3,450ms on the machine this was written
    // on. Anything in that neighbourhood means the guard is gone.
    expect(ms).toBeLessThan(50);
  });

  it("still decodes both real lengths, so the bound did not break the product", () => {
    // 32 bytes and 64 bytes: a Solana public key and an ed25519 signature.
    expect(base58Decode("11111111111111111111111111111111")).not.toBeNull();
    expect(base58Decode("1".repeat(88))).not.toBeNull();
  });
});
