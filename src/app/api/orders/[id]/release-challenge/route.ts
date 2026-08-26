import { getOrder } from "../../../../../lib/board/orders";
import { issueReleaseChallenge } from "../../../../../lib/board/release-challenge";
import { NO_STORE, isUuid, json, problem } from "../../../../../lib/http";

/**
 * Hand a holder something to sign, so the DELETE next door has something to
 * check.
 *
 * POST rather than GET because it writes: every call mints a nonce and stores
 * it. Never cached, for the same reason — two holders handed the same
 * challenge would be one holder able to replay the other's signature.
 *
 * Unauthenticated, and that is not an oversight. A challenge is a random
 * number and a sentence; it is worth nothing without the private key the
 * order's address belongs to, so there is no identity to check here that the
 * DELETE does not check properly a moment later. It discloses nothing the
 * board does not already: the caller had to know the order id, and `GET
 * /api/orders/:id` already answers whether an id names an order.
 *
 * The status ladder is the one every other `[id]` route walks — a
 * non-uuid and an id that names nothing both answer 404, so a guess cannot be
 * told from a miss. A paid order gets a challenge like any other: refusing
 * one here would tell a stranger which orders are sales, and the DELETE
 * refuses a paid order on its own (409, and only to its owner).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return problem(404, "That order does not exist.");

  const order = await getOrder(id);
  if (!order) return problem(404, "That order does not exist.");

  return json(await issueReleaseChallenge(id), { headers: NO_STORE });
}
