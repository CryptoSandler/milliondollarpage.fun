"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBlockDetails } from "../lib/board/block-details";
import { blockImageUrl } from "../lib/board/block-image";
import type { BlockDetails, BoardRect, BoardStats, Standing } from "../lib/board/blocks";
import type { Wall } from "../lib/board/composite";
import type { Point } from "../lib/board/geometry";
import { holdMinutes } from "../lib/board/hold-clock";
import { offerLine } from "../lib/board/pricing";
import { walletSigner } from "../lib/board/purchase-client";
import type { Selection } from "../lib/board/selection";
import type { TapeRow } from "../lib/board/tape";
import { BAR_TOP_PX, BOARD_INSET, type Chrome, hoverCardLeft } from "../lib/canvas/viewport";
import BlockCard from "./BlockCard";
import BoardCanvas, { type ZoomControls, type ZoomState } from "./BoardCanvas";
import BoardCounters from "./BoardCounters";
import EmptyWall from "./EmptyWall";
import BoardRail from "./BoardRail";
import BoardStandings from "./BoardStandings";
import OnlineBanner from "./OnlineBanner";
import PurchaseDialog from "./PurchaseDialog";
import PurchaseTape from "./PurchaseTape";
import ThemeToggle from "./ThemeToggle";
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
  /**
   * The five biggest rectangles, for the foot of the right rail. Empty until
   * something is sold, and never a total — see `BoardStandings`.
   */
  standings: Standing[];
};

