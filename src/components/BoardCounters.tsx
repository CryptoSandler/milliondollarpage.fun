import { TOTAL_PIXELS } from "../lib/board/geometry";
import type { BoardStats } from "../lib/board/blocks";
import { formatPercentSold, unitOfSale } from "../lib/board/pricing";

/**
 * Three numbers, not one.
 *
 * Early on, "0.03%" is a more motivating number than "300 sold", and the
 * block count says something neither of the others does: how many separate
 * people are on the board.
 *
 * The top bar is one fixed row, so this gives way from the right as the
 * window narrows: the unit of sale goes first, then the block count, then the
 * percentage. The pixels-sold figure is the one that never leaves.
 *
 * What the header says about price is the UNIT, and the unit is now the pixel:
 * "$1 a pixel · any rectangle, from one pixel up". It used to be forbidden
 * from saying a per-pixel price here, because a price beside a counter reads
 * as an offer and a single pixel was not one. It is one now, so the sentence
 * that would have been misleading is the accurate one. `unitOfSale` owns the
 * wording; this file only decides when there is room for it.
 */
export default function BoardCounters({
  stats,
  perPixel,
}: {
  stats: BoardStats;
  perPixel: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-x-3 overflow-hidden whitespace-nowrap text-[13px] text-body">
      <p className="tabular truncate">
        <span className="font-semibold text-ink">{stats.pixelsSold.toLocaleString("en-US")}</span>
        {/* The denominator is the first thing to go on a phone: the numerator
            and the percentage still say everything the headline needs to. */}
        <span className="hidden text-body sm:inline">
          {" "}
          / {TOTAL_PIXELS.toLocaleString("en-US")}
        </span>
        <span className="text-body">
          <span className="hidden sm:inline"> pixels</span> sold
        </span>
      </p>
      <span
        className="tabular shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[12px] font-bold text-primary-pressed"
        title="Share of the board sold so far"
      >
        {formatPercentSold(stats.percentSold)}
      </span>
      <span className="hidden text-hairline-strong sm:inline">·</span>
      <p className="tabular hidden sm:inline">
        <span className="font-semibold text-ink">{stats.blocksSold.toLocaleString("en-US")}</span> blocks
      </p>
      <span className="hidden text-hairline-strong md:inline">·</span>
      <p className="tabular hidden md:inline">{unitOfSale(perPixel)}</p>
    </div>
  );
}
