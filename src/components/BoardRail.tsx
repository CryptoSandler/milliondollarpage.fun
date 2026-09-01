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
 * ## Why it overlays the board rather than displacing it
 *
 * The norm is that the wall takes almost the whole screen and everything else
 * is a small contribution. A rail that pushed the board down would spend the
 * vertical budget twice over; this one sits ON the board's top edge, inside the
 * frame, where it costs the wall a strip of its own margin rather than a strip
 * of the viewport. It is the one piece of chrome allowed to do that, and it is
 * allowed because it is 28px tall and because a reader reaching for a size is
 * looking at the board rather than at the pixels under this.
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
      <div className="selection-presets scrollbar-none -m-1 flex min-w-0 max-w-[5rem] shrink items-center gap-1.5 overflow-x-auto p-1 sm:max-w-none">
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
      <div className="selection-zoom hidden shrink-0 items-center gap-1 sm:flex">
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
