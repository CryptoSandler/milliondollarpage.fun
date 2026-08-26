import { randomInt } from "node:crypto";
import { query, transaction } from "../db";
import { LIVE, sweepExpiredReservations } from "./blocks";
import { type Rect, rectIsValid, rectPixels } from "./geometry";
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
 */

export const RESERVATION_MINUTES = 30;

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

  constructor(availableAt: string | null = null) {
    super("Those pixels are no longer available.");
    this.name = "RectangleTaken";
    this.availableAt = availableAt;
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
          String(RESERVATION_MINUTES),
        ],
      );

      const row = inserted.rows[0];
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
    // 23P01 is the exclusion constraint: somebody else holds those pixels.
    // The transaction above has already rolled back and released its
    // connection by the time we get here, so this is a fresh, best-effort
    // read on the pool — good enough to explain a 409, not a second
    // correctness check standing in for the constraint.
    if ((error as { code?: string } | null)?.code === "23P01") {
      throw new RectangleTaken(await earliestAvailability(rect));
    }
    throw error;
  }
}

/**
 * When the rectangle blocking this request might come free.
 *
 * Queries the same LIVE rows the exclusion constraint and the board selector
 * already agree on (see `blocks.ts`), restricted to rows overlapping the
 * requested rectangle via the same generated int4range columns the
 * constraint uses.
 *
 * A rectangle stays blocked for as long as ANY overlapping row is live, so a
 * single `paid`/`minted` row among the blockers makes the whole thing
 * permanent regardless of any reservation also in the way — hence checking
 * for one first. Once every blocker is a reservation, the earliest of their
 * expiries is the first moment anything could change, which is the most
 * useful single instant to tell the caller.
 *
 * Deliberately returns only `status` and `expires_at`: never `buyer_pubkey`
 * or `ip_hash`. A 409 explains what happened, not who is holding it.
 */
async function earliestAvailability(rect: Rect): Promise<string | null> {
  const rows = await query<{ status: string; expires_at: Date | null }>(
    `SELECT status, expires_at
       FROM blocks
      WHERE ${LIVE}
        AND x_range && int4range($1, $2)
        AND y_range && int4range($3, $4)`,
    [rect.x, rect.x + rect.w, rect.y, rect.y + rect.h],
  );

  if (rows.length === 0 || rows.some((row) => row.status !== "reserved")) return null;

  const expiries = rows
    .map((row) => row.expires_at)
    .filter((expiresAt): expiresAt is Date => expiresAt !== null);
  if (expiries.length === 0) return null;

  return expiries.reduce((earliest, current) => (current < earliest ? current : earliest)).toISOString();
}
