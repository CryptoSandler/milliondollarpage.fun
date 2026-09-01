import BoardView from "../components/BoardView";
import { boardStats, listBoardRects } from "../lib/board/blocks";
import { ensureWall } from "../lib/board/composite";
import { pricePerPixelBaseUnits } from "../lib/board/settings";
import { recentPurchases } from "../lib/board/tape";
import { onlineNow } from "../lib/board/presence";

export const dynamic = "force-dynamic";

/**
 * The first paint, server-rendered from the same four things `/api/board`
 * returns — including the wall's version, so the browser starts loading the
 * bitmap from the HTML rather than after a round trip.
 */
export default async function Page() {
  const [rects, wall, stats, perPixel, tape, online] = await Promise.all([
    listBoardRects(),
    ensureWall(),
    boardStats(),
    pricePerPixelBaseUnits(),
    recentPurchases(),
    onlineNow(),
  ]);

  return (
    <BoardView
      initial={{
        rects,
        wall,
        stats,
        pricePerPixelBaseUnits: perPixel,
        tape,
        online,
        asOf: new Date().toISOString(),
      }}
    />
  );
}
