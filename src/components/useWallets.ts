"use client";

import { useCallback, useMemo, useState } from "react";
import type { OwnerChain } from "../lib/board/owner";
import type { UsableWallet } from "../lib/wallet/standard";
import type { EvmWalletOption } from "../lib/wallet/evm-provider";
import { evmSigner, useEvmWallet, type ConnectedEvmWallet } from "./useEvmWallet";
import { useWallet, type ConnectedWallet } from "./useWallet";

/**
 * Both chains behind one connection, because a buyer has one.
 *
 * WHO CALLS THIS: `BoardView`, in place of `useWallet`. It could not do this
 * itself for the reason every composed hook exists — the rule "only one wallet
 * is connected at a time, and connecting on one chain disconnects the other" is
 * a rule about the PAIR, and a component holding two independent hooks would
 * have to remember it at four call sites.
 *
 * ## One connection, never two
 *
 * A rectangle is held by one `(chain, address)` and every signed step is
 * checked against it. Two live connections would mean an interface that has to
 * ask which one a purchase belongs to at the exact moment a buyer is least
 * interested in the question, so choosing a wallet on either chain drops the
 * other. The dialog snapshots the pair at open time anyway, and the connect
 * control is disabled while a dialog is open — this is the belt to that brace.
 *
 * ## Why the Solana list comes first
 *
 * Not a ranking: it is the order the wall has taken money in since it existed,
 * and the row scrolls, so the order decides what a phone shows without moving.
 * When a second rail has taken its first purchase this is worth re-reading.
 */
export type WalletChoice = {
  /** Stable across renders, and unique across both lists. */
  key: string;
  name: string;
  chain: OwnerChain;
  icon: string | null;
  /** Whether pressing it can produce a connection right now. */
  usable: boolean;
};

export type AnyConnected = {
  name: string;
  address: string;
  chain: OwnerChain;
  /** Present only on Robinhood, and only for the payment step. */
  evm: ConnectedEvmWallet | null;
  /** Present only on Solana. */
  solana: ConnectedWallet | null;
};

export type WalletsState = {
  choices: WalletChoice[];
  ready: boolean;
  connected: AnyConnected | null;
  connecting: string | null;
  notice: string | null;
  connect: (key: string) => void;
  disconnect: () => void;
};

export function useWallets(): WalletsState {
  const solana = useWallet();
  const evm = useEvmWallet();

  /*
    WHICH CHAIN THE LIVE CONNECTION IS ON, held here rather than derived from
    "whichever hook has one". Both hooks can hold a connection at once — a
    connect on one does not reach into the other — so deriving would make the
    answer depend on the order of two `if`s. This is the fact; `connect` below
    is the only thing that writes it.
  */
  const [live, setLive] = useState<OwnerChain | null>(null);

  const choices = useMemo<WalletChoice[]>(
    () => [
      ...solana.wallets.map((wallet: UsableWallet) => ({
        key: `solana:${wallet.name}`,
        name: wallet.name,
        chain: "solana" as const,
        icon: null,
        usable: true,
      })),
      ...evm.wallets.map((wallet: EvmWalletOption) => ({
        key: `robinhood:${wallet.uuid}`,
        name: wallet.name,
        chain: "robinhood" as const,
        icon: wallet.icon,
        usable: true,
      })),
    ],
    [solana.wallets, evm.wallets],
  );

  const connect = useCallback(
    (key: string) => {
      if (key.startsWith("solana:")) {
        const name = key.slice("solana:".length);
        const choice = solana.wallets.find((wallet) => wallet.name === name);
        if (!choice) return;
        evm.disconnect();
        setLive("solana");
        solana.connect(choice);
        return;
      }
      const uuid = key.slice("robinhood:".length);
      const choice = evm.wallets.find((wallet) => wallet.uuid === uuid);
      if (!choice) return;
      solana.disconnect();
      setLive("robinhood");
      evm.connect(choice);
    },
    [solana, evm],
  );

  const disconnect = useCallback(() => {
    solana.disconnect();
    evm.disconnect();
    setLive(null);
  }, [solana, evm]);

  const connected = connectionOn(live, solana.connected, evm.connected);

  return {
    choices,
    // Both registries have to have been asked. Half an answer would print
    // "no wallet in this browser" to somebody whose wallet is on the other list.
    ready: solana.ready && evm.ready,
    connected,
    connecting: solana.connecting ?? evm.connecting,
    // Only the live chain's notice: the other hook's is about the disconnect
    // this page performed on the buyer's behalf, and reporting that would be
    // telling them off for something they did not do.
    notice: (live === "robinhood" ? evm.notice : solana.notice) ?? null,
    connect,
    disconnect,
  };
}

function connectionOn(
  live: OwnerChain | null,
  solana: ConnectedWallet | null,
  evm: ConnectedEvmWallet | null,
): AnyConnected | null {
  if (live === "solana" && solana) {
    return { name: solana.name, address: solana.address, chain: "solana", evm: null, solana };
  }
  if (live === "robinhood" && evm) {
    return { name: evm.name, address: evm.address, chain: "robinhood", evm, solana: null };
  }
  return null;
}

/** The signer for whichever chain is live, in the one shape `prove` accepts. */
export function signerFor(connected: AnyConnected | null) {
  if (!connected) return null;
  if (connected.chain === "robinhood" && connected.evm) return evmSigner(connected.evm);
  return null;
}
