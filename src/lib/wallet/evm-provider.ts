"use client";

/**
 * The browser half of the Robinhood rail: finding an EVM wallet, and using it.
 *
 * WHO CALLS THIS. `src/components/useEvmWallet.ts`, which turns what is here
 * into the same `{ connected, connect, disconnect }` shape `useWallet` already
 * gives BoardView for Solana. It could not live inside that hook: discovery is
 * a window event with a timeout and no React in it, and a hook that owned both
 * would be untestable without a DOM pretending to be a wallet.
 *
 * PORTED FROM `~/proyectos/keys/src/lib/keys/wallet.ts`, which has been through
 * a real Robinhood Wallet on a real phone — its note of 2026-09-03 records that
 * the wallet does announce a provider, discovery verified, a signature not.
 * What changed on the way here:
 *
 *  - MAINNET 4663 rather than testnet 46630, with its own verified parameters.
 *  - `personalSign`, because this product asks a wallet to prove ownership
 *    before it asks it to pay, and `keys` never needed that.
 *  - `erc20TransferData`, four lines of ABI encoding, so nothing has to bring
 *    in a library to move a stablecoin.
 *
 * ## Why EIP-6963 rather than `window.ethereum`
 *
 * With two extensions installed the old way is a race: whichever loads last
 * wins the global, and a person signs from a wallet they did not choose. 6963
 * makes every provider announce itself and lets the PERSON pick. The legacy
 * fallback stays for a wallet that implements neither, and when there is no
 * provider at all this returns an empty list — the interface then says so in
 * words rather than offering a button that cannot work.
 */

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export type EvmWalletOption = {
  uuid: string;
  name: string;
  icon: string | null;
  provider: Eip1193Provider;
};

type AnnounceEvent = CustomEvent<{
  info: { uuid: string; name: string; icon: string };
  provider: Eip1193Provider;
}>;

/**
 * Providers announce asynchronously and there is no "that is all of them"
 * signal. 300ms is the courtesy window the EIP itself uses; after it, whatever
 * arrived is the list.
 */
const ANNOUNCE_WINDOW_MS = 300;

export const ROBINHOOD_CHAIN_ID = 4663;

/**
 * What `wallet_addEthereumChain` writes into somebody else's wallet, and it
 * stays there.
 *
 * NONE OF THESE VALUES IS INVENTED — the same rule `keys` wrote for the testnet
 * pair, applied to mainnet. Verified 2026-09-05 against three sources that
 * agree: the chainid.network registry behind chainlist (chain 4663, `Ether`,
 * `ETH`, 18 decimals, RPC `rpc.mainnet.chain.robinhood.com`, explorer
 * `robinscan.io`), the official docs at docs.robinhood.com/chain, and the chain
 * itself — both public RPCs above answer `eth_chainId` = `0x1237` = 4663.
 *
 * The RPC here is the PUBLIC one on purpose. It is written into a stranger's
 * wallet, so it must not be our Alchemy endpoint: that URL carries a provider
 * key, and this is the one place in the codebase where a value is handed to
 * software we do not control.
 */
export const ROBINHOOD_CHAIN_PARAMS = {
  chainId: "0x1237",
  chainName: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinscan.io"],
} as const;

export function discoverEvmWallets(): Promise<EvmWalletOption[]> {
  if (typeof window === "undefined") return Promise.resolve([]);

  return new Promise((resolve) => {
    const found = new Map<string, EvmWalletOption>();

    const onAnnounce = (event: Event) => {
      const { info, provider } = (event as AnnounceEvent).detail;
      found.set(info.uuid, { uuid: info.uuid, name: info.name, icon: info.icon, provider });
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);

      // A wallet old enough not to implement 6963 still has to be able to buy.
      const legacy = (window as { ethereum?: Eip1193Provider }).ethereum;
      if (found.size === 0 && legacy) {
        found.set("injected", {
          uuid: "injected",
          name: "Injected wallet",
          icon: null,
          provider: legacy,
        });
      }
      resolve([...found.values()]);
    }, ANNOUNCE_WINDOW_MS);
  });
}

