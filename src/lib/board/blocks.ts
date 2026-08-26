import type { PoolClient } from "pg";
import { execute, query, queryOne } from "../db";
import { IMAGE_BEARING_STATUSES, hasPublicImageSql } from "./block-image";
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
  /**
   * Whether `/api/blocks/{id}/image` will answer with a bitmap.
   *
   * A boolean, never the bytes: a full board is a thousand images, and
   * inlining even small ones would turn a payload the page refetches twice a
   * minute into tens of megabytes. The canvas fetches each bitmap once, on
   * its own URL, and the browser caches it from there.
   *
   * False is not "no image" so much as "nothing you may see yet" — it is
   * false for a reservation whose buyer has already uploaded, because a hold
   * publishes no pixels. See block-image.ts for why.
   */
  hasImage: boolean;
};

// Exported so reserve.ts can ask, after a 409, which rows are live over a
// given rectangle — the same "currently blocking" predicate, not a second
// copy of it that could drift from this one.
export const LIVE = `status IN ('reserved', 'paid', 'minted')
              AND (status <> 'reserved' OR (expires_at IS NOT NULL AND expires_at > now()))`;

/**
 * Every rectangle the board must draw.
 *
 * The column list is a whitelist and stays one. `buyer_pubkey` in particular
 * must never join it: this payload is public and unauthenticated, and that
 * column is the single credential `/content`, `/confirm` and the release
 * endpoint trust. Adding it would hand every visitor the keys to every open
 * hold. `pending_image` must never join it either — the bytes go out one
 * block at a time, on their own route.
 */
export async function listLiveBlocks(): Promise<LiveBlock[]> {
  return query<LiveBlock>(
    `SELECT id, x, y, w, h, status, caption, link,
            ${hasPublicImageSql(1)} AS "hasImage"
       FROM blocks
      WHERE ${LIVE}
      ORDER BY created_at`,
    [[...IMAGE_BEARING_STATUSES]],
  );
}

export type BlockImage = { bytes: Buffer; mime: string };

type ImageRow = { pending_image: Buffer; pending_image_mime: string };

/**
 * The bytes of a sold block's image, or null if it has none to give.
 *
 * Lives here rather than in block-image.ts because it needs the pool, and
 * that file is imported by the browser — see its header.
 *
 * Null covers every reason at once — no such block, a block still merely
 * held, a sale whose buyer never uploaded anything — because the route
 * answers all of them with the same 404 and must not let a caller tell them
 * apart.
 *
 * Reads `pending_image` rather than Arweave: the upload is validated and
 * stored there at purchase time, and the Arweave mirror arrives in a later
 * batch. When it does, this is the one function that has to learn about it.
 *
 * A row with bytes but no mime is treated as having nothing: the correct
 * `content-type` is not optional for user-supplied bytes, and guessing one
 * (or letting a browser sniff) is how an upload gets to be treated as
 * something it is not. `attachContent` always writes both columns together,
 * so this guards a shape that should never exist rather than a real case.
 */
export async function getBlockImage(id: string): Promise<BlockImage | null> {
  const row = await queryOne<ImageRow>(
    `SELECT pending_image, pending_image_mime
       FROM blocks
      WHERE id = $1 AND ${hasPublicImageSql(2)}`,
    [id, [...IMAGE_BEARING_STATUSES]],
  );
  if (!row) return null;
  return { bytes: row.pending_image, mime: row.pending_image_mime };
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
