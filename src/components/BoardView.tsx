"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBlockDetails } from "../lib/board/block-details";
import { blockImageUrl } from "../lib/board/block-image";
import type { BlockDetails, BoardRect, BoardStats, Standing } from "../lib/board/blocks";
import type { Wall } from "../lib/board/composite";
import type { Point } from "../lib/board/geometry";
import { holdMinutes } from "../lib/board/hold-clock";
import { formatUsdc, offerLine, unitOfSale } from "../lib/board/pricing";
import { walletSigner } from "../lib/board/purchase-client";
import type { Selection } from "../lib/board/selection";
import type { TapeRow } from "../lib/board/tape";
import { BAR_TOP_PX, BOARD_INSET, STRIP_H_PX, type Chrome, hoverCardLeft } from "../lib/canvas/viewport";
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
   * How many visits the wall has ever had, cumulative.
   *
   * A visit is a new presence session — the anonymous heartbeat that already
   * exists, counted rather than collected again. See `lib/board/audience.ts`,
   * which explains why the table holding it has two columns and neither is
   * text.
   */
  views: number;
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
const FALLBACK_CHROME: Chrome = {
  top: BAR_TOP_PX + BOARD_INSET,
  right: BOARD_INSET,
  bottom: STRIP_H_PX + BOARD_INSET,
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
  /**
   * The rectangle whose FULL card is open, which is a different thing from the
   * one under the pointer.
   *
   * Two gestures, two answers, settled 2026-09-03 and reversing the day
   * before's decision that hover would show nothing at all: resting on a
   * rectangle shows a small tooltip with its caption, the way the original page
   * did, and clicking it opens the card. `DECISIONS.md` has both.
   *
   * WHY THEY ARE SEPARATE STATE rather than one with a mode: they can be two
   * different rectangles at once — a card is open on one while the pointer
   * travels over others — and collapsing them would make moving the mouse
   * close a card nobody dismissed.
   */
  const [opened, setOpened] = useState<{ rect: BoardRect; at: Point } | null>(null);
  const openedCardRef = useRef<HTMLDivElement>(null);
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
   * The strip along the bottom: the tools, the panel and the register in one
   * row, and the whole of the chrome the board is fitted above.
   *
   * It has a box only where the rails are OFF — with them on it is
   * `display: contents` and measures a row of zeros, which is the same trick
   * the rails themselves use and the reason the measurement below needs no
   * media query.
   */
  const stripRef = useRef<HTMLDivElement>(null);
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

  /**
   * A click on a rectangle, or on bare wall.
   *
   * It asks for the words itself rather than relying on the hover having asked:
   * a touchscreen has no hover, so on a phone this is the FIRST thing that ever
   * mentions the rectangle, and a card that waited for a pointer that does not
   * exist would sit empty for ever.
   */
  const openBlock = useCallback(
    (rect: BoardRect | null, at: Point | null) => {
      setOpened(rect && at ? { rect, at } : null);
      if (rect) requestDetails(rect.id);
    },
    [requestDetails],
  );

  /*
    ESCAPE CLOSES THE CARD, and it is a separate listener from the canvas's own
    because it answers a different question: the canvas clears the SELECTION on
    Escape, and a reader who has opened a card and presses Escape means the
    card. So this one runs first in the sense that matters — it stops there if a
    card is open, leaving the selection alone, which is what somebody who was
    mid-purchase and glanced at a neighbour's rectangle expects.
  */
  useEffect(() => {
    if (!opened) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpened(null);
      boardRef.current?.focus();
    }
    // Capture, so this runs before the canvas's window listener and can stop it
    // from also clearing a selection the reader still wants.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [opened]);

  /*
    THE CARD TAKES FOCUS WHEN IT OPENS, so Escape reaches the listener above
    wherever the reader's focus happened to be, and so a keyboard reaching the
    card's link does not first have to tab through the whole board. Focus goes
    back to the board when it closes, which is where the reader was.
  */
  useEffect(() => {
    if (opened) openedCardRef.current?.focus();
  }, [opened]);

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
    const stripEl = stripRef.current;
    const leftEl = leftRailRef.current;
    const rightEl = rightRailRef.current;
    if (!topEl || !stripEl || !leftEl || !rightEl) return;

    function measure() {
      const top = topEl!.offsetHeight || FALLBACK_CHROME.top;
      // The settled-purchase rail. `display: none` below the side-panel
      // layout, and an element that is not displayed measures zero — so this
      // one number covers both layouts without a second media query in JS,
      // exactly as the panel/bar decision above is read back off a box rather
      // than re-asked. It is measured rather than taken from --tape-h for the
      // same reason everything else here is: the rail's real height includes
      // whatever line-height and rem sizing the browser actually applied.
      const strip = stripEl!.getBoundingClientRect().height;
      /*
        EVERY PIXEL OF CHROME IS IN THIS SUM, which is the whole of the rule the
        owner settled on 2026-09-02: nothing stands on the wall at any width.

        The strip along the bottom holds the tools, the purchase panel and the
        register, and it is measured as ONE box — so there is nothing floating
        over the board to leave out of the arithmetic and nothing to argue about
        whether it counts. Its height does not move with the selection, so this
        number does not either, and the board never refits under a rectangle
        somebody is drawing.

        Left and right are the inset alone where there are no side rails. Where
        there ARE rails they are added below — out of width a height-limited
        board could not have used at any scale — and the strip is
        `display: contents` there, so it measures zero and the register and the
        panel are in the rails instead.
      */
      /*
        THE SIDE RAILS, WHERE THERE ARE ANY, AND THEY COST NO HEIGHT.

        A rail has a box only above the width its contents need — see
        `sideRailWidth`, and the boot script in layout.tsx that decides it
        before the first paint. Where it has one, the board's left and right
        insets grow by the rails and the strip along the bottom stops having a
        box at all, so the vertical chrome is the header alone.

        Read off the boxes, not off `--rail-w`. The custom property is what the
        stylesheet was TOLD; these are what the browser actually laid out, and
        the whole reason this effect exists is that those two have been
        different before.
      */
      const left = leftEl!.getBoundingClientRect().width;
      const right = rightEl!.getBoundingClientRect().width;

      /*
        THE STRIP'S HEIGHT, PUBLISHED FOR CSS. The two ticker columns run from
        under the header to the top of the strip, and neither the stylesheet nor
        a constant can know how tall the strip actually is — it is set by the
        purchase panel, which is set by its own type. This is the measured
        number, written where a `bottom:` can read it.
      */
      document.documentElement.style.setProperty("--strip-h", `${strip}px`);

      setChrome({
        top: top + BOARD_INSET,
        right: right + BOARD_INSET,
        bottom: strip + BOARD_INSET,
        left: left + BOARD_INSET,
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(topEl);
    observer.observe(stripEl);
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
        onBlockOpen={openBlock}
        onZoomStateChange={handleZoomStateChange}
        onActivate={handleBuy}
        activateHint={buyState.hint}
      />

      {/*
        THE HEADER IN THREE ZONES, settled by the owner 2026-09-03.

        Left is the product's NAME and nothing else. Centre is the one figure
        this whole page turns on — how many pixels are left — with the share
        sold as a small suffix rather than a second number competing with it.
        Right is everything a reader REACHES FOR, in the order they reach: what
        this is, how to buy it, the register they read it in, and the wallet
        they buy with, hard against the edge.

        IT IS A GRID AND NOT A FLEX ROW, and that is the whole reason the middle
        zone can be trusted. `1fr auto 1fr` centres the figure on the WINDOW; a
        flex row with `ml-auto` centres it on whatever the two sides left over,
        so the figure drifted left every time the wallet control changed from
        "Connect wallet" to an address. A number that moves when something else
        changes is a number a reader stops reading.
      */}
      <header ref={topBarRef} className="board-bar board-bar--top">
        <h1 className="board-bar__mark" title={offerLine(board.pricePerPixelBaseUnits)}>
          <span aria-hidden className="size-2.5 rounded-full bg-ink" />
          milliondollarpage.fun
        </h1>

        <div className="board-bar__figure">
          <BoardCounters stats={board.stats} />
        </div>

        {/*
          WHO ELSE IS HERE HAS LEFT THIS BAR. It was the only thing in the
          header about people rather than pixels, and the header is now three
          zones with nothing spare in any of them. It is still on the page — the
          register carries it, in both layouts — and `/stats` has the history.
          The copy in the register is the one that BEATS now: exactly one copy
          on the page tells the server this browser is here, and the one that
          used to do it was this.
        */}
        {/*
          THE TWO LINKS HAVE LEFT THE HEADER, 2026-09-03. The bar is the wall's
          own line — the name, the figure, and the two controls that act on a
          purchase — and a pair of destinations sitting among them read as more
          chrome than they are worth. They are at the foot of the strip now, set
          in the counter's own face and turned down, which is where somebody
          looks when they are not buying yet.
        */}
        <div className="board-bar__tools">
          {/*
            WHO ELSE IS HERE, in the header and to the right of the figure.

            It rode with the tools for one batch and it is up here now: the two
            numbers are the same kind of thing — a count of the wall's state —
            and putting them on one line is what makes the header say what is
            happening rather than only what is for sale. It is still the ONLY
            copy on the page, so it is the one that beats: exactly one element
            tells the server this browser is here.

            It links to `/stats`, which is where the same numbers have their
            history, and it is the only place on the board that offers a way to
            read more about them.
          */}
          <Link
            href="/stats"
            className="presence-pill"
            title="Visitors on the wall in the last two minutes, and every visit it has ever had. Counted anonymously — see /stats."
          >
            <OnlineBanner online={board.online} views={board.views} />
          </Link>
          <ThemeToggle />
          {/*
            LAST, AND HARD AGAINST THE EDGE. It is outside the span beside it on
            purpose: the two links and the switch give way on a phone and the
            wallet does not — a board somebody cannot connect to is a board
            somebody cannot buy from.
          */}
          <WalletConnect
            ref={walletRef}
            wallets={wallet.wallets}
            connected={wallet.connected}
            connecting={wallet.connecting}
            notice={wallet.notice}
            disabled={purchaseSelection !== null}
            needed={walletNeeded}
            onConnect={wallet.connect}
            onDisconnect={wallet.disconnect}
          />
        </div>
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
      {/*
        THE STRIP, and the two rails inside it.

        One element, two layouts. Where the rails are on it is `display:
        contents` and adds nothing: the rails keep the fixed positions the
        stylesheet gives them and this measures a row of zeros, which is how the
        chrome effect below tells the layouts apart. Where they are off it IS the
        chrome along the bottom — tools, panel, register, one row — and the board
        is fitted above it.
      */}
      <div ref={stripRef} className="board-strip">
      <div ref={rightRailRef} className="board-side board-side--right">
        <PurchaseTape ref={tapeRef} rows={board.tape} asOf={board.asOf}>
          {/*
            NO COUNT IN HERE ANY MORE. It lived at the head of this rail while
            the header carried the other copy; there is one copy now and it
            rides with the tools, which have a home in both layouts. Two copies
            were two things to keep in step and one of them was always hidden.
          */}
        </PurchaseTape>
        <BoardStandings rows={board.standings} />

        {/*
          THE SECOND FACE OF THE REGISTER, down the other side of the wall.

          It is `aria-hidden`, headless and untabbable — see `echo` in
          `PurchaseTape` — so this is one register drawn twice rather than two
          registers. Where the ticker is in the strip the stylesheet hides it
          entirely; where it runs down the gaps this is the half that climbs the
          right-hand one.
        */}
        <PurchaseTape rows={board.tape} asOf={board.asOf} echo />
      </div>

      <div ref={leftRailRef} className="board-side board-side--left">
        {/*
          THE TOOLS: the controls that MAKE a selection. A segment of the strip
          along the bottom now, or the head of the left rail where there is one.
          Not an overlay in either — see the stylesheet's strip block for the
          exemption this replaced and what it used to cost the wall.
        */}
        {/*
          THE WAY OUT OF THE WALL, on the strip's own baseline and at the far
          left of it. Small, in the mono the counters use, and turned down to
          `--body`: these are the two things to read BEFORE buying, and a reader
          who is mid-drag should be able to ignore them without effort.
        */}
        {/*
          WHO BUILT IT, bottom-left, in the corner the genre puts it in.

          IT IS IN THE STRIP AND NOT FLOATING OVER THE CORNER, and that is the
          rule deciding it rather than the convention: at 1280 and up the
          bottom-left of the window is the register's left column, running the
          full height of the letterbox, and nothing may stand on the wall or on
          the register. The strip's own background is the only bottom-left
          surface that is neither. On a phone the strip stacks, so it lands at
          the foot exactly as asked.

          THE MARK IS DRAWN HERE. An avatar fetched from x.com is a request that
          leaves this page for somebody else's server on every load, and this
          site draws its own pictures — `/faq` and `/how-to-buy` both say so.
          What identifies the link is the X glyph and the handle.
        */}
        <a
          href="https://x.com/CryptoSandlerr"
          target="_blank"
          rel="noreferrer noopener"
          className="built-by"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="built-by__mark">
            <path
              fill="currentColor"
              d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
            />
          </svg>
          <span className="built-by__label">Built by </span>
          <span className="built-by__handle">@CryptoSandlerr</span>
        </a>

        <nav className="strip-links" aria-label="About this wall">
          <Link href="/faq">What this is</Link>
          <span aria-hidden>·</span>
          <Link href="/how-to-buy">How to buy</Link>
        </nav>

        <div className="board-tools">
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

        </div>

        <div ref={controlsRef} className="board-controls">
          {/*
            HOW TO START, IN ONE LINE, AND ONLY UNTIL SOMEBODY HAS STARTED.

            A drag on a canvas is not discoverable and nothing else on this page
            is: the presets are buttons, the zoom is buttons, and the board
            itself announces its keys to a screen reader the moment focus lands
            on it. The wheel and shift-drag are deliberately absent — a line
            that lists every gesture is a line nobody finishes.

            IT SHARES THE PANEL'S BOX, which is what keeps the strip the same
            height whether or not anything is selected. That is not tidiness: the
            strip is measured into the chrome the board is fitted against, so a
            panel that appeared on selection would refit the wall under the
            rectangle somebody was drawing.
          */}
          <div className="board-hint" hidden={selection !== null}>
            <p className="board-hint__lead">Drag on the wall to choose your pixels</p>
            {/*
              THE SECOND LINE IS NOT PADDING. The panel beside it is two lines —
              the readout, and the Buy button with what it costs — and this box
              has to be exactly as tall or the strip changes height when a
              rectangle is drawn, which would refit the wall under the pointer
              that drew it. Rather than reserve blank paper, the space says the
              offer: `unitOfSale` is the same sentence the selector uses, from
              the one place either of them is worded.
            */}
            <p className="board-hint__offer">
              {unitOfSale(board.pricePerPixelBaseUnits)}
              {/*
                FIRST TIME? IN THE IDLE HALF, not beside the readout.

                It belongs on this strip — somebody who does not know what a
                wallet is finds out at the moment they are looking at the thing
                they cannot buy yet — and it belongs in the half that has room.
                Measured at 1440: with the link beside the readout the panel is
                690px and the line `10 × 10 at (625, 431) · $1 a pixel` is
                clipped; here it costs the readout nothing, because the readout
                is not on screen while this is.
              */}
              <Link href="/how-to-buy" className="board-hint__link">
                First time? →
              </Link>
            </p>
          </div>

          {/*
            `hidden` rather than unmounting, so nothing inside the panel is torn
            down and rebuilt each time a reader clears a selection and draws
            another — and so a screen reader is not read a purchase panel for a
            purchase nobody has started.
          */}
          <div hidden={selection === null} className="flex min-w-0 flex-1 items-center">
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
      </div>
      </div>

      {/*
        RESTING ON A RECTANGLE SHOWS ONE SMALL LINE, AND CLICKING IT SHOWS THE
        CARD. Two gestures, two answers, decided 2026-09-03 — see `DECISIONS.md`,
        which also records the day-before decision this reverses (hover was to
        show nothing at all) and the original page this is borrowed from, where
        resting on a rectangle has always produced a tooltip.

        WHAT THE TOOLTIP MAY COST THE READER IS ITS OWN AREA AND NOT A PIXEL
        MORE. It is one line, it never grows past the width of the card it
        replaces, and it has no pointer events — so it cannot swallow the click
        that opens the card underneath it. There is no delay either way: a
        tooltip that waits is a tooltip that arrives after the reader has moved
        on, and a wall of a million pixels is read by sweeping across it.
      */}
      {hovered && opened?.rect.id !== hovered.rect.id && (
        <div
          className="floating-card pointer-events-none fixed z-20 max-w-[224px] truncate px-2.5 py-1.5 text-[12.5px] font-semibold text-ink"
          style={{
            /* Inside the board's own free region, never merely inside the
               window — see `hoverCardLeft`, and the rails it exists for. */
            left: hoverCardLeft(
              hovered.at.x,
              typeof window === "undefined" ? 1200 : window.innerWidth,
              chrome,
            ),
            top: Math.max(chrome.top + 8, hovered.at.y - 34),
          }}
        >
          {tooltipLine(
            hovered.rect,
            details.get(hovered.rect.id)?.caption ?? null,
            board.pricePerPixelBaseUnits,
          )}
        </div>
      )}

      {opened && (
        <div
          ref={openedCardRef}
          /*
            IT TAKES POINTER EVENTS, WHICH THE HOVER CARD NEVER DID — and that
            is most of the reason clicking is worth having. The card carries the
            buyer's link, and for as long as it only existed under a pointer
            that was passing over it, that link could not be followed by
            anybody. Now it can.
          */
          className="floating-card fixed z-30 w-56 p-3"
          role="dialog"
          aria-label="This rectangle"
          tabIndex={-1}
          style={{
            left: hoverCardLeft(
              opened.at.x,
              typeof window === "undefined" ? 1200 : window.innerWidth,
              chrome,
            ),
            top: Math.max(chrome.top + 8, opened.at.y - 96),
          }}
        >
          <button
            type="button"
            /* A close of its own, because Escape is not discoverable and a
               touchscreen has no Escape at all. */
            className="btn-quiet absolute right-1.5 top-1.5 px-1.5 py-0.5 text-[12px] leading-none"
            onClick={() => {
              setOpened(null);
              boardRef.current?.focus();
            }}
          >
            <span aria-hidden>×</span>
            <span className="sr-only">Close</span>
          </button>
          {/*
            The rectangle and its state come off the board payload and are
            there the instant the card opens. The caption and the link do not:
            they are fetched for this one rectangle, so the card says what it
            knows first and fills the words in when they land. A hold publishes
            neither, and never will — and it has no picture either, so it gets
            no frame rather than an empty one.

            The card itself is BlockCard, which the checkout also renders. That
            is the whole point: what a buyer is shown before paying and what a
            visitor is shown afterwards are one component, so they cannot come
            to disagree about how a rectangle looks.
          */}
          <BlockCard
            id={opened.rect.id}
            imageSrc={opened.rect.status === "reserved" ? null : blockImageUrl(opened.rect.id)}
            caption={details.get(opened.rect.id)?.caption ?? null}
            link={details.get(opened.rect.id)?.link ?? null}
            clicks={details.get(opened.rect.id)?.clicks}
            rect={opened.rect}
            state={
              opened.rect.status === "reserved"
                ? { kind: "held", own: ownHoldIds.includes(opened.rect.id) }
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

/**
 * The one line a tooltip says about a rectangle somebody is resting on.
 *
 * THE CAPTION IF THERE IS ONE, because that is what the buyer wrote and what
 * the original page showed. Its size and its price when there is not — never
 * "No caption", which spends a reader's attention telling them about an absence
 * rather than about the rectangle. A hold says it is held and nothing else: a
 * reservation publishes no words at all, and thirty minutes of somebody's
 * unfinished purchase is not a thing to advertise.
 *
 * It lives here rather than inside BlockCard because it is the SHORT answer and
 * that card is the long one; folding both into one component would be a card
 * with a mode, and the two are read at different moments for different reasons.
 */
function tooltipLine(rect: BoardRect, caption: string | null, perPixel: number): string {
  if (rect.status === "reserved") return "On hold mid-purchase";
  if (caption && caption.trim() !== "") return caption;
  return `${rect.w} × ${rect.h} · ${formatUsdc(rect.w * rect.h * perPixel)}`;
}
