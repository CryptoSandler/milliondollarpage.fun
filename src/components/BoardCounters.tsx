import { TOTAL_PIXELS } from "../lib/board/geometry";
import type { BoardStats } from "../lib/board/blocks";
import { formatPercentSold, formatUsdc } from "../lib/board/pricing";

/**
 * Three numbers, not one.
 *
 * Early on, "0.03%" is a more motivating number than "300 sold", and the
 * block count says something neither of the others does: how many separate
 * people are on the board.
 *
 * The top bar is one fixed row, so this gives way from the right as the
 * window narrows: the price goes first, then the block count, then the
 * percentage. The pixels-sold figure is the one that never leaves.
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
      <p className="tabular">
        <span className="font-semibold text-ink">{stats.pixelsSold.toLocaleString("en-US")}</span>
        <span className="text-body"> / {TOTAL_PIXELS.toLocaleString("en-US")} pixels sold</span>
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
      <p className="tabular hidden md:inline">{formatUsdc(perPixel)} per pixel</p>
    </div>
  );
}
