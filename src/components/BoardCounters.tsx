import { TOTAL_PIXELS } from "../lib/board/geometry";
import type { BoardStats } from "../lib/board/blocks";
import { formatUsdc } from "../lib/board/pricing";

/**
 * Three numbers, not one.
 *
 * Early on, "0.0300% complete" is a more motivating number than "300 sold",
 * and the block count says something neither of the others does: how many
 * separate people are on the board.
 */
export default function BoardCounters({
  stats,
  perPixel,
}: {
  stats: BoardStats;
  perPixel: number;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-x-4 overflow-hidden whitespace-nowrap text-sm">
      <p className="font-semibold tabular-nums">
        {stats.pixelsSold.toLocaleString("en-US")}
        <span className="text-neutral-500"> / {TOTAL_PIXELS.toLocaleString("en-US")} pixels sold</span>
      </p>
      <p className="tabular-nums text-neutral-400">{stats.percentSold.toFixed(4)}% complete</p>
      <p className="hidden tabular-nums text-neutral-400 sm:inline">
        {stats.blocksSold.toLocaleString("en-US")} blocks
      </p>
      <p className="hidden tabular-nums text-neutral-400 sm:inline">
        Current price {formatUsdc(perPixel)} per pixel
      </p>
    </div>
  );
}
