"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBlockDetails } from "../lib/board/block-details";
import { blockImageUrl } from "../lib/board/block-image";
import type { BlockDetails, BoardRect, BoardStats } from "../lib/board/blocks";
import type { Wall } from "../lib/board/composite";
import type { Point } from "../lib/board/geometry";
import { holdMinutes } from "../lib/board/hold-clock";
import { walletSigner } from "../lib/board/purchase-client";
import type { Selection } from "../lib/board/selection";
import type { TapeRow } from "../lib/board/tape";
import { BOARD_INSET, type Chrome } from "../lib/canvas/viewport";
import BlockCard from "./BlockCard";
import BoardCanvas, { type ZoomControls, type ZoomState } from "./BoardCanvas";
import BoardCounters from "./BoardCounters";
import InteractionLegend from "./InteractionLegend";
import OnlineBanner from "./OnlineBanner";
import PurchaseDialog from "./PurchaseDialog";
import PurchaseTape from "./PurchaseTape";
import SelectionPanel from "./SelectionPanel";
import WalletConnect from "./WalletConnect";
import { useWallet } from "./useWallet";

/**
 * What `/api/board` ships, and what the page is rendered from on the server.
 *
 * `rects` carries no content at all and `wall` is one bitmap for all of it —
 * see `src/lib/board/composite.ts` for why a row per block with a bitmap per
 * block stopped being the right shape the moment a pixel became the unit.
 */
type BoardPayload = {
  rects: BoardRect[];
  wall: Wall | null;
  stats: BoardStats;
  pricePerPixelBaseUnits: number;
  /** The settled-purchase register along the bottom. See `PurchaseTape`. */
  tape: TapeRow[];
  /** When the server built this payload, so the tape's ages hydrate cleanly. */
  asOf: string;
  /** How many people are on the wall right now. See `OnlineBanner`. */
  online: number;
};

// Matches the --bar-top-h / --bar-bottom-h defaults in globals.css: the very
// first paint, before the chrome exists to be measured, has to assume
// something, and this is what the CSS assumes too. Every side already carries
// BOARD_INSET, so the first paint leaves the same strip of paper round the
// board — and the same room for its frame — that every later one does.
const FALLBACK_BAR_BOTTOM = 88;
const FALLBACK_CHROME: Chrome = {
  top: 52 + BOARD_INSET,
  right: BOARD_INSET,
  bottom: FALLBACK_BAR_BOTTOM + BOARD_INSET,
  left: BOARD_INSET,
};

// Somebody else's hold, or your own abandoned attempt in another tab, is
// invisible until the board refetches — the selector otherwise keeps
// offering rectangles the server will refuse. Thirty seconds: the hold
// window is thirty minutes, so this is frequent enough that a stale
// rectangle is rare, and the payload (see /api/board) is small enough that
// twice a minute per open tab is nowhere near "hammering" the endpoint. It
// is also what brings a NEW WALL VERSION down; the bitmap itself is fetched
// only when that version actually changes, because its URL is its hash.
const REFRESH_INTERVAL_MS = 30_000;

