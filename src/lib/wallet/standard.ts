/**
 * Which of the browser's registered wallets can prove a rectangle is yours.
 *
 * WHO CALLS THIS: `src/components/useWallet.ts`, which is the only module in
 * this repository that touches the live registry and the only one that calls
 * `connect` or `signMessage`. Nothing else may: everything here is a decision
 * about a LIST, which is what lets `__tests__/standard.test.ts` drive it with
 * plain objects in Node, with no browser and no extension installed.
 *
 * ## Why there is no `@solana/wallet-adapter-react` here
 *
 * That package is the conventional choice, and this project's sibling
 * `nftraffle` removed it after measuring what it costs: it pulls
 * `@solana-mobile/wallet-adapter-mobile`, which pulls the whole of
 * `react-native` and its build toolchain, and every advisory `npm audit`
 * reported there came out of that subtree. Dropping it took that project from
 * 419 dependencies to 163 and its audit to zero. What the adapter actually
 * provided was wallet discovery and a connect call, and the Wallet Standard is
 * the protocol underneath it.
 *
 * This repository goes one step further than nftraffle and reads the registry
 * with no package at all, not even `@wallet-standard/app`: the protocol is two
 * `window` events, `useWallet.ts` speaks them in about thirty lines, and
 * `package.json` here holds five runtime dependencies. Adding a sixth for
 * thirty lines is the rung this repo's ladder (CLAUDE.md) exists to refuse.
 *
 * **What is given up, stated plainly:** mobile deep-linking, autoconnect, and
 * a prebuilt modal. A mobile wallet that implements the Wallet Standard in its
 * own in-app browser still works; one reachable only by a deep link does not.
 * That is a real gap and a product question, not an oversight.
 *
 * ## Why `solana:signMessage` and nothing else
 *
 * Three things on this page are signed — handing a hold back, choosing what
 * goes in the block, and settling the purchase (DESIGN.md, "What has to be
 * signed") — and all three present the same proof: a nonce, an address, and an
 * ed25519 signature over the sentence `signature.ts` builds. There is no
 * payment code in this repository yet, and `config.ts` says so where it
 * refuses to demand a cluster at boot. So a wallet that can only sign messages
 * is FULLY useful here, and requiring `solana:signAndSendTransaction` — which
 * is what nftraffle requires, because nftraffle takes money — would hide
 * wallets that can do every single thing this product asks of them.
 *
 * The day an on-chain transfer lands, THAT batch adds its own predicate for
 * the wallets that can pay. It does not widen this one: what may sign a
 * challenge and what may move USDC are two questions, and answering them with
 * one filter is how a wallet that cannot pay ends up behind a Pay button.
 */

/** From `@wallet-standard/features`. Without it there is no way to get an account. */
export const STANDARD_CONNECT = "standard:connect";
/** Optional. A wallet without it is connected until the page goes away. */
export const STANDARD_DISCONNECT = "standard:disconnect";
/** From `@solana/wallet-standard-features`. The one feature this product needs. */
export const SOLANA_SIGN_MESSAGE = "solana:signMessage";

/**
 * Every Solana chain identifier starts with this.
 *
 * The registry holds wallets for other chains too, so something has to tell a
 * Solana wallet from an Ethereum one. It is a PREFIX rather than an exact
 * cluster because a signature over a sentence is not a transaction: it names
 * no chain, costs nothing, and settles nothing, so a wallet registered only
 * for devnet signs a challenge exactly as well as one registered for mainnet.
 * `nftraffle` matches an exact chain in the same place, and it is right to —
 * it is deciding where money will be sent. This is deciding whose key it is.
 */
export const SOLANA_CHAIN_PREFIX = "solana:";

/**
 * The part of a Wallet Standard `Wallet` this module reads.
 *
 * Structurally typed rather than imported, so the pure logic can be driven by
 * fixtures without constructing a real wallet, and so no package has to be
 * installed for a type that is erased at compile time. A live `Wallet`
 * satisfies it.
 */
export type ReadableWallet = {
  readonly name: string;
  readonly icon: string;
  readonly chains: readonly string[];
  readonly features: Readonly<Record<string, unknown>>;
};

