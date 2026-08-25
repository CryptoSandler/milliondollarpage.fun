"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function BoardView({ initial }: { initial: BoardPayload }) {
  const [board] = useState(initial);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [hovered, setHovered] = useState<LiveBlock | null>(null);
  const [bars, setBars] = useState({ top: 52, bottom: 88 });

  const clear = useCallback(() => setSelection(null), []);

  // Switching presets (or back to freehand) should not carry a stale
  // selection along with it, so the reset happens in the same event handler
  // that changes the preset rather than in an effect watching for it.
  const changePreset = useCallback((size: number | null) => {
    setActivePreset(size);
    setSelection(null);
  }, []);

  // The bar heights live in globals.css (and change under a media query on
  // narrow screens); reading them here rather than hardcoding a second copy
  // means the fit maths and the visible bars can never disagree.
  useEffect(() => {
    function readBars() {
      const style = getComputedStyle(document.documentElement);
      const px = (name: string, fallback: number) => {
        const parsed = Number.parseFloat(style.getPropertyValue(name));
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
      };
      setBars({ top: px("--bar-top-h", 52), bottom: px("--bar-bottom-h", 88) });
    }
    readBars();
    window.addEventListener("resize", readBars);
    return () => window.removeEventListener("resize", readBars);
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

      <header className="board-bar board-bar--top">
        <h1 className="shrink-0 text-sm font-semibold tracking-tight">milliondollarpage.fun</h1>
        <BoardCounters stats={board.stats} perPixel={board.pricePerPixelBaseUnits} />
      </header>

      <div className="board-bar board-bar--bottom">
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
          style={{ bottom: "calc(var(--bar-bottom-h) + 0.5rem)" }}
        >
          <p className="font-medium">{hovered.caption ?? "Untitled block"}</p>
          <p className="text-neutral-400">{hovered.link}</p>
        </div>
      )}
    </div>
  );
}
