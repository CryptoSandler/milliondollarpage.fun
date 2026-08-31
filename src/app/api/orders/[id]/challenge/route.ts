import { getOrder } from "../../../../../lib/board/orders";
import { issueChallenge } from "../../../../../lib/board/challenge";
import { readChallengeAction } from "../../../../../lib/wallet/signature";
import { NO_STORE, isUuid, json, problem } from "../../../../../lib/http";

/**
 * Hand a buyer something to sign, so the route that does the writing has
 * something to check.
 *
 * One endpoint for all three signed acts rather than one endpoint each: the
 * only thing that differs is the word in the sentence, and three routes would
 * be three copies of the same four statements. The act travels in the body and
 * is written onto the challenge row, so the sentence the wallet displays and
 * the sentence the server rebuilds cannot disagree — see
 * `src/lib/board/challenge.ts` and `migrations/010_challenge_actions.sql`.
 *
 * POST rather than GET because it writes: every call mints a nonce and stores
 * it. Never cached, for the same reason — two buyers handed the same
 * challenge would be one buyer able to replay the other's signature.
 *
 * Unauthenticated, and that is not an oversight. A challenge is a random
 * number and a sentence; it is worth nothing without the private key the
 * order's address belongs to, so there is no identity to check here that the
 * writing route does not check properly a moment later. It discloses nothing
 * the board does not already: the caller had to know the order id, and `GET
 * /api/orders/:id` already answers whether an id names an order.
 *
 * The status ladder is the one every other `[id]` route walks — a
 * non-uuid and an id that names nothing both answer 404, so a guess cannot be
 * told from a miss. A paid order gets a challenge like any other: refusing
 * one here would tell a stranger which orders are sales, and each writing
 * route refuses a paid order on its own (and only to its owner).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return problem(404, "That order does not exist.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "That request body is not JSON.");
  }

  const action = readChallengeAction(
    typeof body === "object" && body !== null ? (body as Record<string, unknown>).action : undefined,
  );
  // A 400 rather than a default. Defaulting would hand back a `release`
  // challenge to a client that asked for something else and meant it, and the
  // buyer would be shown a sentence about giving their pixels up.
  if (!action) return problem(400, "That is not something this site asks a wallet to sign.");

  const order = await getOrder(id);
  if (!order) return problem(404, "That order does not exist.");

  return json(await issueChallenge(id, action), { headers: NO_STORE });
}
