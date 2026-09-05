"use client";

import { useCallback, useEffect, useState } from "react";
import {
  discoverEvmWallets,
  personalSign,
  requestAccount,
  sendErc20Transfer,
  switchToRobinhood,
  wasRejected,
  type Eip1193Provider,
  type EvmWalletOption,
} from "../lib/wallet/evm-provider";

/**
 * `useWallet`'s twin on the other chain.
 *
 * WHO CALLS THIS: `src/components/useWallets.ts`, which puts this and the
 * Solana hook behind one shape so `BoardView` sees a list of wallets and one
 * connection rather than two of each. It is a separate hook rather than a
 * branch inside the Solana one because the two share nothing but their SHAPE:
 * a registry event and a 300ms window here, a Wallet Standard registry there;
 * secp256k1 and `personal_sign` here, ed25519 and `solana:signMessage` there.
 * A single hook holding both would be two hooks with an `if` around them, and
 * the `if` would be the bug.
 *
 * ## What it deliberately does not do
 *
 * It does not switch the chain at connect time. A person who connects is saying
 * "this is my wallet", not "spend from it", and moving their network before
 * they have chosen a rectangle is a prompt with no reason attached. The switch
 * happens where the money does — `payWithEvm` below — which is also the only
 * moment the answer matters.
 */
export type ConnectedEvmWallet = {
  name: string;
  /** `0x` and forty hex, as the wallet reports it — case as given. */
  address: string;
  provider: Eip1193Provider;
};

export type EvmWalletState = {
  wallets: EvmWalletOption[];
  ready: boolean;
  connected: ConnectedEvmWallet | null;
  connecting: string | null;
  notice: string | null;
  connect: (wallet: EvmWalletOption) => void;
  disconnect: () => void;
};

/** The same sentence `useWallet` uses, because it is the same event. */
function declined(name: string): string {
  return `${name} was not connected. Nothing was shared and nothing was signed — press it again whenever you like.`;
}

function noAccount(name: string): string {
  return `${name} connected but offered no account. Unlock it, or choose an account for this site, and press it again.`;
}

export function useEvmWallet(): EvmWalletState {
  const [wallets, setWallets] = useState<EvmWalletOption[]>([]);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState<ConnectedEvmWallet | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /*
    DISCOVERY RUNS ONCE, ON MOUNT, and `ready` is what separates "we have not
    looked" from "there are none" — the same distinction `useWallet` draws, and
    for the same reason: printing "no wallet in this browser" for one frame at
    everybody, including the people who have one, is a false sentence that is
    worse for being brief.
  */
  useEffect(() => {
    let live = true;
    void discoverEvmWallets().then((found) => {
      if (!live) return;
      setWallets(found);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const connect = useCallback((choice: EvmWalletOption) => {
    setConnecting(choice.name);
    setNotice(null);
    void (async () => {
      try {
        const address = await requestAccount(choice.provider);
        setConnected({ name: choice.name, address, provider: choice.provider });
        setNotice(`Connected to ${choice.name}.`);
      } catch (error) {
        // A locked wallet resolves with nothing; a person pressing Cancel
        // rejects. Saying "declined" to the first would blame them for a
        // decision they never made.
        setNotice(
          (error as Error)?.message === "no-account" ? noAccount(choice.name) : declined(choice.name),
        );
      } finally {
        setConnecting(null);
      }
    })();
  }, []);

  const disconnect = useCallback(() => {
    // There is no `disconnect` in EIP-1193: a page forgets a wallet, it cannot
    // ask a wallet to forget it. Forgetting is the whole operation, and saying
    // more than that would claim something this cannot do.
    setConnected(null);
    setNotice("Disconnected. Nothing was held, signed or charged.");
  }, []);

  return { wallets, ready, connected, connecting, notice, connect, disconnect };
}

export type EvmPaymentResult =
  | { ok: true; txHash: string }
  | { ok: false; message: string };

/**
 * The one place this product asks an EVM wallet to move money.
 *
 * THE ORDER OF THE THREE STEPS IS THE DESIGN. The chain is put right first,
 * because a transfer signed on the wrong network moves a different token to the
 * same address and the buyer has paid for nothing. Only then is the transfer
 * built, and it is built from what the SERVER said — `payTo`, `payToken`,
 * `paymentBaseUnits` off the proven order — so no address the browser holds
 * decides where money goes.
 *
 * `CLAUDE.md`: one signer and it is the user, the chain is named and never
 * inferred, and nothing opens a wallet until the server has said the payment
 * would work. The third is why this is called from the payment step of a dialog
 * that already has a proven order in hand, and not from a button on the board.
 */
export async function payWithEvm(
  wallet: ConnectedEvmWallet,
  order: { payTo?: string | null; payToken?: string | null; paymentBaseUnits?: number },
): Promise<EvmPaymentResult> {
  const { payTo, payToken, paymentBaseUnits } = order;
  if (!payTo || !payToken || typeof paymentBaseUnits !== "number") {
    // The rail is off, or this order is not on it. Either way there is nothing
    // to sign, and opening a wallet to say so would be the worst of both.
    return { ok: false, message: "Paying in USDG is not available for this rectangle." };
  }

  try {
    await switchToRobinhood(wallet.provider);
  } catch (error) {
    const reason = (error as Error)?.message;
    if (reason === "chain-add-rejected") {
      return { ok: false, message: "Robinhood Chain was not added, so nothing was sent." };
    }
    if (wasRejected(error)) {
      return { ok: false, message: "The network was not switched, so nothing was sent." };
    }
    return {
      ok: false,
      message: "Your wallet could not be put on Robinhood Chain, so nothing was sent.",
    };
  }

  try {
    const txHash = await sendErc20Transfer(
      wallet.provider,
      wallet.address,
      payToken,
      payTo,
      BigInt(paymentBaseUnits),
    );
    return { ok: true, txHash };
  } catch (error) {
    return {
      ok: false,
      message: wasRejected(error)
        ? "You declined the transfer, so nothing was paid and these pixels are still held for you."
        : "That transfer was not sent. Nothing was paid.",
    };
  }
}

/** The browser half of an ownership proof, on this chain. */
export function evmSigner(wallet: ConnectedEvmWallet) {
  return async (message: string) => ({
    publicKey: wallet.address,
    signature: await personalSign(wallet.provider, wallet.address, message),
  });
}
