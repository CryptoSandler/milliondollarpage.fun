/**
 * Who owns a rectangle: a chain and an address, never one without the other.
 *
 * WHO CALLS THIS: `challenge.ts`, which proves a claim; `orders.ts` and
 * `reserve.ts`, which write it; `blocks.ts` and `buyers.ts`, which read it back
 * out; and the takedown console, which shows it. It is a module rather than two
 * loose strings because the pair is the unit — migration 016 made the database
 * say so, and a function that took only an address would be a function that had
 * to be told the chain by somebody who remembered.
 *
 * ## Why an address alone is not an owner
 *
 * The same twenty bytes are a valid EVM address on every EVM chain and mean
 * nothing on Solana; a Solana public key is 32 bytes in a different alphabet.
 * Two owners could be written the same way and be different people, and the
 * only thing that tells them apart is which chain the address was proved on.
 *
 * ## The list is short and adding to it is a migration
 *
 * `blocks_owner_chain_known` is a CHECK, not an enum, so a third chain is a
 * migration somebody reads rather than an `ALTER TYPE` that slips past in a
 * diff. This list and that CHECK have to agree, and `owner.test.ts` is what
 * keeps them agreeing.
 */

export const OWNER_CHAINS = ["solana", "robinhood"] as const;

export type OwnerChain = (typeof OWNER_CHAINS)[number];

/** A claim that has been PROVED: the signature checked out for this pair. */
export type ProvenOwner = { chain: OwnerChain; address: string };

export function isOwnerChain(value: unknown): value is OwnerChain {
  return (
    typeof value === "string" &&
    (OWNER_CHAINS as readonly string[]).includes(value)
  );
}

/**
 * What a person should see when a chain is named on screen.
 *
 * `robinhood` is the id; "Robinhood Chain" is the name — and the difference
 * matters on `/b/<id>`, where a reader who has never heard of either needs the
 * second one.
 */
export const OWNER_CHAIN_LABEL: Record<OwnerChain, string> = {
  solana: "Solana",
  robinhood: "Robinhood Chain",
};

/**
 * Are these the same owner?
 *
 * BOTH HALVES OR NEITHER. Comparing addresses alone was the shape of the code
 * before migration 016, and it is exactly the bug the migration exists to make
 * impossible: the same twenty bytes proved on one chain would have satisfied a
 * rectangle owned on the other. It is one function so that the three signed
 * routes cannot each remember half of it.
 *
 * The address comparison is case-insensitive because EIP-55 checksumming is a
 * display convention — the same EVM address is written two ways by two wallets
 * and is one address. Solana's base58 is case-SENSITIVE, but its alphabet makes
 * two distinct keys that differ only in case impossible in practice, and the
 * stored value is whatever was proved, so this cannot let a different key
 * through.
 */
export function sameOwner(
  a: ProvenOwner,
  b: { chain: OwnerChain; address: string },
): boolean {
  return (
    a.chain === b.chain && a.address.toLowerCase() === b.address.toLowerCase()
  );
}
