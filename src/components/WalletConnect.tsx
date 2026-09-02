"use client";

import type { Ref } from "react";
import { shortAddress, type UsableWallet } from "../lib/wallet/standard";
import type { WalletState } from "./useWallet";

/**
 * The control that replaced the wallet address field.
 *
 * WHO CALLS THIS: `BoardView`, which renders it in the TOP BAR, immediately
 * after the wordmark, at every width including a phone.
 *
 * ## Why it left the purchase panel
 *
 * It sat between the readout and the Buy button, which put the one control a
 * buyer needs BEFORE they have chosen anything behind having chosen it — and
 * spent the middle of the panel on it, plus a sentence saying *Connect a wallet
 * to buy* where the price belonged. In the header it is where every other
 * product on this chain puts it, it is reachable from the first second of the
 * first visit, and the panel is two things again: what you are buying, and the
 * button that buys it.
 *
 * **Buy is enabled without a wallet now.** Pressing it opens this control
 * rather than refusing — see `BoardView`. A disabled button with an explanation
 * beside it is a sentence asking to be read; a button that does the next thing
 * is the next thing.
 *
 * ## The violet, which is the second exception in DESIGN.md
 *
 * The accent means money moving now and appears in five places. This is not
 * one of them, and it is not the accent: it is the colour every Solana wallet
 * and `wallet-adapter` itself already wears, borrowed rather than invented,
 * because a reader looking for the thing they know looks for the colour they
 * know. It is themed — `#512da8` on the cream bar, `#ab9ff2` on the near-black
 * one — because one violet cannot clear 1.4.11 against both grounds, and the
 * numbers are in the stylesheet and in DESIGN.md.
 *
 * **Why the typed field is gone rather than kept alongside.** It took an
 * address somebody pasted in, and DESIGN.md's "What has to be signed" says
 * what that was worth: "The address on its own proved nothing… anything that
 * trusted the address alone let a stranger act on somebody else's pixels." A
 * typed address can hold a rectangle and can then never attach content to it,
 * never pay for it and never let it go, because all three are signed by the
 * key behind it. Keeping the field would have kept a route into a purchase
 * that cannot be finished. The field's own tooltip said this was coming: "A
 * connected wallet replaces this field later."
 *
 * **No wallet UI library and no modal.** The wallets are buttons, in a row
 * that scrolls sideways exactly like the size presets beside it. That is the
 * laziest thing that works (CLAUDE.md's ladder): a popover needs a focus trap,
 * an escape key, a click-outside and an `aria-expanded`, all to hide a list
 * that is usually one item long. Every button here is in the tab order from
 * the moment it renders, and takes the page's one measured focus ring.
 *
 * Every class is one the stylesheet defines and DESIGN.md has measured. The one
 * new ratio in this file is the violet's, and it is measured in both registers
 * rather than claimed in either.
 */
export default function WalletConnect({
  wallets,
  connected,
  connecting,
  notice,
  ready,
  disabled,
  needed,
  onConnect,
  onDisconnect,
  ref,
}: Pick<WalletState, "wallets" | "connected" | "connecting" | "notice" | "ready"> & {
  /**
   * True while a purchase dialog is open.
   *
   * The hold inside that dialog belongs to the address it was created with, and
   * all three of its signed steps are checked against it. Letting the buyer
   * swap wallets underneath it would produce a dialog whose every button
   * answers 403.
   */
  disabled: boolean;
  /** A buyable rectangle is selected and there is no wallet — the one moment this control is the thing in the way. */
  needed: boolean;
  onConnect: (wallet: UsableWallet) => void;
  onDisconnect: () => void;
  /**
   * `BoardView` needs to reach this control: pressing Buy with no wallet opens
   * it rather than refusing, and "opens it" means putting focus on the first
   * thing in it. React 19 passes `ref` as an ordinary prop.
   */
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} className="wallet-connect" data-needed={needed ? "yes" : "no"}>
      {/*
        Every outcome of a connect, said once, politely. Polite because it
        confirms what the buyer just set out to do — DESIGN.md reserves
        assertive for a refusal that invalidates what somebody is in the middle
        of, and choosing a wallet is not that.
      */}
      <p className="wallet-notice sr-only" role="status" aria-live="polite">
        {notice ?? ""}
      </p>

      {connected ? (
        /*
          THE CONNECTED STATE IS A MENU, and it is a `<details>` because that is
          the laziest thing that is actually a menu: the platform gives it the
          expanded state, the keyboard, the escape and the toggle for free. A
          popover built by hand needs a focus trap, a click-outside and an
          `aria-expanded` to hide one item.
        */
        <details className="wallet-connect__menu">
          <summary className="wallet-connect__button" title={`Connected with ${connected.name}`}>
            <span aria-hidden>◈</span>
            {/* The ends are what a person checks an address by, and they are
                what the extension itself shows. Nothing is hidden: the whole
                address is beside it for anything that reads rather than looks. */}
            <span className="tabular" aria-hidden>
              {shortAddress(connected.address)}
            </span>
            <span className="sr-only">{`Wallet menu. Connected with ${connected.name}, address ${connected.address}`}</span>
          </summary>
          <div className="wallet-connect__sheet">
            <p className="tabular mb-2 break-all text-[11.5px] text-body">{connected.address}</p>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={disabled}
              title={disabled ? "Finish or close the purchase first." : `Disconnect ${connected.name}`}
              className="btn-quiet w-full px-2 py-1.5 text-[12.5px]"
            >
              Disconnect
            </button>
          </div>
        </details>
      ) : !ready ? (
        // The registry answers on the first commit, so this is one frame. It
        // exists because the alternative is telling somebody who has a wallet
        // installed that they have not.
        <p className="text-[12.5px] text-body">Looking for a wallet…</p>
      ) : wallets.length === 0 ? (
        // Plainly, once, and with nothing to install named. Which wallet
        // somebody uses is their decision and this page has no stake in it.
        <p className="max-w-[13rem] text-[12.5px] text-body">No Solana wallet in this browser.</p>
      ) : wallets.length === 1 ? (
        // One wallet is the common case, and a list of one is a menu nobody
        // needs: the button connects it.
        <button
          type="button"
          className="wallet-connect__button"
          disabled={disabled || connecting !== null}
          onClick={() => onConnect(wallets[0])}
          /* The accessible name NAMES THE WALLET, which the visible label
             cannot at 390 and does not need to anywhere else. It is also what
             `purchase-e2e.test.ts` reaches for, and what a screen reader is
             told instead of the glyph. */
          aria-label={`Connect ${wallets[0].name}`}
          title={`Connect ${wallets[0].name}`}
        >
          <span aria-hidden>◈</span>
          <span className="wallet-connect__label" aria-hidden>
            {connecting ? "Connecting…" : "Connect wallet"}
          </span>
        </button>
      ) : (
        <details className="wallet-connect__menu">
          <summary className="wallet-connect__button">
            <span aria-hidden>◈</span>
            <span className="wallet-connect__label">Connect wallet</span>
            <span className="sr-only">Choose a wallet to connect</span>
          </summary>
          <div className="wallet-connect__sheet">
            {wallets.map((wallet) => (
              <button
                key={wallet.name}
                type="button"
                onClick={() => onConnect(wallet)}
                disabled={disabled || connecting !== null}
                aria-label={`Connect ${wallet.name}`}
                className="btn-quiet mb-1 w-full px-2 py-1.5 text-left text-[12.5px] last:mb-0"
              >
                {wallet.name}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
