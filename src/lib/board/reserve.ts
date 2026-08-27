import { randomInt } from "node:crypto";
import { query, transaction } from "../db";
import { chargeHold } from "../callers/hold-meter";
import { LIVE, sweepExpiredReservations } from "./blocks";
import { type Rect, rectIsValid, rectPixels } from "./geometry";
import { holdMinutes } from "./hold-clock";
import { totalBaseUnits } from "./pricing";

/**
 * Holding a rectangle.
 *
 * The sweep and the insert run inside ONE transaction, and that is the whole
 * design. An exclusion constraint cannot reference now(), so expiry cannot live
 * in its predicate — an expired-but-unswept hold still blocks the constraint.
 * Sweeping in a separate statement beforehand would leave a window in which
 * another transaction re-creates the hold we just deleted. Inside one
 * transaction, the sweep and the constraint see the same snapshot.
 *
 * Concurrency is not handled here. Two callers racing for overlapping
 * rectangles both reach the INSERT, and Postgres refuses one of them with
 * 23P01. That refusal IS the correctness argument; there is no lock to
 * remember to take, and no check-then-act window to lose.
 *
 * HOW LONG A HOLD LASTS is `holdMinutes` in `./hold-clock.ts` and is a
 * function of area, not a constant. It is written into `expires_at` here, and
 * the same number prices the hold against its caller's pixel-minute budget in
 * `../callers/limits.ts` — one rule, read twice, never restated.
 */

/**
 * Payment attribution, inherited from the sibling project.
 *
 * A transfer arriving at the treasury says nothing about who it is for. Every
 * order gets a unique fraction added to its total, and that fraction is what
 * identifies it. Drawn from 1..999,999 and never zero, because a round amount
 * is precisely the one that cannot be attributed.
 */
export const FRACTION_MIN = 1;
export const FRACTION_MAX = 999_999;

export class RectangleTaken extends Error {
  /**
   * When the block that beat us might free up.
   *
   * The expiry of the live reservation that stands in the way, or `null`
   * when what blocks it is `paid` or `minted` and therefore never expires.
   * Never the identity of who holds it — see `earliestAvailability` below.
   */
  readonly availableAt: string | null;

  /**
   * The blocking rows that belong to THIS caller, and nothing else.
   *
   * A buyer who drags a rectangle, presses Buy, then abandons the dialog
   * collides with their own live hold on every retry. Without this
   * they are locked out of their own pixels with nothing to do about it, so
   * the ids of their own holds travel with the refusal and the client offers
   * to release them.
   *
   * Only ever the caller's own. A third party's rows contribute nothing here
   * — not an id, not a pubkey, not a count. `availableAt` above is still the
   * only thing this error says about anybody else, and it says *when*, never
   * *who*.
   */
  readonly yourOrderIds: string[];

  constructor(availableAt: string | null = null, yourOrderIds: string[] = []) {
    super("Those pixels are no longer available.");
    this.name = "RectangleTaken";
    this.availableAt = availableAt;
    this.yourOrderIds = yourOrderIds;
  }
}

export class RectangleInvalid extends Error {
  constructor() {
    super("That is not a rectangle this board can sell.");
    this.name = "RectangleInvalid";
  }
}

export type Reservation = {
  id: string;
  rect: Rect;
  pixels: number;
  pricePerPixelBaseUnits: number;
  totalBaseUnits: number;
  paymentBaseUnits: number;
  expiresAt: string;
};

export async function reserveRect(
  rect: Rect,
  buyerPubkey: string,
  ipHash: string,
): Promise<Reservation> {
  // Checked before opening a transaction: a malformed rectangle is the
  // caller's mistake, not a race, and the database's CHECK constraints would
  // report it as a generic 23514 with no useful message.
  if (!rectIsValid(rect)) throw new RectangleInvalid();

  const pixels = rectPixels(rect);
  const fraction = randomInt(FRACTION_MIN, FRACTION_MAX + 1);

  try {
    return await transaction(async (client) => {
      await sweepExpiredReservations(client);

      // Read the price inside the transaction so the row and the number the
      // buyer is quoted come from the same snapshot.
      const setting = await client.query<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'price_per_pixel_usdc'",
      );
      if (setting.rows.length === 0) {
        throw new Error('Setting "price_per_pixel_usdc" is missing. Migration 001 seeds it.');
      }
      const perPixel = Number(setting.rows[0].value);
      const total = totalBaseUnits(pixels, perPixel);

      const inserted = await client.query<{ id: string; expires_at: Date }>(
        `INSERT INTO blocks
           (x, y, w, h, status, buyer_pubkey, ip_hash,
            price_per_pixel_usdc, total_usdc, payment_fraction, expires_at)
         VALUES ($1, $2, $3, $4, 'reserved', $5, $6, $7, $8, $9,
                 now() + ($10 || ' minutes')::interval)
         RETURNING id, expires_at`,
        [
          rect.x, rect.y, rect.w, rect.h,
          buyerPubkey, ipHash,
          perPixel, total, fraction,
          String(holdMinutes(pixels)),
        ],
      );

      const row = inserted.rows[0];

      // Inside the transaction, and priced off the row that was just written
      // rather than off a second computation of the same numbers. A hold that
      // is rolled back — the losing side of a race for overlapping pixels —
      // is never charged, because this statement is rolled back with it.
      await chargeHold(client, { blockId: row.id, ipHash });

      return {
        id: row.id,
        rect,
        pixels,
        pricePerPixelBaseUnits: perPixel,
        totalBaseUnits: total,
        paymentBaseUnits: total + fraction,
        expiresAt: row.expires_at.toISOString(),
      };
    });
  } catch (error) {
    // 23P01 is the exclusion constraint: those pixels are already spoken for.
    // The transaction above has already rolled back and released its
    // connection by the time we get here, so this is a fresh, best-effort
    // read on the pool — good enough to explain a 409, not a second
    // correctness check standing in for the constraint.
    if ((error as { code?: string } | null)?.code === "23P01") {
      const blocking = await blockingRows(rect);

      // The one refusal that isn't one: the only thing in the way is this
      // caller's own hold on exactly these pixels. Hand it back as if it had
      // just been created and let them carry on where they left off.
      const mine = resumableHold(blocking, rect, buyerPubkey);
      if (mine) return toReservation(mine, rect, pixels);

      throw new RectangleTaken(earliestAvailability(blocking), ownOrderIds(blocking, buyerPubkey));
    }
    throw error;
  }
}

