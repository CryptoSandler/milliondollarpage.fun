import type { PoolClient } from "pg";
import { execute, query } from "../db";
import { TOTAL_PIXELS } from "./geometry";

/**
 * Reading the board.
 *
 * "Live" means a rectangle somebody currently holds: reserved, paid, or
 * minted. Those are exactly the three states the overlap constraint covers,
 * and the selector must refuse the same rectangles the database would, or a
 * buyer gets to the end of a purchase before finding out.
 *
 * An expired reservation is not live even though it is still a row. Expiry is
 * a clock comparison rather than a status, so it is applied in every read
 * rather than depending on the sweep having run recently.
 */

export type LiveStatus = "reserved" | "paid" | "minted";

export type LiveBlock = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  status: LiveStatus;
  caption: string | null;
  link: string | null;
};

// Exported so reserve.ts can ask, after a 409, which rows are live over a
// given rectangle — the same "currently blocking" predicate, not a second
// copy of it that could drift from this one.
export const LIVE = `status IN ('reserved', 'paid', 'minted')
              AND (status <> 'reserved' OR (expires_at IS NOT NULL AND expires_at > now()))`;

export async function listLiveBlocks(): Promise<LiveBlock[]> {
  return query<LiveBlock>(
    `SELECT id, x, y, w, h, status, caption, link
       FROM blocks
      WHERE ${LIVE}
      ORDER BY created_at`,
  );
}

export type BoardStats = { pixelsSold: number; blocksSold: number; percentSold: number };

/**
 * Sold means paid or minted. A reservation is not a sale — counting one would
 * make the headline number tick up and back down as reservations expire.
 */
export async function boardStats(): Promise<BoardStats> {
  const rows = await query<{ pixels: string; blocks: string }>(
    `SELECT COALESCE(SUM(w * h), 0)::text AS pixels, COUNT(*)::text AS blocks
       FROM blocks
      WHERE status IN ('paid', 'minted')`,
  );
  const pixelsSold = Number(rows[0]?.pixels ?? 0);
  return {
    pixelsSold,
    blocksSold: Number(rows[0]?.blocks ?? 0),
    percentSold: (pixelsSold / TOTAL_PIXELS) * 100,
  };
}

/**
 * Deletes reservations whose window has closed.
 *
 * Correctness does not depend on this running: every read already filters
 * expired reservations out, and the reservation path will call this inside its
 * own transaction before inserting. This exists so the table does not grow a
 * tail of dead rows.
 *
 * Takes an optional client so the reservation path can run this on its own
 * transaction's connection rather than the pool: the sweep and the exclusion
 * constraint must see the same snapshot, and a version issued through the
 * pooled `execute` would not be rolled back with a failed insert.
 */
export async function sweepExpiredReservations(client?: PoolClient): Promise<number> {
  const sql = `DELETE FROM blocks
                WHERE status = 'reserved' AND (expires_at IS NULL OR expires_at <= now())`;
  if (client) return (await client.query(sql)).rowCount ?? 0;
  return execute(sql);
}
