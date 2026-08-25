"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardStats, LiveBlock } from "../lib/board/blocks";
import type { Selection } from "../lib/board/selection";
import BoardCanvas from "./BoardCanvas";
import BoardCounters from "./BoardCounters";
import InteractionLegend from "./InteractionLegend";
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

export default function BoardView({ initial }: { initial: BoardPayload }) {
  const [board] = useState(initial);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [hovered, setHovered] = useState<LiveBlock | null>(null);
  const [bars, setBars] = useState(FALLBACK_BARS);
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
        />
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
    </div>
  );
}
