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
    <section className="selection-panel">
      {/*
        ONE ROW: the readout on the left, the button on the right, and the
        warning underneath BOTH of them rather than under the button.

        Settled with the strip's three zones on 2026-09-03. The hint used to
        hang off the bottom of `.selection-buy`, right-aligned under the button
        and capped at 19rem — which meant a refusal ("these pixels are taken")
        set the width of the button's column, and the whole panel grew sideways
        to carry a sentence. On its own line it is as wide as the panel already
        is and the box does not move when the sentence changes.
      */}
      <div className="selection-panel__row">
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
            <p className="truncate font-display text-[15px] font-semibold text-ink sm:text-[16px]">
              <span className="sm:hidden">Nothing yet</span>
              <span className="hidden sm:inline">Nothing selected yet</span>
              {/* The unit, said the same way the header says it, and on the same
                  line for the same reason the readout is: the panel is one line. */}
              <span className="hidden text-[12px] font-normal text-body sm:inline">
                <span className="text-hairline-strong"> · </span>
                {unitOfSale(perPixel)}
              </span>
            </p>
          </>
        ) : (
          <>
            <p className="tabular truncate font-display text-[15px] font-bold leading-tight text-ink sm:text-[17px]">
              {/* "px" is what a phone has room for and "pixels" is what
                  everything else says; both are `display:none` when hidden, so
                  a screen reader is read exactly one of them. The noun agrees
                  with the number — a 1×1 purchase is the smallest thing this
                  wall sells and it said "1 pixels". */}
              <span className="sm:hidden">{selection.pixels.toLocaleString("en-US")} px</span>
              <span className="hidden sm:inline">{pixelCount(selection.pixels)}</span>
              <span className="text-hairline-strong"> · </span>
              {formatUsdc(selection.totalBaseUnits)}
            {/*
              THE SECOND LINE FOLDED INTO THE FIRST, 2026-09-03. The panel is one
              line now — readout left, button right, the warning underneath — so
              the size and the coordinates ride along after the price instead of
              standing under it. That is 22px off the strip's height, which is
              22px of wall, and nothing is lost: the same words in the same
              order, and the coordinates still leave first when the room runs
              out. `.selection-coords` is that shed step and it is unchanged.
            */}
            <span className="tabular hidden text-[12px] font-normal text-body lg:inline">
              <span className="text-hairline-strong"> · </span>
              {selection.rect.w} × {selection.rect.h}
              <span className="selection-coords"> at ({selection.rect.x}, {selection.rect.y})</span>
            </span>
            </p>
          </>
        )}
      </div>

      <div className="selection-buy">
        <button
          type="button"
          onClick={onBuy}
          disabled={!canBuy}
          /* py-2 rather than py-2.5, and that is 5px of wall: the strip's
             height is this button's, and the pin above it follows. */
          className="btn-primary shrink-0 whitespace-nowrap px-3 py-2 text-[14px] sm:px-5 sm:text-[14px]"
        >
          Buy<span className="hidden sm:inline"> these pixels</span>
          {selection && canBuy && <span className="tabular"> — {formatUsdc(selection.totalBaseUnits)}</span>}
        </button>
      </div>
      </div>

      {/*
        THE WARNING, ON ITS OWN LINE AND INSIDE THE SAME BOX.

        `line-clamp-2` is what keeps it from being a third line: two lines is
        what the strip's height allows, and a hint that could take three would
        move the wall. Info-toned hints still give way below `sm`; a REFUSAL
        never does — a phone that hides the reason a button is dead is a phone
        showing somebody a dead button.
      */}
      <p
        className={`selection-hint line-clamp-2 text-[11.5px] leading-tight ${
          hintTone === "refused" ? "font-semibold text-danger" : "hidden text-body sm:block"
        }`}
        title={hint}
      >
        {hint}
      </p>
    </section>
  );
}
