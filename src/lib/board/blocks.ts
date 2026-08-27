import type { PoolClient } from "pg";
import { execute, query, queryOne } from "../db";
import { IMAGE_BEARING_STATUSES, hasPublicImageSql, publishesTextSql } from "./block-image";
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
 *
 * WHAT MOVED OUT OF HERE. `listLiveBlocks` used to return a row per block with
 * its caption, its link, its fit and a flag saying it had a bitmap to fetch.
 * That shape was designed for ten thousand 10×10 blocks; the unit is a pixel
 * now. The artwork went to `./composite.ts`, which serves the whole wall as
 * one versioned bitmap, and the words went to `getBlockDetails` below, which
 * answers one rectangle at a time when somebody actually rests on it. What is
 * left here is the hit-testing list, and it carries no content at all.
 */

export type LiveStatus = "reserved" | "paid" | "minted";

/**
 * One rectangle on the wall, with no content in it at all.
 *
 * This is the whole of what the board ships per purchase now: an id and four
 * numbers, plus which of the three live states it is in. The artwork arrives
 * as ONE composite bitmap (see `./composite.ts`), so nothing here has to carry
 * a caption, a link, a fit or a flag saying an image exists — and at pixel
 * granularity that matters, because there can be tens of thousands of these.
 *
 * `status` is here rather than being folded into the bitmap because a HOLD is
 * not in the bitmap: it is volatile, it expires within half an hour, and the
 * canvas draws it from this list. Sold rectangles are in the bitmap and still
 * appear here, because the selector has to refuse them and the pointer has to
 * hit-test them.
 *
 * ponytail: about seventy bytes each as JSON, not the twenty a packed
 * encoding would give — the uuid is most of it. Ten thousand purchases is
 * around 700 KB, which is a payload this poll can carry; if the wall ever
 * fills to the point where it cannot, the upgrade is a binary or tuple
 * encoding on this one field, and nothing else has to change to take it.
 */
export type BoardRect = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  status: LiveStatus;
};

/**
 * What a pointer or a keyboard cursor resting on a rectangle asks for.
 *
 * Fetched one at a time, on demand, by `src/lib/board/block-details.ts`.
 * Caption and link used to ride along in the board payload for every block at
 * once — which was affordable when a block was 10×10 and is not when it is one
 * pixel. Nobody reads ten thousand captions; they read the one under the
 * pointer.
 */
export type BlockDetails = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  status: LiveStatus;
  /**
   * The buyer's caption and link — or null.
   *
   * Null for a hold, which publishes neither: a reservation is thirty free
   * minutes, and without this it was thirty free minutes of serving a
   * stranger's link to every visitor. Null for a block that has been taken
   * down, for the reason a takedown exists. The owner of a hold still gets
   * their own text back from `GET /api/orders/{id}`.
   */
  caption: string | null;
  link: string | null;
  /**
   * Which way the buyer's picture fills the rectangle — and the one field here
   * that is not words.
   *
   * It is here because of the zoom-detail draw (see `./detail.ts`): above the
   * ruling's zoom the canvas draws a rectangle's own stored bitmap over the
   * composite, and it cannot place that bitmap without knowing whether its
   * buyer chose to fill the rectangle or to fit inside it. The alternative was
   * a fifth field on every entry of the board payload, for a fact needed only
   * about the handful of rectangles somebody has zoomed into.
   *
   * Null for exactly the rows the caption and the link are null for — a hold,
   * and a block that has been taken down — because it is a fact about content
   * that is not being published, and `publishesTextSql` is one predicate
   * rather than three.
   */
  fit: "contain" | "cover" | null;
};

// Exported so reserve.ts can ask, after a 409, which rows are live over a
// given rectangle — the same "currently blocking" predicate, not a second
// copy of it that could drift from this one.
export const LIVE = `status IN ('reserved', 'paid', 'minted')
              AND (status <> 'reserved' OR (expires_at IS NOT NULL AND expires_at > now()))`;

/**
 * Every rectangle the board must hit-test, and nothing else.
 *
 * The column list is a whitelist and stays one, and it is now short enough
 * that the rule is easy to keep: `buyer_pubkey` must never join it (this
 * payload is public and unauthenticated, and that column is the single
 * credential `/content`, `/confirm` and the release endpoint trust);
 * `pending_image` must never join it either.
 *
 * A TAKEN-DOWN BLOCK IS STILL HERE. Its content is gone from the composite and
 * from every endpoint, but its rectangle is still sold and still its owner's,
 * so the selector must keep refusing it. That is the whole difference between
 * a visibility flag and the status it replaced.
 */
export async function listBoardRects(): Promise<BoardRect[]> {
  return query<BoardRect>(
    `SELECT id, x, y, w, h, status
       FROM blocks
      WHERE ${LIVE}
      ORDER BY created_at`,
  );
}

/**
 * One rectangle's caption and link, for the pointer or the cursor resting on
 * it.
 *
 * Null covers every reason at once — no such block, an id that names nothing
 * live, an expired hold — because the route answers all of them with the same
 * 404 and must not let a caller tell them apart.
 *
 * `publishesTextSql` is the same predicate the composite and the image route
 * use, so a hold's words and a taken-down block's words come back null here
 * for exactly the reasons they are absent there. The rectangle itself still
 * comes back, because a hover card over a hold still has something true to
 * say.
 *
 * `fit` rides along under the same predicate. It is not words, and it is here
 * for the zoom-detail draw rather than for the hover card — see the field's
 * own note on `BlockDetails` above, and `./detail.ts` for what reads it.
 */
export async function getBlockDetails(id: string): Promise<BlockDetails | null> {
  return queryOne<BlockDetails>(
    `SELECT id, x, y, w, h, status,
            CASE WHEN ${publishesTextSql(2)} THEN caption END AS caption,
            CASE WHEN ${publishesTextSql(2)} THEN link END AS link,
            CASE WHEN ${publishesTextSql(2)} THEN image_fit END AS fit
       FROM blocks
      WHERE id = $1 AND ${LIVE}`,
    [id, [...IMAGE_BEARING_STATUSES]],
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
