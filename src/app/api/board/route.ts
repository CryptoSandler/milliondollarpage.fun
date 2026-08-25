import { boardStats, listLiveBlocks } from "../../../lib/board/blocks";
import { pricePerPixelBaseUnits } from "../../../lib/board/settings";
import { NO_STORE, json } from "../../../lib/http";

/**
 * Everything the board page needs on first paint, in one round trip.
 *
 * Never cached: a reservation appears and expires within half an hour, and a
 * stale board is a buyer dragging over pixels somebody already holds.
 */
export async function GET(): Promise<Response> {
  const [blocks, stats, price] = await Promise.all([
    listLiveBlocks(),
    boardStats(),
    pricePerPixelBaseUnits(),
  ]);

  return json({ blocks, stats, pricePerPixelBaseUnits: price }, { headers: NO_STORE });
}
