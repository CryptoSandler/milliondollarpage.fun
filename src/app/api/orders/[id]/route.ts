import { getOrder } from "../../../../lib/board/orders";
import { NO_STORE, json, problem } from "../../../../lib/http";

/**
 * An order's current state, for polling a hold or a confirmation screen.
 *
 * Never cached: a hold's status can flip (paid, expired) between two
 * requests a few seconds apart. `getOrder` never selects `pending_image`, so
 * there is nothing here for this route to accidentally leak either.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return problem(404, "That order does not exist.");
  return json(order, { headers: NO_STORE });
}
