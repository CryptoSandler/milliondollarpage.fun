"use client";

import { PRESETS, type Selection } from "../lib/board/selection";
import { formatUsdc } from "../lib/board/pricing";

/**
 * The running total, and the presets beside it.
 *
 * This has to fit one fixed-height row all the way down to a phone width —
 * see .board-bar--bottom in globals.css, which no longer wraps. Three things
 * never give way, no matter how little room is left: the pixel count, the
 * total price, and the Buy button. Everything else yields first, in order:
 * the preset buttons keep their per-pixel price but move it to a hover
 * tooltip instead of printing it inline, and if they still don't fit they
 * scroll horizontally rather than wrap; the exact rectangle (size and
 * position) and the collision warning hide below `lg`; and the Buy button's
 * own label shortens to just "Buy" below `sm`.
 *
 * The Buy button is disabled rather than hidden when the selection collides:
 * the canvas has already painted the offending blocks red, and this only has
 * to agree with it.
 */
export default function SelectionPanel({
  selection,
  perPixel,
  activePreset,
  onPresetChange,
  onClear,
  onBuy,
}: {
  selection: Selection | null;
  perPixel: number;
  activePreset: number | null;
  onPresetChange: (size: number | null) => void;
  onClear: () => void;
  onBuy: () => void;
}) {
  return (
    <section className="flex min-w-0 flex-1 items-center gap-x-3 overflow-hidden">
      <div className="scrollbar-none flex min-w-0 items-center gap-2 overflow-x-auto">
        {PRESETS.map((preset) => (
          <button
            key={preset.size}
            type="button"
            onClick={() => onPresetChange(activePreset === preset.size ? null : preset.size)}
            title={`${(preset.size * preset.size).toLocaleString("en-US")} px · ${formatUsdc(
              preset.size * preset.size * perPixel,
            )}`}
            className={`shrink-0 rounded border px-2 py-1 text-xs font-medium ${
              activePreset === preset.size
                ? "border-emerald-400 bg-emerald-400/10"
                : "border-neutral-700 hover:border-neutral-500"
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            onPresetChange(null);
            onClear();
          }}
          className="shrink-0 rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
        >
          Freehand
        </button>
      </div>

      {selection === null ? (
        <p className="min-w-0 flex-1 truncate text-xs text-neutral-400">
          Click a block to select it, or drag to outline a bigger one.
        </p>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-x-3">
          <p className="hidden min-w-0 shrink truncate text-xs text-neutral-500 lg:block">
            {selection.rect.w} × {selection.rect.h} at ({selection.rect.x}, {selection.rect.y})
          </p>
          <p className="shrink-0 whitespace-nowrap text-xs tabular-nums sm:text-sm">
            {selection.pixels.toLocaleString("en-US")} px ·{" "}
            <span className="font-semibold">{formatUsdc(selection.totalBaseUnits)}</span>
          </p>
          {selection.collidesWith.length > 0 && (
            <p className="hidden min-w-0 shrink truncate text-xs text-red-400 lg:block">
              Already taken — the blocks in red are not for sale.
            </p>
          )}
          <button
            type="button"
            onClick={onBuy}
            disabled={!selection.buyable}
            className="shrink-0 whitespace-nowrap rounded bg-emerald-500 px-2 py-1 text-xs font-medium text-black disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400 sm:px-3 sm:text-sm"
          >
            Buy<span className="hidden sm:inline"> these pixels</span>
          </button>
        </div>
      )}
    </section>
  );
}
