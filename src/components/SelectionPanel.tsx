"use client";

import { PRESETS, type Selection } from "../lib/board/selection";
import { formatUsdc } from "../lib/board/pricing";

/**
 * What you are selecting, what it costs, and the one button that buys it.
 *
 * This has to fit one fixed-height row all the way down to a phone width —
 * see .board-bar--bottom in globals.css, which never wraps. Three things never
 * give way, no matter how little room is left: the pixel count, the total
 * price, and the Buy button. Everything else yields first, in the order
 * DESIGN.md sets out: the legend (its own component), then the exact rectangle
 * readout, then the per-preset prices, which move into a tooltip and then
 * scroll horizontally rather than wrap.
 *
 * The Buy button is disabled rather than hidden when the rectangle cannot be
 * bought, and `hint` underneath it always says why — or, when it can be
 * bought, exactly what pressing it will do.
 */
export default function SelectionPanel({
  selection,
  perPixel,
  activePreset,
  canBuy,
  hint,
  hintTone,
  onPresetChange,
  onClear,
  onBuy,
}: {
  selection: Selection | null;
  perPixel: number;
  activePreset: number | null;
  canBuy: boolean;
  hint: string;
  /** "refused" paints the hint in danger; the board has painted the offending blocks to match. */
  hintTone: "info" | "refused";
  onPresetChange: (size: number | null) => void;
  onClear: () => void;
  onBuy: () => void;
}) {
  return (
    <section className="flex min-w-0 flex-1 items-center gap-x-4">
      <div className="scrollbar-none flex min-w-0 shrink items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          aria-pressed={activePreset === null}
          onClick={() => {
            onPresetChange(null);
            onClear();
          }}
          className="btn-quiet shrink-0 px-2.5 py-1.5 text-[12.5px]"
        >
          Freehand
        </button>
        {PRESETS.map((preset) => (
          <button
            key={preset.size}
            type="button"
            aria-pressed={activePreset === preset.size}
            onClick={() => onPresetChange(activePreset === preset.size ? null : preset.size)}
            title={`${(preset.size * preset.size).toLocaleString("en-US")} pixels · ${formatUsdc(
              preset.size * preset.size * perPixel,
            )}`}
            className="btn-quiet tabular shrink-0 px-2.5 py-1.5 text-[12.5px]"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {selection === null ? (
          <>
            <p className="truncate font-display text-[17px] font-semibold text-ink">
              Nothing selected yet
            </p>
            <p className="truncate text-[12.5px] text-body">
              Drag or tap the board to outline a block, or pick a size on the left.
            </p>
          </>
        ) : (
          <>
            <p className="tabular truncate font-display text-[20px] font-bold leading-tight text-ink">
              {selection.pixels.toLocaleString("en-US")} pixels
              <span className="text-hairline-strong"> · </span>
              {formatUsdc(selection.totalBaseUnits)}
            </p>
            <p className="tabular hidden truncate text-[12.5px] text-body lg:block">
              {selection.rect.w} × {selection.rect.h} at ({selection.rect.x}, {selection.rect.y}) ·{" "}
              {formatUsdc(perPixel)} per pixel
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={onBuy}
          disabled={!canBuy}
          className="btn-primary shrink-0 whitespace-nowrap px-4 py-2.5 text-[14.5px] sm:px-6"
        >
          Buy<span className="hidden sm:inline"> these pixels</span>
          {selection && canBuy && <span className="tabular"> — {formatUsdc(selection.totalBaseUnits)}</span>}
        </button>
        <p
          className={`max-w-[15rem] truncate text-right text-[11.5px] ${
            hintTone === "refused" ? "font-semibold text-danger" : "text-body"
          }`}
          title={hint}
        >
          {hint}
        </p>
      </div>
    </section>
  );
}
