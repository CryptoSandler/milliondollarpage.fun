"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardStats, LiveBlock } from "../lib/board/blocks";
import type { Selection } from "../lib/board/selection";
import BoardCanvas from "./BoardCanvas";
import BoardCounters from "./BoardCounters";
import InteractionLegend from "./InteractionLegend";
import PurchaseDialog from "./PurchaseDialog";
import SelectionPanel from "./SelectionPanel";

type BoardPayload = {
  blocks: LiveBlock[];
  stats: BoardStats;
  pricePerPixelBaseUnits: number;
};

// Matches the --bar-top-h / --bar-bottom-h defaults in globals.css: the very
// first paint, before the bars exist to be measured, has to assume something,
// and this is what the CSS assumes too.
const FALLBACK_BARS = { top: 52, bottom: 88 };

// Somebody else's hold, or your own abandoned attempt in another tab, is
// invisible until the board refetches — the selector otherwise keeps
// offering rectangles the server will refuse. Thirty seconds: the hold
// window is thirty minutes, so this is frequent enough that a stale
// rectangle is rare, and the payload (see /api/board) is small enough that
// twice a minute per open tab is nowhere near "hammering" the endpoint.
const REFRESH_INTERVAL_MS = 30_000;

export default function BoardView({ initial }: { initial: BoardPayload }) {
  const [board, setBoard] = useState(initial);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [hovered, setHovered] = useState<LiveBlock | null>(null);
  const [bars, setBars] = useState(FALLBACK_BARS);
  // A plain text field until a real wallet arrives in a later batch: there is
  // no connection and no signature yet, only an address the buyer types in.
  const [buyerPubkey, setBuyerPubkey] = useState("");
  // The selection a purchase is in progress for. Frozen separately from
  // `selection` so the canvas remains free to change (or clear) the live
  // selection underneath a dialog that is already holding a rectangle.
  const [purchaseSelection, setPurchaseSelection] = useState<Selection | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const topBarRef = useRef<HTMLElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);

  const clear = useCallback(() => setSelection(null), []);

  // Switching presets (or back to freehand) should not carry a stale
  // selection along with it, so the reset happens in the same event handler
  // that changes the preset rather than in an effect watching for it.
  const changePreset = useCallback((size: number | null) => {
    setActivePreset(size);
    setSelection(null);
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

  const handleBuy = useCallback(() => {
    if (!selection) return;
    if (buyerPubkey.trim() === "") {
      setNotice("Enter a wallet address before buying.");
      return;
    }
    setPurchaseSelection(selection);
  }, [selection, buyerPubkey]);

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
    const timeout = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timeout);
  }, [notice]);

  // --bar-top-h / --bar-bottom-h are only the *nominal* heights. The bottom
  // bar is `flex-wrap`, and on a narrow screen its presets, selection summary
  // and legend wrap to a second row — its real rendered height then exceeds
  // the variable. Feeding the nominal number to initialViewport would reserve
  // too little space and let the bar cover part of the board, so this
  // measures the two bar elements directly instead of reading the CSS
  // variables off the root.
  //
  // This cannot loop: the measured heights only flow into `bars` state, which
  // affects the canvas's viewport (a different element) and the hover card's
  // position, never a style on the bar elements themselves from inside their
  // own observer callback.
  useEffect(() => {
    const topEl = topBarRef.current;
    const bottomEl = bottomBarRef.current;
    if (!topEl || !bottomEl) return;

    function measure() {
      setBars({
        top: topEl!.offsetHeight || FALLBACK_BARS.top,
        bottom: bottomEl!.offsetHeight || FALLBACK_BARS.bottom,
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(topEl);
    observer.observe(bottomEl);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="board-shell">
      <BoardCanvas
        blocks={board.blocks}
        selection={selection}
        activePreset={activePreset}
        perPixel={board.pricePerPixelBaseUnits}
        bars={bars}
        onSelectionChange={setSelection}
        onHoverChange={setHovered}
      />

      <header ref={topBarRef} className="board-bar board-bar--top">
        <h1 className="shrink-0 text-sm font-semibold tracking-tight">milliondollarpage.fun</h1>
        <BoardCounters stats={board.stats} perPixel={board.pricePerPixelBaseUnits} />
      </header>

      <div ref={bottomBarRef} className="board-bar board-bar--bottom">
        <SelectionPanel
          selection={selection}
          perPixel={board.pricePerPixelBaseUnits}
          activePreset={activePreset}
          onPresetChange={changePreset}
          onClear={clear}
          onBuy={handleBuy}
        />
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <span>
            Wallet address{" "}
            <span className="text-neutral-500">(temporary text field — a connected wallet replaces this later)</span>
          </span>
          <input
            type="text"
            value={buyerPubkey}
            onChange={(event) => setBuyerPubkey(event.target.value)}
            placeholder="Your wallet address"
            disabled={purchaseSelection !== null}
            className="w-40 rounded border border-neutral-700 bg-transparent px-2 py-1 text-xs disabled:opacity-50"
          />
        </label>
        <InteractionLegend />
      </div>

      {hovered && (
        <div
          className="pointer-events-none fixed left-2 rounded bg-black/80 px-3 py-2 text-sm"
          style={{ bottom: `calc(${bars.bottom}px + 0.5rem)` }}
        >
          <p className="font-medium">{hovered.caption ?? "Untitled block"}</p>
          <p className="text-neutral-400">{hovered.link}</p>
        </div>
      )}

      {notice && (
        <div
          className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2 rounded bg-black/80 px-4 py-2 text-sm"
          style={{ top: `calc(${bars.top}px + 0.5rem)` }}
        >
          {notice}
        </div>
      )}

      {purchaseSelection && (
        <PurchaseDialog
          selection={purchaseSelection}
          buyerPubkey={buyerPubkey}
          onClose={closeDialog}
          onPurchased={handlePurchased}
          onRefresh={refreshBoard}
          onGateChange={setDialogBlocksRefresh}
        />
      )}
    </div>
  );
}
