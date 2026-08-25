"use client";

import { PRESETS, type Selection } from "../lib/board/selection";
import { formatUsdc } from "../lib/board/pricing";

/**
 * The running total, and the presets beside it.
 *
 * The presets carry their own price so nobody has to do arithmetic to find out
 * what a 50×50 costs. The Buy button is disabled rather than hidden when the
 * selection collides: the canvas has already painted the offending blocks red,
 * and this only has to agree with it.
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
    <section className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.size}
            type="button"
            onClick={() => onPresetChange(activePreset === preset.size ? null : preset.size)}
            className={`rounded border px-2 py-1 text-xs ${
              activePreset === preset.size
                ? "border-emerald-400 bg-emerald-400/10"
                : "border-neutral-700 hover:border-neutral-500"
            }`}
          >
            <span className="font-medium">{preset.label}</span>
            <span className="ml-2 text-neutral-400 tabular-nums">
              {(preset.size * preset.size).toLocaleString("en-US")} px ·{" "}
              {formatUsdc(preset.size * preset.size * perPixel)}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            onPresetChange(null);
            onClear();
          }}
          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
        >
          Freehand
        </button>
      </div>

      {selection === null ? (
        <p className="text-xs text-neutral-400">
          Nothing selected. Click a block to start, or drag to outline a bigger one.
        </p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-sm tabular-nums">
            {selection.rect.w} × {selection.rect.h} at ({selection.rect.x}, {selection.rect.y})
          </p>
          <p className="text-sm tabular-nums">
            {selection.pixels.toLocaleString("en-US")} pixels ·{" "}
            <span className="font-semibold">{formatUsdc(selection.totalBaseUnits)}</span>
          </p>
          {selection.collidesWith.length > 0 && (
            <p className="text-xs text-red-400">
              Part of this rectangle already belongs to someone. The blocks in red are not for sale.
            </p>
          )}
          <button
            type="button"
            onClick={onBuy}
            disabled={!selection.buyable}
            className="rounded bg-emerald-500 px-3 py-1 text-sm font-medium text-black disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            Buy these pixels
          </button>
        </div>
      )}
    </section>
  );
}
