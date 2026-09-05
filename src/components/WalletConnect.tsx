"use client";

import type { Ref } from "react";
import { shortAddress } from "../lib/wallet/standard";
import { OWNER_CHAIN_LABEL } from "../lib/board/owner";
import type { WalletsState } from "./useWallets";

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
/**
 * The three wallets this page names when a reader has none, and the two ways
 * into each.
 *
 * NAMING THREE IS NOT A RECOMMENDATION AND THE ORDER IS NOT A RANKING —
 * DESIGN.md's voice section refuses a product recommendation in the checkout,
 * and this is the smaller version of the same rule: a reader with no wallet
 * needs somewhere to go, and "go and find one" is not somewhere. Three is
 * enough to read as a list rather than an endorsement.
 *
 * `browse` is the wallet's own universal link, which opens THIS page inside its
 * in-app browser — the only thing that works on a phone, where an extension
 * cannot exist. **Backpack has no `browse` here** because this repository has
 * not verified the shape of its universal link, and a deep link that is guessed
 * is a link that fails silently on the device it was guessed for. It gets the
 * download page on both, and the gap is named rather than papered over.
 */
const INSTALLS: { name: string; install: string; browse?: (url: string) => string }[] = [
  {
    name: "Phantom",
    install: "https://phantom.app/download",
    browse: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(url)}`,
  },
  {
    name: "Solflare",
    install: "https://solflare.com/download",
    browse: (url) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(url)}`,
  },
  { name: "Backpack", install: "https://backpack.app/download" },
];

/** Whether the list spans both rails, which is the only time naming one helps. */
function bothChains(choices: WalletsState["choices"]): boolean {
  return choices.some((c) => c.chain === "solana") && choices.some((c) => c.chain === "robinhood");
}

export default function WalletConnect({
  choices,
  connected,
  connecting,
  notice,
  disabled,
  needed,
  onConnect,
  onDisconnect,
  ref,
}: Pick<WalletsState, "choices" | "connected" | "connecting" | "notice"> & {
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
  onConnect: (key: string) => void;
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
            <span className="sr-only">{`Wallet menu. Connected with ${connected.name} on ${OWNER_CHAIN_LABEL[connected.chain]}, address ${connected.address}`}</span>
          </summary>
          <div className="wallet-connect__sheet">
            {/*
              THE CHAIN IS NAMED HERE TOO. A rectangle is held by a (chain,
              address) pair and a buyer with wallets on both needs to see which
              one is about to sign — an address alone does not say, and the two
              alphabets are close enough at a glance to be mistaken.
            */}
            <p className="mb-1 text-[11.5px] text-body">{OWNER_CHAIN_LABEL[connected.chain]}</p>
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
      ) : choices.length === 0 ? (
        /*
          THE BUTTON IS ALWAYS THERE, WHETHER OR NOT THERE IS A WALLET.

          It used to become a sentence — "No Solana wallet in this browser" —
          which put prose in a bar this design keeps to one terse row and left
          nothing to press for the reader most likely to need pressing
          something: the one who has not got a wallet yet. The button is the
          same violet in both cases, and what changes is what opens under it.

          `!ready` falls in here too, on purpose. The registry answers on the
          first commit, so it is one frame — and a frame of the install sheet
          is a frame of the right shape, where a frame of "Looking for a
          wallet…" was a frame of a sentence that then vanished.
        */
        <details className="wallet-connect__menu">
          <summary className="wallet-connect__button">
            <span aria-hidden>◈</span>
            <span className="wallet-connect__label" aria-hidden>
              Connect wallet
            </span>
            <span className="sr-only">Connect wallet. You will need a wallet first.</span>
          </summary>
          <div className="wallet-connect__sheet">
            <p className="mb-2 text-[12.5px] leading-snug text-body">
              Buying is signed, so it needs a wallet. These work here — the first three on
              Solana, the last on Robinhood Chain:
            </p>
            {INSTALLS.map((install) => (
              <a
                key={install.name}
                href={install.install}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-quiet mb-1 block w-full px-2 py-1.5 text-left text-[12.5px] last:mb-0"
                /*
                  A PHONE GETS THE WALLET'S OWN BROWSER, a desktop gets the
                  download page, and the choice is made on the press rather than
                  on the render — a render that asked the pointer would be a
                  render the server cannot reproduce, which is a hydration
                  mismatch for the sake of one attribute.

                  The deep link carries THIS page's own URL, read from
                  `location` rather than from anything a caller supplied, so
                  there is no parameter here anybody could point somewhere else.
                */
                onClick={(event) => {
                  if (!install.browse) return;
                  if (!window.matchMedia("(pointer: coarse)").matches) return;
                  event.preventDefault();
                  window.location.href = install.browse(window.location.href);
                }}
              >
                {install.name}
              </a>
            ))}
          </div>
        </details>
      ) : choices.length === 1 ? (
        // One wallet is the common case, and a list of one is a menu nobody
        // needs: the button connects it.
        <button
          type="button"
          className="wallet-connect__button"
          disabled={disabled || connecting !== null}
          onClick={() => onConnect(choices[0].key)}
          /* The accessible name NAMES THE WALLET, which the visible label
             cannot at 390 and does not need to anywhere else. It is also what
             `purchase-e2e.test.ts` reaches for, and what a screen reader is
             told instead of the glyph. */
          aria-label={`Connect ${choices[0].name}`}
          title={`Connect ${choices[0].name} on ${OWNER_CHAIN_LABEL[choices[0].chain]}`}
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
            {/*
              ONE ROW PER WALLET, WITH ITS CHAIN BESIDE IT, and the chain is
              shown only when both are on offer. A reader with one Solana wallet
              does not need to be taught that a chain exists; a reader holding
              both needs to know which button signs with which, because the
              rectangle they end up owning is held by the pair.
            */}
            {choices.map((choice) => (
              <button
                key={choice.key}
                type="button"
                onClick={() => onConnect(choice.key)}
                disabled={disabled || connecting !== null}
                aria-label={`Connect ${choice.name}`}
                className="btn-quiet mb-1 flex w-full items-baseline justify-between gap-2 px-2 py-1.5 text-left text-[12.5px] last:mb-0"
              >
                <span>{choice.name}</span>
                {bothChains(choices) && (
                  <span className="text-[11px] text-body">{OWNER_CHAIN_LABEL[choice.chain]}</span>
                )}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
