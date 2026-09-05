import { rectIsValid } from "../../../lib/board/geometry";
import { reserveRect, RectangleInvalid, RectangleTaken } from "../../../lib/board/reserve";
import { checkReservationLimits } from "../../../lib/callers/limits";
import { NO_STORE, identify, json, problem } from "../../../lib/http";
import { isOwnerChain, type ProvenOwner } from "../../../lib/board/owner";

const NOT_A_RECTANGLE = "That is not a rectangle this board can sell.";

/**
 * Hold a rectangle, for a while that depends on how big it is.
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

  // Validity before limits, and this order is load-bearing: two of the four
  // limits price the request by its AREA, and a rectangle with no area — or
  // one made of half pixels — has no honest area to be priced by.
  // `reserveRect` checks this again at its own boundary, which is where it
  // belongs; this is not a second rule, it is the same function asked earlier.
  if (!rectIsValid(parsed.rect)) return problem(400, NOT_A_RECTANGLE);

  const limit = await checkReservationLimits(caller.ipHash, parsed.rect);
  if (!limit.ok) {
    const seconds = Math.max(1, Math.ceil((Date.parse(limit.retryAt) - Date.now()) / 1000));
    return problem(429, limit.message, { retryAt: limit.retryAt }, { "retry-after": String(seconds) });
  }

  try {
    // A hold this caller already has on exactly this rectangle comes back as
    // an ordinary reservation rather than a 409 — they are resuming their own
    // purchase, not competing for it. 201 either way: from the client's side
    // the outcome is identical, "these pixels are held for you".
    const held = await reserveRect(parsed.rect, parsed.owner, caller.ipHash);
    return json(held, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof RectangleTaken) {
      return problem(409, rectangleTakenMessage(error.availableAt, error.yourOrderIds), {
        availableAt: error.availableAt,
        // Only ever this caller's own order ids (see RectangleTaken in
        // reserve.ts). A blocking row belonging to anybody else contributes
        // nothing to this array, so the 409 body still says nothing about who
        // else is on the board — the client uses it to offer a release, and
        // the caller already knows about every id in it.
        yourOrderIds: error.yourOrderIds,
      });
    }
    if (error instanceof RectangleInvalid) return problem(400, NOT_A_RECTANGLE);
    throw error;
  }
}

/**
 * Distinguishes the three ways a rectangle can be unavailable.
 *
 * Sold is permanent and outranks everything, so it is checked first: a hold of
 * your own in the way changes nothing about pixels somebody has already paid
 * for. Otherwise, a hold you started yourself is the one refusal you can act
 * on, so it gets its own sentence and says what to do. Only then does it fall
 * through to somebody else's hold, where the useful fact is the clock.
 *
 * Never mentions who holds a rectangle — only when, or that it is yours.
 */
function rectangleTakenMessage(availableAt: string | null, yourOrderIds: string[]): string {
  if (availableAt === null) {
    return "Part of this rectangle has already been sold. That's permanent — pick a different one.";
  }
  if (yourOrderIds.length > 0) {
    return "Part of this rectangle is a hold you started yourself and never finished. " +
      "Let that hold go and those pixels are free to pick again — nothing was ever charged for them.";
  }
  const time = new Date(availableAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Someone is currently holding part of this rectangle while they finish buying it. ` +
    `It frees up at ${time} if they don't complete the purchase.`;
}

function parseReserveBody(body: unknown): { rect: { x: number; y: number; w: number; h: number }; owner: ProvenOwner } | null {
  if (typeof body !== "object" || body === null) return null;
  const { rect, buyerPubkey, chain } = body as Record<string, unknown>;
  if (typeof buyerPubkey !== "string" || buyerPubkey.trim() === "") return null;
  /*
    THE CHAIN IS REQUIRED AND HAS NO DEFAULT, here as everywhere else an owner
    is named. A hold is where ownership begins, so a reservation that did not
    say which alphabet its address is written in would be a row nobody could
    later prove they owned — the signed routes compare the PAIR.
  */
  if (!isOwnerChain(chain)) return null;
  if (typeof rect !== "object" || rect === null) return null;
  const { x, y, w, h } = rect as Record<string, unknown>;
  if (![x, y, w, h].every((n) => typeof n === "number" && Number.isInteger(n))) return null;
  return {
    rect: { x: x as number, y: y as number, w: w as number, h: h as number },
    owner: { chain, address: buyerPubkey },
  };
}
