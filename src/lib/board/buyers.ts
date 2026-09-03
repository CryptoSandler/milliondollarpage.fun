import { query, queryOne } from "../db";
import { IMAGE_BEARING_STATUSES, hasPublicImageSql, publishesTextSql } from "./block-image";

/**
 * Every rectangle that has been paid for, in the order it was bought.
 *
 * WHO CALLS THIS: `src/app/buyers/page.tsx`, and nothing else. It is not part
 * of the board payload and must not become part of it — the board ships an id
 * and four numbers per rectangle precisely so it can carry tens of thousands of
 * them, and this query carries words and a page of fifty.
 *
 * ## What it selects, and the one column it must never grow
 *
 * Position, size, caption, link, the settlement instant, and whether there is a
 * bitmap. `buyer_pubkey`, `owner_wallet` and `payment_signature` are not
 * selected and adding any of them here is the change to this file that needs an
 * argument rather than a review — the same rule `tape.ts` states for the
 * register, and for the same reason. A page called "who has bought" is exactly
 * the page where a wallet address would look like it belonged.
 *
 * THE PAGE IS ABOUT RECTANGLES, NOT PEOPLE. There is nothing here that
 * identifies anybody; what a reader gets is the wall's history in the order it
 * happened. `src/app/__tests__/buyers.test.tsx` renders it over a seeded row
 * whose wallet is a recognisable string and asserts the string is nowhere in
 * the markup.
 *
 * ## Ascending, and that is what makes the numbering stable
 *
 * "In the order it was bought" is oldest first, so purchase #1 is the first
 * pixel ever sold and stays #1 forever. Newest-first would renumber every row
 * on every sale and turn a permanent link to page 3 into a link to a different
 * page every day.
 *
 * ## A takedown keeps its row and loses its words
 *
 * `publishesTextSql` nulls the caption and the link for a hidden block, exactly
 * as it does for the hover card and for `/b/<id>`. The sale still happened, the
 * rectangle is still its owner's, and the register still counts it — what a
 * takedown removes is content. A row that vanished would make this list
 * disagree with the money, which is the same argument `tape.ts` makes.
 */

/** One row of the list. Nothing here identifies a person; see the module comment. */
export type SoldBlock = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pixels: number;
  caption: string | null;
  link: string | null;
  /** Whether there is a bitmap to show; false for a hold's leftovers and a takedown. */
  hasImage: boolean;
  /** ISO 8601. */
  paidAt: string;
};

/**
 * Fifty, which is about a screen and a half of scrolling and one round trip.
 *
 * ponytail: `LIMIT`/`OFFSET`, not a keyset cursor. At fifty a page an offset
 * scan stays cheap until the list is in the tens of thousands of rows, and
 * `paid_at` is already indexed; the upgrade, if the wall ever fills that far,
 * is to page on `(paid_at, id)` and nothing above this function changes.
 */
export const BUYERS_PER_PAGE = 50;

export type SoldPage = {
  rows: SoldBlock[];
  /** How many sold rectangles there are in total, for the pager and the count. */
  total: number;
  /** 1-based, already clamped to what exists. */
  page: number;
  pages: number;
};

export async function soldBlocks(page: number): Promise<SoldPage> {
  const counted = await queryOne<{ total: string }>(
    `SELECT count(*) AS total FROM blocks
      WHERE status IN ('paid', 'minted') AND paid_at IS NOT NULL`,
  );
  const total = Number(counted?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / BUYERS_PER_PAGE));
  // Clamped rather than 404ed: `?page=99` on a list that shrank is a stale
  // link, not a mistake, and the last page is the useful answer to it.
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);

  const rows = await query<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    caption: string | null;
    link: string | null;
    has_image: boolean;
    paid_at: Date;
  }>(
    // No alias on `blocks`: `publishesTextSql` and `hasPublicImageSql` are
    // written against bare column names and are shared with five other queries.
    `SELECT id, x, y, w, h, paid_at,
            CASE WHEN ${publishesTextSql(1)} THEN caption END AS caption,
            CASE WHEN ${publishesTextSql(1)} THEN link END AS link,
            ${hasPublicImageSql(1)} AS has_image
       FROM blocks
      WHERE status IN ('paid', 'minted')
        AND paid_at IS NOT NULL
      ORDER BY paid_at ASC, id ASC
      LIMIT $2 OFFSET $3`,
    [[...IMAGE_BEARING_STATUSES], BUYERS_PER_PAGE, (current - 1) * BUYERS_PER_PAGE],
  );

  return {
    rows: rows.map((row) => ({
      id: row.id,
      x: row.x,
      y: row.y,
      w: row.w,
      h: row.h,
      pixels: row.w * row.h,
      caption: row.caption,
      link: row.link,
      hasImage: row.has_image,
      paidAt: row.paid_at.toISOString(),
    })),
    total,
    page: current,
    pages,
  };
}