export async function requestAccount(provider: Eip1193Provider): Promise<string> {
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.length) throw new Error("no-account");
  return accounts[0];
}

export async function currentChainId(provider: Eip1193Provider): Promise<number> {
  return Number(BigInt((await provider.request({ method: "eth_chainId" })) as string));
}

/** An EIP-1193 error carries `code`. 4902 is "this wallet does not know that chain". */
function errorCode(error: unknown): number | null {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "number" ? code : null;
}

export const CHAIN_UNKNOWN_TO_WALLET = 4902;
export const USER_REJECTED = 4001;

export function wasRejected(error: unknown): boolean {
  return errorCode(error) === USER_REJECTED;
}

/**
 * Puts the wallet on Robinhood Chain, offering to add it if it does not know it.
 *
 * THE GUARD, AND WHY IT IS NOT OPTIONAL. `CLAUDE.md`: the chain is named —
 * `solana:mainnet` there, 4663 here — and never inferred from whatever mode the
 * wallet happens to be in. A wallet sitting on Ethereum mainnet that is handed
 * a transfer to a USDG address would move a DIFFERENT token to that address, or
 * nothing, and the buyer would have paid and own no pixels. So the chain is
 * checked, changed, and then CONFIRMED — some wallets add a network without
 * switching to it, and "it said it worked" is not the same as being there.
 *
 * Adding a network always asks the person. A no is a no, and it is reported as
 * one rather than as a failure.
 */
export async function switchToRobinhood(provider: Eip1193Provider): Promise<void> {
  if ((await currentChainId(provider)) === ROBINHOOD_CHAIN_ID) return;

  const hex = ROBINHOOD_CHAIN_PARAMS.chainId;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    return;
  } catch (error) {
    if (errorCode(error) !== CHAIN_UNKNOWN_TO_WALLET) throw error;
  }

  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [ROBINHOOD_CHAIN_PARAMS],
    });
  } catch (error) {
    throw new Error(wasRejected(error) ? "chain-add-rejected" : "chain-unknown");
  }

  // Confirmed, not assumed.
  if ((await currentChainId(provider)) !== ROBINHOOD_CHAIN_ID) {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  }
}

/**
 * `personal_sign`, with the arguments in the order every wallet expects:
 * message first, address second. Reversed, MetaMask silently treats the address
 * as the message and returns a signature over the wrong bytes.
 */
export async function personalSign(
  provider: Eip1193Provider,
  address: string,
  message: string,
): Promise<string> {
  const hex = `0x${Buffer.from(message, "utf8").toString("hex")}`;
  return (await provider.request({
    method: "personal_sign",
    params: [hex, address],
  })) as string;
}

/**
 * The calldata for `transfer(address,uint256)` — a selector and two 32-byte
 * words.
 *
 * FOUR LINES RATHER THAN AN ABI LIBRARY. `CLAUDE.md`'s rung 5: never add a
 * dependency for what a few lines cover. The selector is a constant of the
 * ERC-20 ABI, and the encoding of two static types is left-padding to 32 bytes.
 * A library here would be a hundred kilobytes in the board's bundle to do this.
 */
export function erc20TransferData(to: string, amount: bigint): string {
  const word = (value: string) => value.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  return `0xa9059cbb${word(to)}${word(amount.toString(16))}`;
}

/**
 * Sends the transfer and returns its hash.
 *
 * `value` is deliberately absent: this moves a token, not ether, so the
 * transaction carries none. A wallet that shows a non-zero value on a payment
 * for pixels is showing a bug.
 */
export async function sendErc20Transfer(
  provider: Eip1193Provider,
  from: string,
  token: string,
  to: string,
  amount: bigint,
): Promise<string> {
  return (await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: token, data: erc20TransferData(to, amount) }],
  })) as string;
}
