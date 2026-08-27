import { getBlockDetails } from "../../../../lib/board/blocks";
import { NO_STORE, isUuid, json, problem } from "../../../../lib/http";

/**
 * One rectangle's caption and link, fetched when somebody rests on it.
 *
 * Called by the browser: `src/lib/board/block-details.ts` fetches this for the
 * rectangle under the pointer or under the keyboard cursor, and nothing else
 * links here.
 *
 * WHY THIS EXISTS AT ALL. The board payload used to carry every block's
 * caption and link. A block was 10×10 then; the unit is a pixel now, and
 * shipping tens of thousands of captions to render one hover card is the same
 * mistake as shipping tens of thousands of bitmaps. Nobody reads them all.
 *
 * WHO GETS TO SEE WHAT: `getBlockDetails` publishes a caption and a link only
 * for a sale that has not been taken down — the same `publishesTextSql` the
 * composite and the image route use, not a second copy of the rule. A hold
 * still answers, with its rectangle and its status and no words, because a
 * hover card over a hold has something true to say and nothing of anybody's
 * to leak.
 *
 * Not cached. A takedown has to take effect now, and this payload is a few
 * dozen bytes fetched once per rectangle a visitor actually looks at.
 *
 * The status ladder is the one every other `[id]` route walks: an id that is
 * not a uuid answers 404 rather than reaching Postgres and raising 22P02 as an
 * unauthenticated 500, and it answers the SAME 404 an absent id gets.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return problem(404, "There is nothing on those pixels.");

  const details = await getBlockDetails(id);
  if (!details) return problem(404, "There is nothing on those pixels.");

  return json(details, { headers: NO_STORE });
}
