"use client";

import { PRESETS } from "../lib/board/selection";
import { formatUsdc, pixelCount } from "../lib/board/pricing";
import type { ZoomState } from "./BoardCanvas";

/**
 * The size presets and the zoom, on a thin rail over the board's own edge.
 *
 * WHO CALLS THIS: `BoardView`, and nothing else.
 *
 * ## Why it is not in the purchase panel any more
 *
 * The purchase panel appears when a rectangle is selected. These two controls
 * are how a rectangle GETS selected — a preset places one, and the zoom decides
 * what you are placing it on — so putting them behind a selection made them
 * unreachable exactly when they were needed. They are always there now.
 *
 * ## Where it goes, and what it costs there
 *
 * Three places, decided by arithmetic in `toolsRailWidth` and `sideRailWidth`
 * and stamped on the root before the first paint: the full left rail above a
 * 180px gap, a tools-only column above 108, and — below both — the board's own
 * top edge, overlaid rather than stacked, because a rail that pushed the board
 * down would spend the vertical budget twice.
 *
 * IT USED TO SAY IT COST THE WALL "A STRIP OF ITS OWN MARGIN". That was never
 * true. The margin is the 8px board inset and this is 40px tall, so on the
 * third of those three it stands on artwork: about 18,000 board pixels at
 * 1440×900 and 23,200 at 1280×800, and more with the instruction line under it.
 * That is why the first two exist at all, and why `BoardView` hides the whole
 * overlay after two seconds of a still pointer wherever the third one applies.
 * DESIGN.md carries the table and the money.
 */
export default function BoardRail({
  perPixel,
  activePreset,
  zoom,
  onPresetChange,
  onClear,
  onZoomIn,
  onZoomOut,
  onZoomFit,
}: {
  perPixel: number;
  activePreset: number | null;
  zoom: ZoomState;
  onPresetChange: (size: number | null) => void;
  onClear: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
}) {
  return (
    <div className="board-rail">
      <div className="board-rail__presets flex shrink-0 items-center gap-1">
        {/* Freehand is the default and, below `sm`, tapping the active preset
            already returns to it — so this is the one control the phone drops. */}
        <button
          type="button"
          aria-pressed={activePreset === null}
          onClick={() => {
            onPresetChange(null);
            onClear();
          }}
          className="btn-quiet hidden shrink-0 px-2.5 py-1.5 text-[12.5px] sm:block"
        >
          Freehand
        </button>
        {PRESETS.map((preset) => (
          <button
            key={preset.size}
            type="button"
            aria-pressed={activePreset === preset.size}
            onClick={() => onPresetChange(activePreset === preset.size ? null : preset.size)}
            title={`${pixelCount(preset.size * preset.size)} · ${formatUsdc(
              preset.size * preset.size * perPixel,
            )}`}
            className="btn-quiet tabular shrink-0 px-2.5 py-1.5 text-[12.5px]"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="board-rail__zoom flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={!zoom.canZoomOut}
          aria-label="Zoom out one step"
          title="Zoom out one step"
          className="btn-quiet size-8 shrink-0 text-[16px] font-bold leading-none"
        >
          −
        </button>
        <button
          type="button"
          onClick={onZoomFit}
          disabled={!zoom.canZoomOut}
          aria-label="Fit the whole board on screen"
          title="Fit the whole board on screen"
          className="btn-quiet h-8 shrink-0 px-2 text-[12.5px] leading-none"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          disabled={!zoom.canZoomIn}
          aria-label="Zoom in one step"
          title="Zoom in one step"
          className="btn-quiet size-8 shrink-0 text-[16px] font-bold leading-none"
        >
          +
        </button>
      </div>
    </div>
  );
}
