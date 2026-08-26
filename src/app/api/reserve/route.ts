import { reserveRect, RectangleInvalid, RectangleTaken } from "../../../lib/board/reserve";
import { checkReservationLimits } from "../../../lib/callers/limits";
import { NO_STORE, identify, json, problem } from "../../../lib/http";

/**
 * Hold a rectangle for thirty minutes.
 *
 * A 409 here is an ordinary outcome, not a failure: two people wanted the same
 * pixels and Postgres picked one. It must never surface as a 500.
 */
export async function POST(request: Request): Promise<Response> {
  const caller = identify(request);
  if (!caller.ok) return problem(400, caller.message);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "That request body is not JSON.");
  }

  const parsed = parseReserveBody(body);
  if (!parsed) return problem(400, "A rectangle and a wallet address are required.");

  const limit = await checkReservationLimits(caller.ipHash);
  if (!limit.ok) {
    const seconds = Math.max(1, Math.ceil((Date.parse(limit.retryAt) - Date.now()) / 1000));
    return problem(429, limit.message, { retryAt: limit.retryAt }, { "retry-after": String(seconds) });
  }

  try {
    const held = await reserveRect(parsed.rect, parsed.buyerPubkey, caller.ipHash);
    return json(held, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof RectangleTaken) {
      return problem(409, rectangleTakenMessage(error.availableAt), { availableAt: error.availableAt });
    }
    if (error instanceof RectangleInvalid) return problem(400, "That is not a rectangle this board can sell.");
    throw error;
  }
}

/**
 * Distinguishes the two ways a rectangle can be unavailable: sold, which is
 * permanent, from held, which is somebody else mid-purchase and frees up on
 * its own. `availableAt` is null exactly for the first case (see
 * `earliestAvailability` in reserve.ts), so that alone decides which copy to
 * use. Never mentions who holds it — only when.
 */
function rectangleTakenMessage(availableAt: string | null): string {
  if (availableAt === null) {
    return "Part of this rectangle has already been sold. That's permanent — pick a different one.";
  }
  const time = new Date(availableAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Someone is currently holding part of this rectangle while they finish buying it. ` +
    `It frees up at ${time} if they don't complete the purchase.`;
}

function parseReserveBody(body: unknown): { rect: { x: number; y: number; w: number; h: number }; buyerPubkey: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const { rect, buyerPubkey } = body as Record<string, unknown>;
  if (typeof buyerPubkey !== "string" || buyerPubkey.trim() === "") return null;
  if (typeof rect !== "object" || rect === null) return null;
  const { x, y, w, h } = rect as Record<string, unknown>;
  if (![x, y, w, h].every((n) => typeof n === "number" && Number.isInteger(n))) return null;
  return { rect: { x: x as number, y: y as number, w: w as number, h: h as number }, buyerPubkey };
}
