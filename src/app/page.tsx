import BoardView from "../components/BoardView";
import { boardStats, listBoardRects } from "../lib/board/blocks";
import { ensureWall } from "../lib/board/composite";
import { pricePerPixelBaseUnits } from "../lib/board/settings";

export const dynamic = "force-dynamic";

/**
 * The first paint, server-rendered from the same four things `/api/board`
 * returns — including the wall's version, so the browser starts loading the
 * bitmap from the HTML rather than after a round trip.
 */
export default async function Page() {
  const [rects, wall, stats, perPixel] = await Promise.all([
    listBoardRects(),
    ensureWall(),
    boardStats(),
    pricePerPixelBaseUnits(),
  ]);

  return <BoardView initial={{ rects, wall, stats, pricePerPixelBaseUnits: perPixel }} />;
}
