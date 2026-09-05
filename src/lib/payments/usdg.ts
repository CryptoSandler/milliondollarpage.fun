/**
 * The one dollar this site is paid in, and the one address it is paid to.
 *
 * WHO CALLS THIS. `src/lib/payments/robinhood.ts` reads the token to know which
 * contract's `Transfer` events count and the treasury to know which `to` is
 * ours; `src/lib/config.ts` reads the treasury again at boot, so a deployed
 * instance with the rail turned on and nowhere to send money refuses to start
 * rather than taking a payment into `undefined`. Neither could hold these
 * numbers itself: one is the verifier and the other is the boot guard, and a
 * token address written down twice is a token address that can disagree with
 * itself.
 *
 * ## Why a stablecoin and not the chain's own ether
 *
 * The wall is priced in USDC base units — `price_per_pixel_usdc`, six decimals
 * — and there is no exchange rate anywhere in this repository. Paying in ETH
 * would require one, and an exchange rate is an oracle, a staleness policy and
 * a slippage policy: three product decisions about who absorbs a move between
 * quote and settlement. USDG has six decimals too, so the price the buyer is
 * quoted and the amount the chain must show are THE SAME INTEGER. Nothing is
 * converted, so nothing can be converted wrongly. `DECISIONS.md` records ETH
 * native as a later rail and what it needs decided in writing first.
 */

/**
 * Verified 2026-09-04, three ways, and the third is the chain itself.
 *
 *  1. Paxos — the issuer — publishes the per-network contract list at
 *     https://docs.paxos.com/guides/stablecoin/usdg/mainnet, where "Robinhood
 *     Mainnet" is `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` and the chain is
 *     named as an Arbitrum Orbit L2 with chain id 4663.
 *  2. The Global Dollar Network states USDG is the first stablecoin natively
 *     issued on Robinhood Chain, and Robinhood Wallet — the self-custodial one
 *     a buyer would connect here — lists USDG among the assets it manages.
 *  3. THE CONTRACT ITSELF, called over `eth_call` on chain id `0x1237` (4663):
 *     `symbol()` = "USDG", `name()` = "Global Dollar", `decimals()` = 6,
 *     `totalSupply()` = 627,311,551.42.
 *
 * IT IS AN ERC-1967 PROXY, and that is written down rather than discovered
 * later: the runtime code at this address is a 170-byte forwarder and the
 * implementation slot held `0x68184c449e1a8f34fa18d289737129fd27b66f8f` on the
 * day above. The issuer can upgrade the implementation without the address
 * changing, so `decimals` is re-read from the chain by the rehearsal rather
 * than trusted forever from this comment — see `scripts/usdg-check.mts`.
 */
export const USDG = {
  /** Robinhood Chain mainnet. Named, never inferred from a wallet's mode. */
  chainId: 4663,
  /** Robinhood Chain testnet, where the rehearsal runs. */
  testnetChainId: 46630,
  address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  /** Six, the same as USDC — which is why no arithmetic converts anything. */
  decimals: 6,
  symbol: "USDG",
  name: "Global Dollar",
} as const;

/**
 * `keccak256("Transfer(address,address,uint256)")`, the topic every ERC-20
 * transfer carries first.
 *
 * A constant rather than a hash computed at call time: it is a fact about the
 * ERC-20 ABI, it cannot change, and computing it would mean importing a hash
 * function into the one module that must be readable at a glance.
 */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** `0x` and forty hex characters, in either case. Nothing else is an address. */
const ADDRESS_SHAPE = /^0x[0-9a-fA-F]{40}$/;

export function isEvmAddress(value: unknown): value is string {
  return typeof value === "string" && ADDRESS_SHAPE.test(value);
}

/**
 * Where the money goes, or an error naming what is missing.
 *
 * THE REPOSITORY HOLDS NO KEY THAT SPENDS — `SECURITY.md` — so this is a public
 * address and nothing else. It is deliberately not defaulted: a default
 * treasury is somebody else's wallet, and the failure mode of guessing is that
 * every buyer pays a stranger and the rectangles are still unsold.
 */
export function treasuryAddress(): string {
  const raw = process.env.ROBINHOOD_TREASURY_ADDRESS?.trim();
  if (!raw) {
    throw new Error(
      "ROBINHOOD_TREASURY_ADDRESS is not set, so there is no address to be paid at. " +
        "It is the public address of the wallet that receives USDG on Robinhood Chain.",
    );
  }
  if (!isEvmAddress(raw)) {
    throw new Error(
      "ROBINHOOD_TREASURY_ADDRESS is not an EVM address (0x and forty hex characters). " +
        "A malformed treasury is a payment nobody receives.",
    );
  }
  return raw;
}

/**
 * Whether the Robinhood rail is switched on for this instance.
 *
 * The switch is the treasury having been set, plus this flag: the flag alone
 * would let a deploy turn payments on with nowhere to send them, and the
 * treasury alone would turn payments on the moment somebody pasted an address
 * to try something. Both, deliberately, and `assertRobinhoodRailConfigured`
 * refuses to boot the combination that would take money into the void.
 */
export function robinhoodRailEnabled(): boolean {
  return process.env.ROBINHOOD_PAYMENTS?.trim() === "true";
}