/**
 * The live rows standing in the way of a rectangle.
 *
 * The same LIVE rows the exclusion constraint and the board selector already
 * agree on (see `blocks.ts`), restricted to rows overlapping the requested
 * rectangle via the same generated int4range columns the constraint uses.
 *
 * `buyer_pubkey` IS selected here, and that is safe precisely because nothing
 * below ever returns it: it is compared against the caller's own address and
 * then discarded. Everything derived from these rows and handed outwards —
 * `availableAt`, `yourOrderIds`, a resumed reservation — is either about the
 * clock or about the caller themselves. `ip_hash` is not selected at all.
 */
type BlockingRow = {
  id: string;
  status: string;
  buyer_pubkey: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  price_per_pixel_usdc: string;
  total_usdc: string;
  payment_fraction: number | null;
  expires_at: Date | null;
};

async function blockingRows(rect: Rect): Promise<BlockingRow[]> {
  return query<BlockingRow>(
    `SELECT id, status, buyer_pubkey, x, y, w, h,
            price_per_pixel_usdc, total_usdc, payment_fraction, expires_at
       FROM blocks
      WHERE ${LIVE}
        AND x_range && int4range($1, $2)
        AND y_range && int4range($3, $4)`,
    [rect.x, rect.x + rect.w, rect.y, rect.y + rect.h],
  );
}

/**
 * The caller's own hold on exactly this rectangle, when that is the ONLY
 * thing blocking it.
 *
 * Every clause is load-bearing:
 *
 * - *Exactly one row*, because with anything else in the way the rectangle is
 *   genuinely unavailable and resuming would be a lie.
 * - *`reserved`*, because a `paid` or `minted` row of your own is a finished
 *   sale, not a hold to pick back up.
 * - *Same buyer*, because the pubkey is the only credential this codebase
 *   has; resuming on a mismatch would hand a stranger somebody else's order.
 * - *Exactly the same rectangle*, because a partial overlap — you hold
 *   (100,100,20,20) and ask for (110,110,20,20) — is a different purchase.
 *   Silently resizing or silently substituting the old hold would both be
 *   worse than refusing, so that case falls through to a 409 that carries
 *   `yourOrderIds` and lets the buyer decide to release it.
 */
function resumableHold(rows: BlockingRow[], rect: Rect, buyerPubkey: string): BlockingRow | null {
  if (rows.length !== 1) return null;
  const row = rows[0];
  if (row.status !== "reserved") return null;
  if (typeof row.buyer_pubkey !== "string" || row.buyer_pubkey === "") return null;
  if (row.buyer_pubkey !== buyerPubkey) return null;
  if (row.x !== rect.x || row.y !== rect.y || row.w !== rect.w || row.h !== rect.h) return null;
  if (row.expires_at === null) return null;
  return row;
}

/**
 * An existing row in the shape a fresh hold returns.
 *
 * Deliberately the same `Reservation` a new hold produces, with no "resumed"
 * marker on it: a resumed hold IS the hold, and a caller that has to branch on
 * how it came back would be handling two shapes where there is one thing.
 * `payment_fraction` comes from the row rather than the one this request
 * generated, because the fraction is what attributes an incoming transfer to
 * this order and it was fixed when the hold was created.
 */
function toReservation(row: BlockingRow, rect: Rect, pixels: number): Reservation {
  const total = Number(row.total_usdc);
  return {
    id: row.id,
    rect,
    pixels,
    pricePerPixelBaseUnits: Number(row.price_per_pixel_usdc),
    totalBaseUnits: total,
    paymentBaseUnits: total + (row.payment_fraction ?? 0),
    expiresAt: row.expires_at!.toISOString(),
  };
}

/** The blocking rows that are this caller's own, and only those. */
function ownOrderIds(rows: BlockingRow[], buyerPubkey: string): string[] {
  if (buyerPubkey === "") return [];
  return rows.filter((row) => row.buyer_pubkey === buyerPubkey).map((row) => row.id);
}

/**
 * When the rectangle blocking this request might come free.
 *
 * A rectangle stays blocked for as long as ANY overlapping row is live, so a
 * single `paid`/`minted` row among the blockers makes the whole thing
 * permanent regardless of any reservation also in the way — hence checking
 * for one first. Once every blocker is a reservation, the earliest of their
 * expiries is the first moment anything could change, which is the most
 * useful single instant to tell the caller.
 *
 * Reads only `status` and `expires_at` off the rows: never `buyer_pubkey`.
 * A 409 explains what happened, not who is holding it.
 */
function earliestAvailability(rows: BlockingRow[]): string | null {
  if (rows.length === 0 || rows.some((row) => row.status !== "reserved")) return null;

  const expiries = rows
    .map((row) => row.expires_at)
    .filter((expiresAt): expiresAt is Date => expiresAt !== null);
  if (expiries.length === 0) return null;

  return expiries.reduce((earliest, current) => (current < earliest ? current : earliest)).toISOString();
}
