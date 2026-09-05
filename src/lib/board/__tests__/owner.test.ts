import { describe, expect, it } from "vitest";
import {
  OWNER_CHAINS,
  OWNER_CHAIN_LABEL,
  isOwnerChain,
  sameOwner,
} from "../owner";

/**
 * The owner is a PAIR, and this is where the comparison of two of them is
 * pinned down.
 *
 * Called by nothing but the suite; it guards `src/lib/board/owner.ts`, which
 * the three signed routes reach for on every request that says "this is mine".
 * The route can only be as right as `sameOwner` is, and `sameOwner` is four
 * lines — which is exactly the size of function that gets its comparison
 * quietly loosened by someone fixing an unrelated bug.
 */
describe("two owners are the same owner", () => {
  it("only when both halves agree", () => {
    const a = { chain: "solana", address: "Bx1" } as const;
    expect(sameOwner(a, { chain: "solana", address: "Bx1" })).toBe(true);
    expect(sameOwner(a, { chain: "solana", address: "Bx2" })).toBe(false);
  });

  /**
   * The cross-chain refusal, which is the whole reason the pair exists.
   *
   * An EVM address is twenty bytes of hex and a Solana address is thirty-two
   * bytes of base58, so today no string is a valid address on both. That is an
   * accident of two encodings, not a rule anybody wrote, and this test refuses
   * to depend on it: the chains differ, so the owners differ, whatever the
   * addresses happen to look like.
   */
  it("and never across chains, even when the addresses are identical", () => {
    const address = "0xF00";
    expect(
      sameOwner({ chain: "solana", address }, { chain: "robinhood", address }),
    ).toBe(false);
  });

  /**
   * Case, on the EVM side, is presentation. `0xabc…` and `0xABC…` are one
   * account, and EIP-55 checksumming means the same wallet will hand us either
   * depending on where the string came from. Comparing them byte for byte
   * would answer "not yours" to an owner holding their own key.
   */
  it("ignoring case, because an EVM address is the same account in either", () => {
    expect(
      sameOwner(
        {
          chain: "robinhood",
          address: "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01",
        },
        {
          chain: "robinhood",
          address: "0xabcdef0123456789abcdef0123456789abcdef01",
        },
      ),
    ).toBe(true);
  });
});

describe("the chain name", () => {
  it("is one of the two the CHECK constraint allows, and nothing else", () => {
    // These four strings are the ones a body can plausibly carry — a chain id,
    // a display name, an empty string, a wrong case — and every one of them is
    // refused, because the column would refuse them too.
    for (const wrong of ["4663", "Solana", "", "ethereum"])
      expect(isOwnerChain(wrong)).toBe(false);
    for (const right of OWNER_CHAINS) expect(isOwnerChain(right)).toBe(true);
  });

  it("has a label for every chain, so no interface can name one and not the other", () => {
    // Migration 016's CHECK is the list; a chain added there without a label
    // here is a chain that reaches a page as `undefined`.
    for (const chain of OWNER_CHAINS)
      expect(OWNER_CHAIN_LABEL[chain]).toBeTruthy();
  });
});
