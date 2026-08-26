"use client";

import type { ReactNode } from "react";
import { PRESETS, type Selection } from "../lib/board/selection";
import { formatUsdc } from "../lib/board/pricing";

/**
 * What you are selecting, what it costs, and the one button that buys it.
 *
 * This has to work in both of the layouts .board-controls chooses between: one
 * fixed-height row across the bottom, all the way down to a phone width, and a
 * column down the side of a landscape window. The row is what the markup here
 * describes; the column is a handful of rules in globals.css that re-order and
 * re-stretch these same elements, keyed to the class names below. One DOM
 * tree, two shapes — never two copies of the Buy button.
 *
 * Three things never give way in either, no matter how little room is left:
 * the pixel count, the total price, and the Buy button. Everything else yields
 * first, in the order DESIGN.md sets out: the legend (its own component), then
 * the exact rectangle readout, then the per-preset prices, which move into a
 * tooltip and then scroll horizontally rather than wrap.
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
  children,
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
  /**
   * Whatever else the controls carry — the legend, the wallet field —
   * rendered between the readout and the Buy button. DESIGN.md puts the
   * primary action last, so nothing sits to the right of it in the bar or
   * below it in the panel.
   */
  children?: ReactNode;
}) {
  return (
    <section className="selection-panel flex min-w-0 flex-1 items-center gap-x-4">
      <div className="selection-presets scrollbar-none flex min-w-0 max-w-[5rem] shrink items-center gap-1.5 overflow-x-auto sm:max-w-none">
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
            title={`${(preset.size * preset.size).toLocaleString("en-US")} pixels · ${formatUsdc(
              preset.size * preset.size * perPixel,
            )}`}
            className="btn-quiet tabular shrink-0 px-2.5 py-1.5 text-[12.5px]"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="selection-readout flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {selection === null ? (
          <>
            <p className="truncate font-display text-[15px] font-semibold text-ink sm:text-[17px]">
              <span className="sm:hidden">Nothing yet</span>
              <span className="hidden sm:inline">Nothing selected yet</span>
            </p>
            <p className="hidden truncate text-[12.5px] text-body sm:block">
              Every sale is whole blocks, ten pixels to a side.
            </p>
          </>
        ) : (
          <>
            <p className="tabular truncate font-display text-[16px] font-bold leading-tight text-ink sm:text-[20px]">
              {selection.pixels.toLocaleString("en-US")}
              <span className="sm:hidden"> px</span>
              <span className="hidden sm:inline"> pixels</span>
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

      {children}

      <div className="selection-buy flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={onBuy}
          disabled={!canBuy}
          className="btn-primary shrink-0 whitespace-nowrap px-3 py-2.5 text-[14px] sm:px-6 sm:text-[14.5px]"
        >
          Buy<span className="hidden sm:inline"> these pixels</span>
          {selection && canBuy && <span className="tabular"> — {formatUsdc(selection.totalBaseUnits)}</span>}
        </button>
        <p
          className={`line-clamp-2 max-w-[10rem] text-right text-[11.5px] leading-tight sm:max-w-[19rem] ${
            hintTone === "refused" ? "font-semibold text-danger" : "hidden text-body sm:block"
          }`}
          title={hint}
        >
          {hint}
        </p>
      </div>
    </section>
  );
}
