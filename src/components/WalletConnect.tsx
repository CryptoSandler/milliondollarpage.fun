"use client";

import { shortAddress, type UsableWallet } from "../lib/wallet/standard";
import type { WalletState } from "./useWallet";

/**
 * The control that replaced the wallet address field.
 *
 * WHO CALLS THIS: `BoardView` (src/components/BoardView.tsx), which renders it
 * into the one block of controls SelectionPanel takes as children — the same
 * `.wallet-field` slot the text input used, so every layout rule in
 * globals.css that places the wallet between the readout and the Buy button
 * keeps working in both the bottom bar and the side panel.
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
 * No colour is introduced anywhere in this file. Every class is one the
 * stylesheet already defines and DESIGN.md has already measured — `btn-quiet`,
 * `label-caps`, `text-body`, `text-ink` — so there is no new ratio here to
 * claim or to fail to measure.
 */
/**
 * The row the wallet buttons sit in, and the four pixels that make its focus
 * ring visible.
 *
 * `overflow-x: auto` is what keeps a bar of three wallets from widening a bar
 * DESIGN.md fixes at one row — and it CLIPS AT THE PADDING BOX, so without the
 * `p-1` the page's 2px ring at its 2px offset is cut off on every side of every
 * button in here. The `-m-1` hands those four pixels back to the layout, so
 * nothing moves.
 *
 * That was not reasoned out from the stylesheet, which said `outline: 2px solid
 * var(--primary)` the whole time. It was sampled out of a screenshot of this
 * control, where three of the four sides came back `#fbf5e8` — the panel's own
 * cream — and it is pinned by "the focus ring survives both layouts" in
 * `purchase-e2e.test.ts`, which reads the same pixels back.
 */
const WALLET_ROW = "scrollbar-none -m-1 flex min-w-0 items-center gap-1.5 overflow-x-auto p-1";

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
}: Pick<WalletState, "wallets" | "connected" | "connecting" | "notice" | "ready"> & {
  /**
   * True while a purchase dialog is open.
   *
   * The hold inside that dialog belongs to the address it was created with, and
   * all three of its signed steps are checked against it. Letting the buyer
   * swap wallets underneath it would produce a dialog whose every button
   * answers 403. The text field this replaced was disabled for exactly the same
   * reason and in exactly the same condition.
   */
  disabled: boolean;
  /** A buyable rectangle is selected and there is no wallet — the one moment this control is the thing in the way. */
  needed: boolean;
  onConnect: (wallet: UsableWallet) => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="wallet-field flex min-w-0 shrink-0 flex-col justify-center gap-1">
      <span className="label-caps hidden items-center gap-1.5 sm:flex">
        Wallet
        {needed && <span className="font-bold text-primary-pressed">needed</span>}
      </span>

      {/*
        Every outcome of a connect, said once, politely.

        Polite because it confirms what the buyer just set out to do —
        DESIGN.md reserves assertive for a refusal that invalidates what
        somebody is in the middle of, and choosing a wallet is not that.

        It is `sr-only` in the bottom bar and printed in the side panel, which
        is not two behaviours but the shed order DESIGN.md already sets out:
        the bar "runs out of width" and gives things up that the panel, which
        has the height, keeps. What a sighted buyer sees in the bar is the
        control itself changing — the address appears, or the buttons are still
        there — and what everybody hears is this.
      */}
      <p className="wallet-notice sr-only" role="status" aria-live="polite">
        {notice ?? ""}
      </p>

      {connected ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="tabular min-w-0 truncate text-[12.5px] font-semibold text-ink">
            {/* The ends are what a person checks an address by, and they are
                what the extension itself shows. Nothing is hidden: the whole
                address is beside it for anything that reads rather than looks. */}
            <span aria-hidden>{shortAddress(connected.address)}</span>
            <span className="sr-only">{`Connected with ${connected.name}, address ${connected.address}`}</span>
          </span>
          <button
            type="button"
            onClick={onDisconnect}
            disabled={disabled}
            title={disabled ? "Finish or close the purchase first." : `Disconnect ${connected.name}`}
            className="btn-quiet shrink-0 px-2 py-1.5 text-[12.5px]"
          >
            Disconnect
          </button>
        </div>
      ) : !ready ? (
        // The registry answers on the first commit, so this is one frame. It
        // exists because the alternative is telling somebody who has a wallet
        // installed that they have not, which is a false sentence however
        // briefly it is on screen.
        <p className="text-[12.5px] text-body">Looking for a wallet…</p>
      ) : wallets.length === 0 ? (
        // Plainly, once, and with nothing to install named. Which wallet
        // somebody uses is their decision and this page has no stake in it —
        // DESIGN.md's voice is "plain, warm, specific", and a product
        // recommendation here would be an advert in the checkout.
        <p className="max-w-[13rem] text-[12.5px] text-body">
          No Solana wallet in this browser. Buying is signed, so there is nothing to connect to yet.
        </p>
      ) : (
        <div className={WALLET_ROW}>
          {wallets.map((wallet) => (
            <button
              key={wallet.name}
              type="button"
              onClick={() => onConnect(wallet)}
              // Disabled while any connect is in flight, not only its own: two
              // wallet prompts open at once is a race whose loser silently
              // replaces the winner.
              disabled={disabled || connecting !== null}
              aria-label={`Connect ${wallet.name}`}
              title={`Connect ${wallet.name}`}
              // The terracotta border is the "needed" marker for a screen too
              // narrow to show either the label beside it or the hint under
              // Buy — the text field this replaced carried exactly this class
              // in exactly this condition, and dropping it would have left a
              // phone with no sign at all of what is in the way.
              className={`btn-quiet flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] ${
                needed ? "border-primary" : ""
              }`}
            >
              {wallet.icon && (
                // eslint-disable-next-line @next/next/no-img-element -- a data: URI from the extension, not something next/image can optimize.
                <img src={wallet.icon} alt="" aria-hidden className="size-4 shrink-0 rounded-xs" />
              )}
              {connecting === wallet.name ? "Connecting…" : wallet.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
