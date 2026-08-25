"use client";

import { useCallback, useState } from "react";
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

  const clear = useCallback(() => setSelection(null), []);

  // Switching presets (or back to freehand) should not carry a stale
  // selection along with it, so the reset happens in the same event handler
  // that changes the preset rather than in an effect watching for it.
  const changePreset = useCallback((size: number | null) => {
    setActivePreset(size);
    setSelection(null);
  }, []);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">milliondollarpage.fun</h1>
        <BoardCounters stats={board.stats} perPixel={board.pricePerPixelBaseUnits} />
      </header>

      <div className="relative">
        <BoardCanvas
          blocks={board.blocks}
          activePreset={activePreset}
          perPixel={board.pricePerPixelBaseUnits}
          onSelectionChange={setSelection}
          onHoverChange={setHovered}
        />
        {hovered && (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/80 px-3 py-2 text-sm">
            <p className="font-medium">{hovered.caption ?? "Untitled block"}</p>
            <p className="text-neutral-400">{hovered.link}</p>
          </div>
        )}
      </div>

      <InteractionLegend />

      <SelectionPanel
        selection={selection}
        perPixel={board.pricePerPixelBaseUnits}
        activePreset={activePreset}
        onPresetChange={changePreset}
        onClear={clear}
      />
    </main>
  );
}