/** A wallet that can be connected to and can sign a challenge. */
export type UsableWallet = {
  name: string;
  icon: string;
  /** True when it can be told to forget us again, which is what a Disconnect button needs. */
  canDisconnect: boolean;
  /** The registration itself, so the caller can connect and sign with it. */
  wallet: ReadableWallet;
};

/**
 * The part of a Wallet Standard `WalletAccount` this module reads.
 *
 * `address` is base58 for Solana — the same spelling `verifySignature` decodes
 * on the server — so nothing here re-encodes `publicKey` to get it.
 */
export type ReadableAccount = {
  readonly address: string;
  readonly features?: readonly string[];
};

/**
 * Can this wallet do the two things a signed step needs?
 *
 * **Never throws.** The registry is filled by browser extensions nobody here
 * controls, and a page that throws while enumerating them shows none of the
 * wallets that registered correctly — which is a blank Connect control caused
 * by somebody else's bug.
 */
export function canSignChallenges(wallet: ReadableWallet): boolean {
  const chains = Array.isArray(wallet?.chains) ? wallet.chains : [];
  if (!chains.some((chain) => typeof chain === "string" && chain.startsWith(SOLANA_CHAIN_PREFIX))) {
    return false;
  }

  const features = wallet?.features;
  if (typeof features !== "object" || features === null) return false;

  // Without `standard:connect` there is no way to obtain an account, so
  // whatever else the wallet supports is unreachable.
  if (!(STANDARD_CONNECT in features)) return false;
  return SOLANA_SIGN_MESSAGE in features;
}

/**
 * The registered wallets this page can actually use, in registry order.
 *
 * **Deliberately not sorted and not ranked.** Ordering wallets is a
 * recommendation, and this product has no basis for recommending one over
 * another — DESIGN.md's voice section asks for plain and specific, and a
 * ranked list is neither. The registry's order is whatever the browser saw
 * first, which is at least not an opinion we invented.
 *
 * Deduplicated by name, because some extensions register twice — once eagerly
 * and once on the app-ready event — and a list reading "Phantom, Phantom"
 * reads as a bug in our page rather than in theirs.
 */
export function usableWallets(wallets: readonly ReadableWallet[]): UsableWallet[] {
  const seen = new Set<string>();
  const usable: UsableWallet[] = [];

  for (const wallet of wallets ?? []) {
    if (!canSignChallenges(wallet)) continue;
    if (seen.has(wallet.name)) continue;
    seen.add(wallet.name);
    usable.push({
      name: wallet.name,
      icon: wallet.icon,
      canDisconnect: STANDARD_DISCONNECT in wallet.features,
      wallet,
    });
  }

  return usable;
}

/**
 * Which of the accounts a connect returned should sign for this buyer.
 *
 * The first one that lists `solana:signMessage` among its own features, and
 * otherwise the first account there is.
 *
 * **That fallback is deliberately permissive, and it is the one place this
 * module differs in temperament from `nftraffle`'s.** Fail-closed is right
 * there because being wrong sends money to a chain where it can never be
 * credited. Here the wallet has already declared `solana:signMessage` at the
 * wallet level — `canSignChallenges` refused it otherwise — and the account
 * feature list is a hint about which of its accounts can do what. Wallets
 * ship that list empty often enough that refusing on it would hide accounts
 * that sign perfectly well, and the cost of trying anyway is bounded and
 * already handled: the wallet refuses, and the buyer reads "that signature
 * was not given", which is exactly what happened.
 *
 * Null when there is no account at all — a connect the person cancelled
 * halfway, or a wallet with nothing unlocked.
 */
export function accountToSignWith<T extends ReadableAccount>(
  accounts: readonly T[] | undefined,
): T | null {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  const declared = accounts.find((account) => account?.features?.includes(SOLANA_SIGN_MESSAGE));
  return declared ?? accounts[0] ?? null;
}

/**
 * A base58 address, short enough for a control that must not wrap.
 *
 * Four and four, because that is what a person checks an address by: the ends
 * are what a wallet extension shows and what they can compare at a glance. The
 * full address is never hidden — it is the control's `title` and its
 * accessible name — this is only what is PRINTED in a bar that DESIGN.md fixes
 * at one row and one height.
 */
export function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}