// Matches the --bar-top-h / --bar-bottom-h defaults in globals.css: the very
// first paint, before the chrome exists to be measured, has to assume
// something, and this is what the CSS assumes too. Every side already carries
// BOARD_INSET, so the first paint leaves the same strip of paper round the
// board — and the same room for its frame — that every later one does.
const FALLBACK_TAPE = 26;
const FALLBACK_CHROME: Chrome = {
  top: BAR_TOP_PX + BOARD_INSET,
  right: BOARD_INSET,
  bottom: FALLBACK_TAPE + BOARD_INSET,
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

/**
 * How long the pointer has to be still before the board's overlay gets out of
 * the way, where it is standing on the wall.
 *
 * Two seconds: long enough that it is never fading while somebody is reaching
 * for a preset, short enough that a reader who has stopped to LOOK at the wall
 * — which is the whole state this exists for — gets it uncovered almost at
 * once.
 */
const OVERLAY_REST_MS = 2_000;

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
   * The two side rails, which exist as boxes only where the layout has room for
   * them.
   *
   * They are `display: contents` in the layout without rails, so they have no
   * box at all there and `getBoundingClientRect()` comes back a row of zeros —
   * which is the truthful answer rather than a special case, and it is what
   * lets the measurement below carry one branch instead of a media query.
   */
  const leftRailRef = useRef<HTMLDivElement>(null);
  /**
   * The wallet control in the bar, so Buy can open it.
   *
   * Buy is enabled with no wallet connected now: a disabled button with a
   * sentence beside it is an explanation asking to be read, and a button that
   * does the next thing is the next thing. What "opens it" means is focus —
   * the control is a `<details>` or a button, and focus is what a keyboard and
   * a pointer both understand.
   */
  const walletRef = useRef<HTMLDivElement>(null);
  const rightRailRef = useRef<HTMLDivElement>(null);
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

    /*
      NO WALLET IS NOT A REFUSAL ANY MORE. Buy stays on and opens the connector
      in the bar — the panel is the selection and the button, and a sentence
      saying "connect a wallet to buy" was taking the width the price is in.
      What it costs is one extra press for somebody who has not connected, and
      what it buys is a panel with two things in it.
    */
    if (walletMissing) {
      return {
        canBuy: true,
        hint: "Buying is signed — this opens your wallet first. Nothing is held until it does.",
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
    /*
      NO WALLET: OPEN THE ONE IN THE BAR RATHER THAN START A PURCHASE. Every
      step of a purchase is signed, so a hold started without a key is a hold
      nobody can finish — the old panel refused with a sentence, and this does
      the thing the sentence was asking for.
    */
    if (walletMissing) {
      const control = walletRef.current;
      const opener = control?.querySelector<HTMLElement>("summary, button");
      if (opener) {
        opener.focus();
        opener.click();
        return;
      }
    }
    setPurchaseSelection(selection);
  }, [selection, buyState.canBuy, purchaseSelection, walletMissing]);

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
    const tapeEl = tapeRef.current;
    const leftEl = leftRailRef.current;
    const rightEl = rightRailRef.current;
    if (!topEl || !tapeEl || !leftEl || !rightEl) return;

    function measure() {
      const top = topEl!.offsetHeight || FALLBACK_CHROME.top;
      // The settled-purchase rail. `display: none` below the side-panel
      // layout, and an element that is not displayed measures zero — so this
      // one number covers both layouts without a second media query in JS,
      // exactly as the panel/bar decision above is read back off a box rather
      // than re-asked. It is measured rather than taken from --tape-h for the
      // same reason everything else here is: the rail's real height includes
      // whatever line-height and rem sizing the browser actually applied.
      const tape = tapeEl!.getBoundingClientRect().height;
      /*
        THE BOARD TAKES EVERY PIXEL OF HEIGHT THE BUDGET LEAVES.

        The chrome is a 34px header and a 26px rail — 60px — plus 8px of inset
        on each side. Nothing else displaces the board: the purchase panel
        FLOATS, so it is not in this sum at all, and the preset rail sits over
        the board's own edge.

        Left and right are the inset alone WHERE THERE ARE NO SIDE RAILS, which
        is every viewport under the threshold in `sideRailWidth`: a 288px panel
        was 20% of a 1440 window taken from the dimension the board is shortest
        in, and it was taken whether or not anybody was buying anything. Where
        there ARE rails they are added below — out of width the board could not
        have used at any scale, which is the whole of that amendment.

        The board is then scaled by whichever of its dimensions limits first and
        centred, so the spare width becomes letterbox — which is exactly where
        the floating panel goes when there is any.
      */
      /*
        THE SIDE RAILS, WHERE THERE ARE ANY, AND THEY COST NO HEIGHT.

        A rail has a box only above the width its contents need — see
        `sideRailWidth`, and the boot script in layout.tsx that decides it
        before the first paint. Where it has one, three things follow at once
        and they follow from this measurement rather than from a second
        opinion about the viewport: the board's left and right insets grow by
        the rails, the settled register has left the bottom of the window for
        the right rail, so the bottom is the board's own inset and nothing
        else, and the vertical chrome is the header alone.

        Read off the boxes, not off `--rail-w`. The custom property is what the
        stylesheet was TOLD; these are what the browser actually laid out, and
        the whole reason this effect exists is that those two have been
        different before.
      */
      const left = leftEl!.getBoundingClientRect().width;
      const right = rightEl!.getBoundingClientRect().width;
      const railed = right > 0;

      setChrome({
        top: top + BOARD_INSET,
        right: right + BOARD_INSET,
        bottom: (railed ? 0 : tape) + BOARD_INSET,
        left: left + BOARD_INSET,
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(topEl);
    observer.observe(tapeEl);
    observer.observe(leftEl);
    observer.observe(rightEl);
    /*
      A `display: contents` element is not observed by a ResizeObserver — it
      has no box to report — so the moment the rails turn ON is a moment
      nothing above would fire for. The window's own resize is what turns them
      on, and it is the one event that is guaranteed to have happened.
    */
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  /**
   * WHETHER THE BOARD'S OVERLAY IS RESTING, which is to say invisible.
   *
   * It stands on the wall at the widths that have no rail to put it in — 1440
   * and 1280 — and a purchase under it is a purchase covered. Two seconds
   * without the pointer moving and it fades; the first movement brings it back.
   * DESIGN.md carries the measurement that made this necessary and the money it
   * is worth.
   *
   * FOUR CONDITIONS STOP IT, and each is a way this could have gone wrong:
   *
   *  - a rail of either kind. Where the overlay is in a column beside the board
   *    it covers nothing, so hiding it would be a disappearing control for no
   *    reason at all. Read off the root's own attribute, which the boot script
   *    stamps `full`, `tools` or `off` — the same source the stylesheet reads,
   *    so the two cannot disagree.
   *  - a phone. There is no pointer to move, so nothing would ever bring it
   *    back, and the board is letterboxed clear of the overlay there anyway.
   *  - a selection, or an open purchase panel. A control that vanishes in the
   *    middle of a purchase is worse than one that covers a pixel.
   *  - focus inside it. `focusin` anywhere wakes it, which is what keeps a
   *    keyboard user from landing on a control at zero opacity: it is focusable
   *    throughout (see the stylesheet) and visible again within the frame.
   */
  const [toolsResting, setToolsResting] = useState(false);
  const overlayIsOnTheWall = selection === null && purchaseSelection === null;

  useEffect(() => {
    /*
      Nothing is set here on the way out, and that is the linter's rule rather
      than a preference: the class below is `toolsResting && overlayIsOnTheWall`,
      so a selection made while the overlay is resting shows it again without
      this effect having to reach for state on its way past.
    */
    if (!overlayIsOnTheWall) return;

    const root = document.documentElement;
    // A rail of either kind, or a viewport with no pointer to speak of: nothing
    // to hide from, because the overlay is not on the board there.
    if (root.dataset.rails !== "off") return;
    if (!window.matchMedia("(min-width: 641px)").matches) return;
    if (!window.matchMedia("(hover: hover)").matches) return;

    // The clock starts here rather than with a wake(): the overlay is already
    // visible when this runs, so there is nothing to set, only something to
    // wait for.
    let timer = setTimeout(() => setToolsResting(true), OVERLAY_REST_MS);
    const wake = () => {
      setToolsResting(false);
      clearTimeout(timer);
      timer = setTimeout(() => setToolsResting(true), OVERLAY_REST_MS);
    };

    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake);
    window.addEventListener("focusin", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("focusin", wake);
    };
  }, [overlayIsOnTheWall]);

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
        <h1
          className="flex shrink-0 items-center gap-2 font-display text-[15px] font-bold tracking-tight"
          title={offerLine(board.pricePerPixelBaseUnits)}
        >
          <span
            aria-hidden
            className="size-2.5 rounded-full bg-ink"
          />
          milliondollarpage.fun
        </h1>
        {/*
          THE WALLET CONTROL, IMMEDIATELY AFTER THE WORDMARK, at every width.
          It used to sit in the middle of the purchase panel, which put the one
          control a buyer needs BEFORE choosing anything behind having chosen
          it. See `WalletConnect` for the violet and why it is not the accent.
        */}
        <WalletConnect
          ref={walletRef}
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

        <div className="ml-auto min-w-0">
          <BoardCounters stats={board.stats} />
        </div>
        {/*
          Who else is here. It sits after the counters in the shed order, which
          puts it among the first things to go as the bar narrows — the offer
          and the count are what the bar is for, and this is context. It is
          also the only thing in the bar that is about people rather than
          pixels, which is why it carries a dot and not a number alone.
        */}
        <OnlineBanner online={board.online} className="online-banner--bar" />
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
        {/* Beside the questions link, because both are things a reader
            reaches for rather than things the board is about. */}
        <span className="ml-3 hidden shrink-0 items-center gap-2 sm:flex">
          <ThemeToggle />
          <Link href="/faq" className="btn-quiet shrink-0 px-2.5 py-1.5 text-[12.5px]">
            Questions
          </Link>
        </span>
      </header>

      {/*
        The wall's own statement, on the day nothing has been bought.

        Rendered from the SOLD COUNT rather than from the rectangle list: a
        board with three live holds on it and no sales is still a board where
        nothing has been bought, and it should say so. It sits over the canvas
        and lets every pointer event through, because the whole board is the
        control the note is pointing at.
      */}
      {board.stats.pixelsSold === 0 && (
        <EmptyWall chrome={chrome} perPixel={board.pricePerPixelBaseUnits} />
      )}

      {/*
        THE RIGHT RAIL, AND WHY IT IS BEFORE THE LEFT ONE IN THE DOM.

        Tab order. DESIGN.md: "Tab order is the board, then the controls, and it
        ends on Buy." The register's scroller is a tab stop and the presets and
        Buy are tab stops, so the register has to come first in the source
        wherever it is drawn — which it already did, along the bottom, and which
        is why nothing about the walk changes when it stands up into a column.
        The two rails are placed by CSS, not by their order here.

        Both wrappers are `display: contents` in the layout without rails, so
        every child inside them keeps the fixed position it has always had and
        this element adds nothing at all to that layout.
      */}
      <div ref={rightRailRef} className="board-side board-side--right">
        <PurchaseTape ref={tapeRef} rows={board.tape} asOf={board.asOf}>
          {/*
            The second copy of the count, and the one the rail shows. It does
            not beat: exactly one copy on the page tells the server this browser
            is here, and it is the one in the bar. See `OnlineBanner`.
          */}
          <OnlineBanner online={board.online} beat={false} className="online-banner--rail" />
        </PurchaseTape>
        <BoardStandings rows={board.standings} />
      </div>

      <div ref={leftRailRef} className="board-side board-side--left">
        {/*
          THE BOARD'S OWN OVERLAY, and it is two rows now: the controls that
          MAKE a selection, and the one line that says how. They are one element
          because they are one exemption — see DESIGN.md, which allows exactly
          this overlay on the board's own margin and attaches a condition to it.
        */}
        <div
          className={`board-tools${
            toolsResting && overlayIsOnTheWall ? " board-tools--resting" : ""
          }`}
        >
          <BoardRail
            perPixel={board.pricePerPixelBaseUnits}
            activePreset={activePreset}
            zoom={zoom}
            onPresetChange={changePreset}
            onClear={clear}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onZoomFit={zoomFit}
          />

          {/*
            HOW TO START, IN ONE LINE, AND ONLY UNTIL SOMEBODY HAS STARTED.

            A drag on a canvas is not discoverable and nothing else on this page
            is: the presets are buttons, the zoom is buttons, and the board itself
            announces its keys to a screen reader the moment focus lands on it.
            What had no home at all — since the batch that floated the panel
            deleted the interaction legend's last caller — was the sentence that
            says a pointer can draw here. DESIGN.md recorded that as an open gap;
            this is it closed.

            THE WHEEL AND SHIFT-DRAG ARE DELIBERATELY ABSENT. A line that lists
            every gesture is a line nobody finishes, and both of those are things
            a reader reaches for rather than things they have to be told exist.
            The presets are absent for a different reason: they are four labelled
            buttons on screen, and a sentence pointing at a button is a sentence
            about the interface rather than about the wall. The keyboard's own
            three keys stay where they already were, on the canvas's
            `aria-describedby`, read to the people who need them and nobody else.

            IT IS ONE LINE AT EVERY WIDTH, and that is what picked the wording:
            at 390 the sheet is 366px wide and this sets at about 250, so it never
            becomes the two-line block the legend was.

            It docks exactly where the purchase panel docks, and the two are never
            both on screen: this is what that corner says before there is a
            rectangle, and the panel is what it says after.
          */}
          {selection === null && (
            <p className="board-hint">Drag on the wall to choose your pixels</p>
          )}
        </div>

        {/*
          THE PANEL IS PRESENT ONLY WHILE THERE IS SOMETHING TO BUY.

          `hidden` rather than unmounting, so the wallet's connection and every
          piece of state inside it survive a reader clearing a selection and
          drawing another — and so a screen reader is not read a purchase panel
          for a purchase nobody has started. It is not measured into the chrome
          either way: the board does not resize when this appears.
        */}
        <div ref={controlsRef} className="board-controls" hidden={selection === null}>
          <SelectionPanel
            selection={selection}
            perPixel={board.pricePerPixelBaseUnits}
            canBuy={buyState.canBuy && purchaseSelection === null}
            hint={buyState.hint}
            hintTone={buyState.tone}
            onBuy={handleBuy}
          />
        </div>
      </div>

      {hovered && (
        <div
          className="floating-card pointer-events-none fixed z-20 w-56 p-3"
          style={{
            /* Inside the board's own free region, never merely inside the
               window — see `hoverCardLeft`, and the rails it exists for. */
            left: hoverCardLeft(
              hovered.at.x,
              typeof window === "undefined" ? 1200 : window.innerWidth,
              chrome,
            ),
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
                      perPixel={board.pricePerPixelBaseUnits}
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
