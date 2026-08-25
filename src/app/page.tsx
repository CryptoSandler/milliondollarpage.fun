import BoardView from "../components/BoardView";
import { boardStats, listLiveBlocks } from "../lib/board/blocks";
import { pricePerPixelBaseUnits } from "../lib/board/settings";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [blocks, stats, perPixel] = await Promise.all([
    listLiveBlocks(),
    boardStats(),
    pricePerPixelBaseUnits(),
  ]);

  return <BoardView initial={{ blocks, stats, pricePerPixelBaseUnits: perPixel }} />;
}
