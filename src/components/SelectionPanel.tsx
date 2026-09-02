"use client";

import type { Selection } from "../lib/board/selection";
import { formatUsdc, pixelCount, unitOfSale } from "../lib/board/pricing";

/**
 * What you are selecting, what it costs, and the one button that buys it.
 *
 * TWO THINGS AND NOTHING IN THE MIDDLE. The wallet control used to sit between
 * them; it is in the top bar now — see `WalletConnect` — which leaves this
 * panel the shape it always described itself as having: the selection on the
 * left, the button on the right. There is no third thing to shed.
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
 *
 * The zoom trio is here rather than floating over the board because it is a
 * control, and every control on this page lives in this one block. It is the
 * keyboard's and the trackpad-less mouse's way onto the same ladder the wheel
 * and the pinch drive, and it steps that ladder rather than sliding: nothing
 * here can put a board pixel on a fraction of a screen pixel. Below `sm` it
 * gives way, after the legend and before anything else — a phone has a pinch,
 * and the bottom bar at that width has no room for three more buttons.
 */
export default function SelectionPanel({
  selection,
  perPixel,
  canBuy,
  hint,
  hintTone,
  onBuy,
}: {
  selection: Selection | null;
  perPixel: number;
  /** Which ends of the zoom ladder still have a rung, straight from the canvas. */
  canBuy: boolean;
  hint: string;
  /** "refused" paints the hint in danger; the board has painted the offending blocks to match. */
  hintTone: "info" | "refused";
  onBuy: () => void;
}) {
  return (
    <section className="selection-panel flex min-w-0 flex-1 items-center gap-x-4">
      {/*
        The same four pixels as the wallet row, for the same reason and found the
        same way. `overflow-x: auto` clips at the padding box, so without `p-1`
        the 2px focus ring at its 2px offset is cut off on every preset button
        here; `-m-1` returns the space to the layout so nothing moves. The wallet
        control was measured first and this row was reported as having the same
        shape rather than fixed at the same time, because it was outside that
        batch's remit — this is that report being acted on. See WalletConnect.tsx
        for the sampled evidence.
      */}
      <div className="selection-readout flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {selection === null ? (
          <>
            <p className="truncate font-display text-[15px] font-semibold text-ink sm:text-[17px]">
              <span className="sm:hidden">Nothing yet</span>
              <span className="hidden sm:inline">Nothing selected yet</span>
            </p>
            {/* The unit, said the same way the header says it. A buyer who
                looks here first and a buyer who looks up there first are told
                the same thing about what is actually for sale. */}
            <p className="hidden truncate text-[12.5px] text-body sm:block">{unitOfSale(perPixel)}</p>
          </>
        ) : (
          <>
            <p className="tabular truncate font-display text-[16px] font-bold leading-tight text-ink sm:text-[20px]">
              {/* "px" is what a phone has room for and "pixels" is what
                  everything else says; both are `display:none` when hidden, so
                  a screen reader is read exactly one of them. The noun agrees
                  with the number — a 1×1 purchase is the smallest thing this
                  wall sells and it said "1 pixels". */}
              <span className="sm:hidden">{selection.pixels.toLocaleString("en-US")} px</span>
              <span className="hidden sm:inline">{pixelCount(selection.pixels)}</span>
              <span className="text-hairline-strong"> · </span>
              {formatUsdc(selection.totalBaseUnits)}
            </p>
            <p className="tabular hidden truncate text-[12.5px] text-body lg:block">
              {selection.rect.w} × {selection.rect.h} at ({selection.rect.x}, {selection.rect.y}) ·{" "}
              {formatUsdc(perPixel)} a pixel
            </p>
          </>
        )}
      </div>

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
