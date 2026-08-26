"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardStats, LiveBlock } from "../lib/board/blocks";
import type { Point } from "../lib/board/geometry";
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
  const [hovered, setHovered] = useState<{ block: LiveBlock; at: Point } | null>(null);
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

  const handleHover = useCallback((block: LiveBlock | null, at: Point | null) => {
    setHovered(block && at ? { block, at } : null);
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
        hint: "Pick a size or drag the board to start.",
        tone: "info",
      };
    }

    if (selection.collidesWith.length > 0) {
      const taken = new Set(selection.collidesWith);
      const hit = board.blocks.filter((block) => taken.has(block.id));
      const held = hit.filter((block) => block.status === "reserved").length;
      const sold = hit.length - held;

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
        hint: "Part of this is on hold mid-purchase. It reopens within 30 minutes if that purchase is not finished.",
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
        hint: "Add your wallet address to buy — the field is on the left.",
        tone: "info",
      };
    }

    return {
      canBuy: true,
      hint: "Holds these pixels for 30 minutes while you upload.",
      tone: "info",
    };
  }, [selection, board.blocks, walletMissing]);

  const handleBuy = useCallback(() => {
    if (!selection || !buyState.canBuy) return;
    setPurchaseSelection(selection);
  }, [selection, buyState.canBuy]);

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

  // --bar-top-h / --bar-bottom-h are nominal heights, kept here as a
  // matching JS constant for the very first paint. Both bars now have a
  // fixed `height` rather than `min-height` and neither ever `flex-wrap`
  // (see globals.css), specifically so this can never desync from them —
  // but the actual box also depends on env(safe-area-inset-bottom) and rem
  // sizing that a static JS number can't mirror, so this still measures the
  // two bar elements directly rather than reading the CSS variables off the
  // root.
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

  const walletNeeded = selection?.buyable === true && walletMissing;

  return (
    <div className="board-shell">
      <BoardCanvas
        blocks={board.blocks}
        selection={selection}
        activePreset={activePreset}
        perPixel={board.pricePerPixelBaseUnits}
        bars={bars}
        onSelectionChange={setSelection}
        onHoverChange={handleHover}
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
      </header>

      <div ref={bottomBarRef} className="board-bar board-bar--bottom">
        <SelectionPanel
          selection={selection}
          perPixel={board.pricePerPixelBaseUnits}
          activePreset={activePreset}
          canBuy={buyState.canBuy}
          hint={buyState.hint}
          hintTone={buyState.tone}
          onPresetChange={changePreset}
          onClear={clear}
          onBuy={handleBuy}
        >
          <InteractionLegend />

          <label className="flex shrink-0 flex-col justify-center gap-1">
            <span className="label-caps hidden items-center gap-1.5 sm:flex">
              Wallet
              {walletNeeded && <span className="font-bold text-primary-pressed">needed</span>}
            </span>
            <input
              type="text"
              value={buyerPubkey}
              onChange={(event) => setBuyerPubkey(event.target.value)}
              aria-label="Wallet address"
              title="Where the block will be minted. A connected wallet replaces this field later."
              disabled={purchaseSelection !== null}
              placeholder="Solana address"
              className={`field-input w-20 shrink-0 py-1.5 text-[12.5px] sm:w-44 ${
                walletNeeded ? "border-primary" : ""
              }`}
            />
          </label>
        </SelectionPanel>
      </div>

      {hovered && (
        <div
          className="floating-card pointer-events-none fixed z-20 w-52 p-3"
          style={{
            left: Math.min(hovered.at.x + 14, (typeof window === "undefined" ? 1200 : window.innerWidth) - 224),
            top: Math.max(bars.top + 8, hovered.at.y - 88),
          }}
        >
          <p className="truncate font-display text-[14.5px] font-bold text-ink">
            {hovered.block.caption ?? "No caption"}
          </p>
          {hovered.block.link && (
            <p className="truncate text-[12.5px] font-semibold text-primary-pressed">
              {hovered.block.link}
            </p>
          )}
          <p className="tabular mt-1 text-[11px] text-mute">
            {hovered.block.w} × {hovered.block.h} at ({hovered.block.x}, {hovered.block.y}) ·{" "}
            {(hovered.block.w * hovered.block.h).toLocaleString("en-US")} px
          </p>
          <p className="mt-1 text-[11px] font-semibold text-body">
            {hovered.block.status === "reserved"
              ? "On hold mid-purchase — not for sale right now"
              : "Sold — not for sale"}
          </p>
        </div>
      )}

      {notice && (
        <div
          className="floating-card fixed left-1/2 z-30 max-w-md -translate-x-1/2 px-4 py-3 text-[13px] text-ink-soft"
          role="status"
          style={{ top: `calc(${bars.top}px + 12px)` }}
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
