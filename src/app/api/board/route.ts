import {
  boardStandings,
  boardStats,
  listBoardRects,
  STANDINGS_ON_WALL,
} from "../../../lib/board/blocks";
import { ensureWall } from "../../../lib/board/composite";
import { pricePerPixelBaseUnits } from "../../../lib/board/settings";
import { recentPurchases } from "../../../lib/board/tape";
import { visitsTotal } from "../../../lib/board/audience";
import { onlineNow } from "../../../lib/board/presence";
import { NO_STORE, json } from "../../../lib/http";

/**
 * Everything the board page needs on first paint, in one round trip.
 *
 * RESHAPED RATHER THAN RETIRED. This route used to ship a row per block, with
 * that block's caption, link, fit and a flag saying it had a bitmap to fetch —
 * one JSON object and one image request per purchase. At pixel granularity
 * that is the wrong shape twice over, so what it ships now is:
 *
 *   * `rects` — id and four numbers per live rectangle, and nothing else. It
 *     is what the pointer hit-tests, what the selector refuses, and what the
 *     canvas draws holds from.
 *   * `wall` — the version and URL of the composite bitmap carrying every
 *     visible purchase's artwork. One request, immutable, cached for a year;
 *     a change to the wall changes the URL rather than needing a purge.
 *   * `tape` — the twenty most recent settled purchases, and `asOf`, the
 *     moment this payload was built. It rides along here rather than getting
 *     an endpoint and a poll of its own: the board already asks this route
 *     twice a minute, the rows are a rounding error beside the rectangle list,
 *     and a second poll would be a second thing to keep in step with the
 *     first. `asOf` is what lets the browser render "4m ago" identically on
 *     the server and on the first client paint — see `PurchaseTape`.
 *   * `standings` — the five biggest rectangles, for the foot of the right
 *     rail. Five rows of four numbers, riding along for the same reason the
 *     tape does. It carries no total and it is not a step towards one: what
 *     the wall has TAKEN stays out of this payload, so the board cannot print
 *     it even by accident. See `soldValueBaseUnits`, and `board.test.ts`.
 *
 * The name stayed because the job did: this is still "what is on the board".
 * Caption and link now arrive from `/api/blocks/{id}` when somebody rests on a
 * rectangle, which is the only moment anybody wants them.
 *
 * `wall` is null only before the very first composite exists and a rebuild has
 * just failed — see `ensureWall`, which hands back the wall that was already
 * serving rather than letting a broken build blank the board.
 *
 * Never cached: a reservation appears and expires within half an hour, and a
 * stale board is a buyer dragging over pixels somebody already holds. The wall
 * it points at is cached hard, which is the whole point of versioning it.
 */
export async function GET(): Promise<Response> {
  const [rects, wall, stats, price, tape, online, standings, views] = await Promise.all([
    listBoardRects(),
    ensureWall(),
    boardStats(),
    pricePerPixelBaseUnits(),
    recentPurchases(),
    onlineNow(),
    boardStandings(STANDINGS_ON_WALL),
    visitsTotal(),
  ]);

  return json(
    {
      rects,
      wall,
      stats,
      pricePerPixelBaseUnits: price,
      tape,
      online,
      views,
      standings,
      asOf: new Date().toISOString(),
    },
    { headers: NO_STORE },
  );
}
