"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  SOLANA_SIGN_MESSAGE,
  STANDARD_CONNECT,
  STANDARD_DISCONNECT,
  accountToSignWith,
  usableWallets,
  type ReadableAccount,
  type ReadableWallet,
  type UsableWallet,
} from "../lib/wallet/standard";
import type { MessageSigner } from "../lib/board/purchase-client";

/**
 * The live Wallet Standard registry, and the one wallet this page is holding.
 *
 * WHO CALLS THIS: `BoardView` (src/components/BoardView.tsx), and only
 * BoardView. It is the component that owns the buyer's address — the field
 * this replaces was a text input it held in `useState` — and it is what hands
 * `PurchaseDialog` both the address a hold is created with and the signer the
 * dialog's three signed steps go through. Rendering this twice would be two
 * connections disagreeing about which wallet the buyer chose, which is why the
 * state below is `useState` in one component rather than a module-level store.
 *
 * **This file is the only thing in the repository that touches `window` or a
 * wallet extension.** Which wallets are usable is decided by
 * `src/lib/wallet/standard.ts`, which is pure and tested in Node; what a
 * signature looks like on the wire is decided by `walletSigner` in
 * `src/lib/board/purchase-client.ts`. What is left here — thirty lines of
 * registry protocol and a promise that can be declined — is the part that
 * genuinely needs a browser, and it is deliberately small for that reason.
 *
 * ## The registry protocol, in full
 *
 * Two `window` events, which is the whole of `@wallet-standard/app`:
 *
 * - a wallet dispatches `wallet-standard:register-wallet` carrying a callback,
 *   and we call it with `{ register }`;
 * - we dispatch `wallet-standard:app-ready` carrying `{ register }`, so every
 *   wallet that loaded BEFORE this page's script registers too.
 *
 * Both directions are needed and neither is optional: extensions inject at
 * unpredictable times relative to hydration, and a page that listened without
 * announcing itself would see only the wallets that happened to be late.
 */

/** The callback shape a wallet dispatches on `wallet-standard:register-wallet`. */
type RegisterCallback = (api: { register: (...wallets: ReadableWallet[]) => () => void }) => void;

const REGISTER_EVENT = "wallet-standard:register-wallet";
const APP_READY_EVENT = "wallet-standard:app-ready";

/**
 * Everything that has registered, and everyone who wants to be told.
 *
 * Module scope rather than component state because the registry itself is
 * module scope — there is one `window` — and because `useSyncExternalStore`
 * wants exactly this shape: a subscribe function and a snapshot whose identity
 * only changes when the set actually does. A fresh array per call is the
 * classic infinite render loop with that hook.
 */
const registered: ReadableWallet[] = [];
const listeners = new Set<() => void>();
let listening = false;

/**
 * What the store hands out.
 *
 * `looked` rides along with the list rather than being a `useState` flipped in
 * an effect, and that is not a style preference: `setState` inside an effect
 * body is a cascading render, and this project's lint rule
 * (`react-hooks/set-state-in-effect`) refuses it. The honest model is that
 * "have we asked the registry yet" is a fact ABOUT THE REGISTRY, so it belongs
 * to the same external store and arrives through the same subscription.
 */
type RegistrySnapshot = { wallets: readonly ReadableWallet[]; looked: boolean };

let snapshot: RegistrySnapshot = { wallets: [], looked: false };

function publish(): void {
  snapshot = { wallets: registered.slice(), looked: listening };
  for (const listener of listeners) listener();
}

function register(...wallets: ReadableWallet[]): () => void {
  let added = false;
  for (const wallet of wallets) {
    // Identity, not name: the same extension registering twice is deduplicated
    // by name in `usableWallets`, where that decision is testable. Here the
    // only job is to not hold the same object twice.
    if (!wallet || registered.includes(wallet)) continue;
    registered.push(wallet);
    added = true;
  }
  if (added) publish();
  // The Wallet Standard says register returns an unregister. Honoured rather
  // than stubbed: an extension that is disabled or updated mid-session calls
  // it, and a list still offering that wallet is a Connect button that does
  // nothing when it is pressed.
  return () => {
    const kept = registered.filter((wallet) => !wallets.includes(wallet));
    if (kept.length === registered.length) return;
    registered.length = 0;
    registered.push(...kept);
    publish();
  };
}

/**
 * Starts listening, once, and announces the page to wallets already loaded.
 *
 * Called from `subscribe` rather than at module scope so that importing this
 * file on the server touches no `window` — the page is server-rendered, and
 * `useSyncExternalStore` never calls `subscribe` there.
 */
function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener(REGISTER_EVENT, (event) => {
    const callback = (event as CustomEvent<RegisterCallback>).detail;
    if (typeof callback === "function") callback({ register });
  });
  window.dispatchEvent(new CustomEvent(APP_READY_EVENT, { detail: { register } }));
  // Unconditionally, even when nobody registered: an empty list AFTER asking
  // is a different answer from an empty list BEFORE asking, and this is what
  // carries that difference to the control.
  publish();
}

function subscribe(onChange: () => void): () => void {
  listen();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): RegistrySnapshot {
  return snapshot;
}

/**
 * On the server there is no registry, and there is no honest guess to make.
 *
 * A module constant rather than a fresh object, so the identity is stable
 * across renders — returning a new one here is the classic
 * `useSyncExternalStore` infinite loop.
 */
const NOTHING_YET: RegistrySnapshot = { wallets: [], looked: false };

function getServerSnapshot(): RegistrySnapshot {
  return NOTHING_YET;
}

