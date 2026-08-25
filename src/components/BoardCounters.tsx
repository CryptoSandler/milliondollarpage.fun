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
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
      <p className="text-2xl font-semibold tabular-nums">
        {stats.pixelsSold.toLocaleString("en-US")}
        <span className="text-neutral-500"> / {TOTAL_PIXELS.toLocaleString("en-US")} pixels sold</span>
      </p>
      <p className="text-sm tabular-nums text-neutral-400">
        {stats.percentSold.toFixed(4)}% complete
      </p>
      <p className="text-sm tabular-nums text-neutral-400">
        {stats.blocksSold.toLocaleString("en-US")} blocks
      </p>
      <p className="text-sm tabular-nums text-neutral-400">
        Current price {formatUsdc(perPixel)} per pixel
      </p>
    </div>
  );
}