export default function BoardView({ initial }: { initial: BoardPayload }) {
  const [board, setBoard] = useState(initial);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [hovered, setHovered] = useState<{ rect: BoardRect; at: Point } | null>(null);
  const [chrome, setChrome] = useState<Chrome>(FALLBACK_CHROME);
  /**
   * The connected wallet, and with it the buyer's address.
   *
   * It was a `useState("")` behind a text input until this batch, and the
   * comment here said so: "no connection and no signature yet, only an address
   * the buyer types in". There is one now. The address is READ from the
   * connection rather than stored beside it, because two copies of it are two
   * things that can disagree about which key is going to sign — and every one
   * of the three signed steps is checked against this exact string.
   */
  const wallet = useWallet();
  const buyerPubkey = wallet.connected?.address ?? "";

  /**
   * The one seam every signed step goes through.
   *
   * `walletSigner` returned a bare null for the whole of batch 3, which is
   * what turned Continue, Pay and the buyer's own release off and put a
   * sentence beside each of them. Handing it a real signer here turns all
   * three back on at once, because all three go through `prove(...)` in
   * purchase-client.ts — one seam, not three.
   *
   * Memoised on the signer itself so a re-render for any other reason does not
   * hand PurchaseDialog a new function identity for the same wallet.
   */
  const sign = useMemo(
    () => walletSigner(wallet.connected?.signer ?? null),
    [wallet.connected?.signer],
  );
  // The selection a purchase is in progress for. Frozen separately from
  // `selection` so the canvas remains free to change (or clear) the live
  // selection underneath a dialog that is already holding a rectangle.
  const [purchaseSelection, setPurchaseSelection] = useState<Selection | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * The holds this browser started, newest first.
   *
   * Kept in BoardView rather than in the dialog because it has to outlive the
   * dialog: an abandoned hold is exactly the case this whole feature exists
   * for, and the board should keep saying "that one is yours" after the
   * dialog is gone.
   *
   * This is the ONLY place ownership is known on the client, and it is known
   * by memory, not by disclosure: /api/board publishes no buyerPubkey and
   * these are ids this session created. Nobody else's hold can ever end up in
   * here, so nothing about anybody else can ever be painted from it.
   */
  const [ownHoldIds, setOwnHoldIds] = useState<string[]>([]);
  const topBarRef = useRef<HTMLElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const tapeRef = useRef<HTMLElement>(null);
  /**
   * The board canvas, held here rather than inside BoardCanvas.
   *
   * Only one thing out here needs the node, and it needs it badly: when the
   * purchase dialog closes, the Buy button that opened it is disabled — its
   * selection has just been cleared — so the focus the platform tries to hand
   * back has nowhere to land, and a keyboard user is dropped at the top of the
   * page. The board is where the rectangle was and where they carry on, so it
   * is the answer, and PurchaseDialog is handed this to fall back on.
   */
  const boardRef = useRef<HTMLCanvasElement>(null);
  /**
   * The board's zoom, reachable from the panel.
   *
   * The viewport stays inside BoardCanvas — it is the only thing that knows
   * how big its own box is — so what crosses this boundary is three commands
   * going down and two booleans coming back up, rather than a second copy of
   * the scale for the two of them to disagree about.
   */
  const zoomControlsRef = useRef<ZoomControls | null>(null);
  const [zoom, setZoom] = useState<ZoomState>({ canZoomIn: true, canZoomOut: false });

  // Guarded against re-setting an identical pair: this fires on every draw
  // the scale or the chrome touches, and a fresh object each time would
  // re-render the whole panel for no change at all.
  const handleZoomStateChange = useCallback((next: ZoomState) => {
    setZoom((current) =>
      current.canZoomIn === next.canZoomIn && current.canZoomOut === next.canZoomOut
        ? current
        : next,
    );
  }, []);

  const zoomIn = useCallback(() => zoomControlsRef.current?.in(), []);
  const zoomOut = useCallback(() => zoomControlsRef.current?.out(), []);
  const zoomFit = useCallback(() => zoomControlsRef.current?.fit(), []);

  const clear = useCallback(() => setSelection(null), []);

  // Switching presets (or back to freehand) should not carry a stale
  // selection along with it, so the reset happens in the same event handler
  // that changes the preset rather than in an effect watching for it.
  const changePreset = useCallback((size: number | null) => {
    setActivePreset(size);
    setSelection(null);
  }, []);

  const handleHover = useCallback((rect: BoardRect | null, at: Point | null) => {
    setHovered(rect && at ? { rect, at } : null);
  }, []);

  /**
   * The captions and links fetched so far, and the one place that fetches
   * them.
   *
   * Here rather than in BoardCanvas because two things read the same answer:
   * the hover card below, and the canvas — for its caption chip and for the
   * live region that mirrors the keyboard cursor. One cache, so a screen
   * reader and a hover card can never be told different things about the same
   * rectangle.
   *
   * `pending` is a plain ref rather than state: it exists only to stop a
   * second request while the first is in flight, and re-rendering because a
   * request started would be a re-render for nothing. A rectangle whose fetch
   * failed stays in it, which is deliberate — the answer was "nothing to
   * show", and asking again on every pointer move over a 404 would be a poll
   * nobody asked for.
   */
  const [details, setDetails] = useState<Map<string, BlockDetails>>(() => new Map());
  const pending = useRef(new Set<string>());

  const requestDetails = useCallback((id: string) => {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    void fetchBlockDetails(id).then((found) => {
      if (!found) return;
      setDetails((current) => new Map(current).set(id, found));
    });
  }, []);

  const rememberOwnHold = useCallback((orderId: string) => {
    setOwnHoldIds((current) => (current.includes(orderId) ? current : [orderId, ...current]));
  }, []);

  const forgetOwnHold = useCallback((orderId: string) => {
    setOwnHoldIds((current) => current.filter((id) => id !== orderId));
  }, []);

  // Re-fetches the same payload the page loaded with. Best-effort: a failed
  // refresh just leaves the board as it was, and the next reservation sweep
  // or page reload catches up.
  const refreshBoard = useCallback(async () => {
    try {
      const response = await fetch("/api/board", { cache: "no-store" });
      if (!response.ok) return;
      setBoard((await response.json()) as BoardPayload);
    } catch {
      // Nothing useful to show for a failed poll; see comment above.
    }
  }, []);

  const walletMissing = buyerPubkey.trim() === "";

  /**
   * The one sentence under the Buy button, and whether the button works.
   *
   * Every state a buyer can be in gets a specific answer to "why can't I press
   * this", or — when they can — to "what happens if I do". Nothing here says
   * WHO holds a rectangle, only that it is held and that holds end.
   */
  const buyState = useMemo((): { canBuy: boolean; hint: string; tone: "info" | "refused" } => {
    if (!selection) {
      return {
        canBuy: false,
        // Both ways in, because there are two now: a drag, and the arrow keys
        // on a board that can take focus. A hint that names only the pointer
        // is a hint that tells half the people reading it nothing.
        hint: "Pick a size, or outline one on the board with a drag or the arrow keys.",
        tone: "info",
      };
    }

    if (selection.collidesWith.length > 0) {
      const taken = new Set(selection.collidesWith);
      const hit = board.rects.filter((rect) => taken.has(rect.id));
      const held = hit.filter((rect) => rect.status === "reserved").length;
      const sold = hit.length - held;

      // Everything in the way is a hold this browser started. Buy stays ON:
      // the server resumes an exact match and hands back the hold with its
      // clock still running, and offers to release anything that only
      // partly overlaps. Refusing here would put the selector in front of
      // the one refusal the buyer can actually undo.
      if (hit.length > 0 && hit.every((rect) => ownHoldIds.includes(rect.id))) {
        if (walletMissing) {
          return {
            canBuy: false,
            hint: "These are already yours to finish — connect the wallet that started them to pick the hold back up.",
            tone: "info",
          };
        }
        return {
          canBuy: true,
          hint: "You are already holding these. Buy picks that hold up where you left it.",
          tone: "info",
        };
      }

      if (sold > 0 && held > 0) {
        return {
          canBuy: false,
          hint: `${hit.length} blocks here are sold or on hold — move your selection off the outlined ones.`,
          tone: "refused",
        };
      }
      if (sold > 0) {
        return {
          canBuy: false,
          hint: `${sold === 1 ? "A block" : `${sold} blocks`} here ${
            sold === 1 ? "is" : "are"
          } already sold — move or resize your selection.`,
          tone: "refused",
        };
      }
      return {
        canBuy: false,
        hint: "Part of this is on hold mid-purchase. It reopens within half an hour at the outside, if that purchase is not finished.",
        tone: "refused",
      };
    }

    if (!selection.buyable) {
      return {
        canBuy: false,
        hint: "That rectangle runs off the board. Drag one that sits inside it.",
        tone: "refused",
      };
    }

    if (walletMissing) {
      return {
        canBuy: false,
        hint: "Connect a wallet to buy. Nothing is held until you do.",
        tone: "info",
      };
    }

    return {
      canBuy: true,
      hint: `Holds these pixels for ${holdMinutes(selection.pixels)} minutes while you upload.`,
      tone: "info",
    };
  }, [selection, board.rects, walletMissing, ownHoldIds]);

  // A second press while a dialog is already open must not start a second
  // purchase. The scrim makes that all but unreachable by mouse; this is the
  // part that does not depend on a z-index.
  const handleBuy = useCallback(() => {
    if (!selection || !buyState.canBuy || purchaseSelection !== null) return;
    setPurchaseSelection(selection);
  }, [selection, buyState.canBuy, purchaseSelection]);

  // Reservation holds sweep expired rows as a side effect of being created,
  // and a purchase turns a block from reserved to paid — either way the
  // board this instance last fetched may now be stale, whether the dialog
  // ends in a completed purchase or in a rectangle somebody else just took.
  const closeDialog = useCallback(
    (dialogNotice?: string) => {
      setPurchaseSelection(null);
      setSelection(null);
      setNotice(dialogNotice ?? null);
      void refreshBoard();
    },
    [refreshBoard],
  );

  const handlePurchased = useCallback(() => {
    void refreshBoard();
  }, [refreshBoard]);

  // Whether PurchaseDialog is currently past its "holding" step — describing,
  // confirming, paying, or done — with no fatal message on screen. A
  // background repaint of the board is disorienting under an open form, and
  // the buyer's own rectangle is already held either way. A plain ref, not
  // state: the interval and the visibility listener below only need to read
  // the current value when they fire, not re-run when it changes.
  const dialogBlocksRefresh = useRef(false);

  const setDialogBlocksRefresh = useCallback((blocked: boolean) => {
    dialogBlocksRefresh.current = blocked;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (dialogBlocksRefresh.current) return;
      void refreshBoard();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshBoard]);

  // A tab left open for an hour and then refocused holds the most stale
  // board of anyone; catch it the moment it becomes visible again rather
  // than waiting for the next poll tick.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (dialogBlocksRefresh.current) return;
      void refreshBoard();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refreshBoard]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timeout);
  }, [notice]);

  /**
   * The chrome the board has to stay clear of, measured rather than assumed.
   *
   * --bar-top-h / --bar-bottom-h / --panel-w are nominal sizes, mirrored by
   * FALLBACK_CHROME above for the very first paint. They are not enough on
   * their own: the real box also depends on env(safe-area-inset-bottom) and on
   * rem sizing that a static JS number cannot mirror, so this measures the two
   * elements directly.
   *
   * WHICH LAYOUT IS IN FORCE is read back off the controls element's own box,
   * not duplicated here as a matchMedia call. globals.css is the only place
   * that decides, so there is nothing to desync — and nothing that renders one
   * way on the server and another after hydration, which is the flash the
   * Next.js guidance on client-only state warns about.
   *
   * This cannot loop: the measured sizes only flow into `chrome` state, which
   * affects the canvas's viewport (a different element) and the hover card's
   * position, never a style on the measured elements themselves from inside
   * their own observer callback.
   */
  useEffect(() => {
    const topEl = topBarRef.current;
    const controlsEl = controlsRef.current;
    const tapeEl = tapeRef.current;
    if (!topEl || !controlsEl || !tapeEl) return;

    function measure() {
      const top = topEl!.offsetHeight || FALLBACK_CHROME.top;
      const box = controlsEl!.getBoundingClientRect();
      // The settled-purchase rail. `display: none` below the side-panel
      // layout, and an element that is not displayed measures zero — so this
      // one number covers both layouts without a second media query in JS,
      // exactly as the panel/bar decision above is read back off a box rather
      // than re-asked. It is measured rather than taken from --tape-h for the
      // same reason everything else here is: the rail's real height includes
      // whatever line-height and rem sizing the browser actually applied.
      const tape = tapeEl!.getBoundingClientRect().height;
      // A controls block narrower than the window is the side panel, anchored
      // to the left edge; one that spans the window is the bottom bar.
      const side = box.width > 0 && box.width < window.innerWidth - 1;
      // BOARD_INSET is added to all four sides in both layouts, because in
      // both of them every edge is one the board would otherwise sit flush
      // against: the window's own edges, the bar's top edge, the panel's right
      // edge. It used to be a bottom gap only, and the two sides it left out
      // are exactly where the board was being cut off — the fit is scaled by
      // its limiting dimension, so when width limits, the board's edge lands
      // on the free region's edge to the pixel and its frame lands outside the
      // window. It is part of the chrome, so the fit maths takes it out of the
      // board's share rather than a margin adding it to the page, which is
      // what keeps the document from scrolling.
      setChrome(
        side
          ? {
              top: top + BOARD_INSET,
              right: BOARD_INSET,
              bottom: tape + BOARD_INSET,
              left: box.right + BOARD_INSET,
            }
          : {
              top: top + BOARD_INSET,
              right: BOARD_INSET,
              bottom: (box.height || FALLBACK_BAR_BOTTOM) + tape + BOARD_INSET,
              left: BOARD_INSET,
            },
      );
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(topEl);
    observer.observe(controlsEl);
    observer.observe(tapeEl);
    return () => observer.disconnect();
  }, []);

  const walletNeeded = selection?.buyable === true && walletMissing;

  return (
    <div className="board-shell">
      <BoardCanvas
        rects={board.rects}
        wall={board.wall}
        details={details}
        onNeedDetails={requestDetails}
        ownHoldIds={ownHoldIds}
        selection={selection}
        activePreset={activePreset}
        perPixel={board.pricePerPixelBaseUnits}
        chrome={chrome}
        zoomControlsRef={zoomControlsRef}
        boardRef={boardRef}
        onSelectionChange={setSelection}
        onHoverChange={handleHover}
        onZoomStateChange={handleZoomStateChange}
        onActivate={handleBuy}
        activateHint={buyState.hint}
      />

      <header ref={topBarRef} className="board-bar board-bar--top">
        <h1 className="flex shrink-0 items-center gap-2 font-display text-[17px] font-bold tracking-tight">
          <span
            aria-hidden
            className="size-2.5 rounded-full bg-primary ring-3 ring-primary-soft"
          />
          milliondollarpage.fun
        </h1>
        <div className="ml-auto min-w-0">
          <BoardCounters stats={board.stats} perPixel={board.pricePerPixelBaseUnits} />
        </div>
        {/*
          Who else is here. It sits after the counters in the shed order, which
          puts it among the first things to go as the bar narrows — the offer
          and the count are what the bar is for, and this is context. It is
          also the only thing in the bar that is about people rather than
          pixels, which is why it carries a dot and not a number alone.
        */}
        <OnlineBanner online={board.online} />
        {/*
          The way to the answers, in the bar rather than buried in the
          checkout. What losing a key costs and what a takedown does are things
          somebody should be able to read BEFORE they have a rectangle held and
          a clock running — the confirmation screen carries the short form and
          links to the same page.

          It is a real link and not a dialog, so it can be opened in a tab,
          read at length and sent to somebody else. Below `sm` it gives way
          with everything else the bar sheds.
        */}
        <Link
          href="/faq"
          className="btn-quiet ml-3 hidden shrink-0 px-2.5 py-1.5 text-[12.5px] sm:block"
        >
          Questions
        </Link>
      </header>

      <PurchaseTape ref={tapeRef} rows={board.tape} asOf={board.asOf} />

      <div ref={controlsRef} className="board-controls">
        <SelectionPanel
          selection={selection}
          perPixel={board.pricePerPixelBaseUnits}
          activePreset={activePreset}
          zoom={zoom}
          canBuy={buyState.canBuy && purchaseSelection === null}
          hint={buyState.hint}
          hintTone={buyState.tone}
          onPresetChange={changePreset}
          onClear={clear}
          onBuy={handleBuy}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomFit={zoomFit}
        >
          <InteractionLegend />

          {/* The wallet lives exactly where the address field lived — same
              slot, same `.wallet-field` hook — so the panel and the bar place
              it without either layout knowing it changed. See WalletConnect
              for why the typed field is gone rather than kept alongside. */}
          <WalletConnect
            wallets={wallet.wallets}
            connected={wallet.connected}
            connecting={wallet.connecting}
            notice={wallet.notice}
            ready={wallet.ready}
            disabled={purchaseSelection !== null}
            needed={walletNeeded}
            onConnect={wallet.connect}
            onDisconnect={wallet.disconnect}
          />
        </SelectionPanel>
      </div>

      {hovered && (
        <div
          className="floating-card pointer-events-none fixed z-20 w-56 p-3"
          style={{
            left: Math.min(hovered.at.x + 14, (typeof window === "undefined" ? 1200 : window.innerWidth) - 240),
            top: Math.max(chrome.top + 8, hovered.at.y - 96),
          }}
        >
          {/*
            The rectangle and its state come off the board payload and are
            there the instant the pointer arrives. The caption and the link do
            not: they are fetched for this one rectangle, so the card says what
            it knows first and fills the words in when they land. A hold
            publishes neither, and never will — and it has no picture either,
            so it gets no frame rather than an empty one.

            The card itself is BlockCard, which the checkout also renders. That
            is the whole point: what a buyer is shown before paying and what a
            visitor is shown afterwards are one component, so they cannot come
            to disagree about how a rectangle looks.
          */}
          <BlockCard
            imageSrc={hovered.rect.status === "reserved" ? null : blockImageUrl(hovered.rect.id)}
            caption={details.get(hovered.rect.id)?.caption ?? null}
            link={details.get(hovered.rect.id)?.link ?? null}
            rect={hovered.rect}
            state={
              hovered.rect.status === "reserved"
                ? { kind: "held", own: ownHoldIds.includes(hovered.rect.id) }
                : { kind: "sold" }
            }
          />
        </div>
      )}

      {notice && (
        <div
          className="floating-card fixed z-30 max-w-md -translate-x-1/2 px-4 py-3 text-[13px] text-ink-soft"
          role="status"
          // Centred on the BOARD, not on the window: in the side-panel layout
          // the window's middle is a couple of hundred pixels left of the
          // artwork this is a notice about.
          style={{
            top: `calc(${chrome.top}px + 12px)`,
            left: `calc(${chrome.left}px + (100vw - ${chrome.left}px - ${chrome.right}px) / 2)`,
          }}
        >
          {notice}
        </div>
      )}

      {purchaseSelection && (
        <PurchaseDialog
          selection={purchaseSelection}
          buyerPubkey={buyerPubkey}
          sign={sign}
          knownHoldIds={ownHoldIds}
          onHoldStarted={rememberOwnHold}
          onHoldEnded={forgetOwnHold}
          onClose={closeDialog}
          onPurchased={handlePurchased}
          onRefresh={refreshBoard}
          onGateChange={setDialogBlocksRefresh}
          returnFocusRef={boardRef}
        />
      )}
    </div>
  );
}