/** The features this hook reaches for, typed only as far as it uses them. */
type ConnectFeature = { connect: () => Promise<{ accounts?: readonly ReadableAccount[] }> };
type DisconnectFeature = { disconnect: () => Promise<void> };
type SignMessageFeature = {
  signMessage: (
    ...inputs: { account: ReadableAccount; message: Uint8Array }[]
  ) => Promise<readonly { signature: Uint8Array }[]>;
};

export type ConnectedWallet = {
  /** The wallet's own name, so the panel can say which one is holding the key. */
  name: string;
  /** base58, exactly as the server decodes it. */
  address: string;
  canDisconnect: boolean;
  /** What `walletSigner` turns into the browser half of a proof. */
  signer: MessageSigner;
};

export type WalletState = {
  /** Every wallet in this browser that can sign a challenge, in registry order. */
  wallets: UsableWallet[];
  /**
   * Whether the registry has been asked yet.
   *
   * False on the server and for the single commit before effects run, which is
   * the only window in which `wallets` being empty means "we have not looked"
   * rather than "there are none". Without it the control prints "no Solana
   * wallet in this browser" for one frame at every page load, at everybody,
   * including the people who have one — and a sentence that is false is worse
   * for being brief.
   */
  ready: boolean;
  connected: ConnectedWallet | null;
  /** The name of the wallet a connect is in flight for, so its button can say so. */
  connecting: string | null;
  /** What the buyer is told about the last attempt, or null. Announced politely. */
  notice: string | null;
  connect: (wallet: UsableWallet) => void;
  disconnect: () => void;
};

/**
 * What a buyer reads when a connect did not produce a wallet.
 *
 * A wallet throws when the person closes its prompt, and closing it is an
 * answer rather than a fault — so this says what did NOT happen and leaves the
 * way back open, which is the same shape `REFUSED_MESSAGE` uses in
 * `purchase-client.ts` for a declined signature.
 */
function declined(name: string): string {
  return `${name} was not connected. Nothing was shared and nothing was signed — press it again whenever you like.`;
}

/**
 * No account came back, which is not the same as a refusal.
 *
 * A locked wallet, or one with every account hidden from this site, resolves
 * with an empty list rather than throwing. Saying "declined" there would blame
 * the person for something their wallet did.
 */
function noAccount(name: string): string {
  return `${name} connected but offered no account. Unlock it, or choose an account for this site, and press it again.`;
}

export function useWallet(): WalletState {
  const registry = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const wallets = useMemo(() => usableWallets(registry.wallets), [registry.wallets]);
  const ready = registry.looked;

  const [connected, setConnected] = useState<ConnectedWallet | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const connect = useCallback((choice: UsableWallet) => {
    // ponytail: no ceiling on this promise, unlike every request in
    // `purchase-client.ts`. Those are a promise about a SERVER answering, and
    // ten seconds is generous there; this one is waiting on a person finding
    // their extension, unlocking it and reading a prompt, and a timer that
    // cancelled that would be the page overruling them. The cost is that a
    // wallet which never settles leaves this control saying "Connecting…"
    // until the page is reloaded. Every wallet tested rejects when its prompt
    // is closed; if one turns up that does not, this is where a ceiling goes.
    setConnecting(choice.name);
    setNotice(null);

    const features = choice.wallet.features;
    const connectFeature = features[STANDARD_CONNECT] as ConnectFeature | undefined;

    void (async () => {
      try {
        const result = await connectFeature?.connect();
        const account = accountToSignWith(result?.accounts);
        if (!account) {
          setNotice(noAccount(choice.name));
          return;
        }
        setConnected({
          name: choice.name,
          address: account.address,
          canDisconnect: choice.canDisconnect,
          signer: {
            address: account.address,
            /**
             * The account object goes back to the wallet with every request,
             * so the key that signs is the key this page is showing.
             *
             * ponytail: this does NOT subscribe to the optional
             * `standard:events` feature, so a buyer who switches accounts
             * inside their extension still sees the address they connected
             * with here. That address is the right one to show — it is the one
             * the hold was created with and the only one the server will
             * accept — and the wallet refuses to sign for an account it no
             * longer has, which the dialog already reports as a signature that
             * was not given. Subscribe to `change` if this ever needs to
             * disconnect itself when the extension moves on.
             */
            signMessage: async (message: Uint8Array) => {
              const feature = features[SOLANA_SIGN_MESSAGE] as SignMessageFeature;
              const outputs = await feature.signMessage({ account, message });
              const signature = outputs?.[0]?.signature;
              if (!signature) throw new Error("The wallet returned no signature.");
              return signature;
            },
          },
        });
        setNotice(`Connected to ${choice.name}.`);
      } catch {
        // Everything a wallet can do wrong arrives here as a rejection, and
        // by far the commonest of them is a person pressing Cancel.
        setNotice(declined(choice.name));
      } finally {
        setConnecting(null);
      }
    })();
  }, []);

  const disconnect = useCallback(() => {
    setConnected((current) => {
      if (current?.canDisconnect) {
        const wallet = wallets.find((candidate) => candidate.name === current.name);
        const feature = wallet?.wallet.features[STANDARD_DISCONNECT] as DisconnectFeature | undefined;
        // Best effort, and deliberately not awaited: this page has already
        // forgotten the key, and a wallet that fails to forget us back changes
        // nothing about what this page can do.
        void feature?.disconnect().catch(() => {});
      }
      return null;
    });
    setNotice("Disconnected. Nothing was held, signed or charged.");
  }, [wallets]);

  return { wallets, ready, connected, connecting, notice, connect, disconnect };
}
