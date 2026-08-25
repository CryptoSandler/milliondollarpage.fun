import { getOrder, toPublicOrder } from "../../../../lib/board/orders";
import { NO_STORE, isUuid, json, problem } from "../../../../lib/http";

/**
 * An order's current state, for polling a hold or a confirmation screen.
 *
 * Never cached: a hold's status can flip (paid, expired) between two
 * requests a few seconds apart. `getOrder` never selects `pending_image`, so
 * there is nothing here for this route to accidentally leak either.
 *
 * This route is unauthenticated by design — polling a hold's status must not
 * require proving ownership of it. That is exactly why `toPublicOrder` runs
 * before the response goes out: `/board` already publishes every live
 * block's id, so an `Order` returned here with its `buyerPubkey` intact would
 * hand anyone the one credential `/content` and `/confirm` trust.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return problem(404, "That order does not exist.");

  const order = await getOrder(id);
  if (!order) return problem(404, "That order does not exist.");
  return json(toPublicOrder(order), { headers: NO_STORE });
}
