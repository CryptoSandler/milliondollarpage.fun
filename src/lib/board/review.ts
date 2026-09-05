import { execute, query, queryOne } from "../db";

/**
 * The queue between paying for a rectangle and its picture appearing on it.
 *
 * WHO CALLS THIS. `src/app/api/admin/blocks/[id]/route.ts` calls `approve` as
 * a fourth action beside `hide`, `unhide` and `purge`; `src/app/admin/page.tsx`
 * calls `awaitingReview` to draw the queue. Neither could hold it: the route is
 * a body-parser with a guard on it, and the page is server-rendered markup —
 * and the one thing this module has to get right is which half of a purchase is
 * waiting.
 *
 * ## THE SALE IS NOT PENDING. THE PUBLICATION IS.
 *
 * `DECISIONS.md`, "nothing is painted until a person has looked at it": the
 * money settled, the rectangle is the buyer's for ever, the exclusion
 * constraint holds it, the register carries the settlement and `/stats` counts
 * its pixels. What waits is the artwork appearing. That is why this is a column
 * folded into `publishesTextSql` and not a fourth status — a status would have
 * collided with the overlap constraint, with `blocks_stay_sold`, with
 * `blocks_paid_at_matches_status` and with every reader that asks
 * `status IN ('paid','minted')`.
 *
 * ## Refusing is not a state of its own
 *
 * There is `approve` here and there is no `reject`, and that is deliberate. A
 * refusal is a takedown — `hide`, with its reason, in `takedown.ts` — because a
 * refused purchase and a purchase taken down a week later are the same thing
 * from every reader's point of view: a sale that stands, whose picture is not
 * on the wall. A third state would have been a second way to express one fact.
 * `approval_note` records what the operator said either way.
 *
 * ## Silence is the failure mode
 *
 * A review queue costs attention per sale, where a takedown costs nothing until
 * it is used. That is the real price of this and it is only worth paying if the
 * queue is looked at — which is why `awaitingReview` is oldest-first and why
 * `/b/<id>` tells the buyer their purchase is in it rather than showing them a
 * blank rectangle and no reason.
 */

export type PendingPurchase = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pixels: number;
  /** ISO 8601 — when the money settled, which is when the wait started. */
  paidAt: string;
  caption: string | null;
  link: string | null;
};

/**
 * What is waiting, oldest first.
 *
 * NO OWNER COLUMN, the same rule the rest of this codebase keeps: an operator
 * decides whether a PICTURE goes on a wall, and knowing whose it is cannot
 * improve that decision while it can certainly bias it.
 */
export async function awaitingReview(): Promise<PendingPurchase[]> {
  const rows = await query<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    paid_at: Date;
    caption: string | null;
    link: string | null;
  }>(
    `SELECT id, x, y, w, h, paid_at, caption, link
       FROM blocks
      WHERE approved_at IS NULL
        AND status IN ('paid', 'minted')
        AND hidden_at IS NULL
      ORDER BY paid_at ASC`,
  );

  return rows.map((row) => ({
    id: row.id,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    pixels: row.w * row.h,
    paidAt: row.paid_at.toISOString(),
    caption: row.caption,
    link: row.link,
  }));
}

/** How many are waiting, for a page that only needs the number. */
export async function awaitingReviewCount(): Promise<number> {
  const row = await queryOne<{ waiting: string }>(
    `SELECT count(*) AS waiting
       FROM blocks
      WHERE approved_at IS NULL AND status IN ('paid', 'minted') AND hidden_at IS NULL`,
  );
  return Number(row?.waiting ?? 0);
}

/**
 * Lets one purchase onto the wall.
 *
 * IDEMPOTENT BY THE `IS NULL`, not by a read-then-write. Two operators pressing
 * approve at the same moment is one row changed and one `null` returned, and
 * the second one gets the honest answer — nothing happened, because nothing
 * needed to. A read-then-write would have made it two writes and a race over
 * which timestamp survived.
 */
export async function approve(id: string, note: string): Promise<PendingPurchase | null> {
  const row = await queryOne<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    paid_at: Date;
    caption: string | null;
    link: string | null;
  }>(
    `UPDATE blocks
        SET approved_at = now(), approval_note = $2
      WHERE id = $1
        AND approved_at IS NULL
        AND status IN ('paid', 'minted')
      RETURNING id, x, y, w, h, paid_at, caption, link`,
    [id, note || null],
  );
  if (!row) return null;

  return {
    id: row.id,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    pixels: row.w * row.h,
    paidAt: row.paid_at.toISOString(),
    caption: row.caption,
    link: row.link,
  };
}

/**
 * Records why a purchase was refused, for a row a takedown is about to hide.
 *
 * Separate from `hide` rather than folded into it, because a takedown reason is
 * public-facing operator vocabulary — `takedown_reason` — and this is the
 * review's own note. They can differ, and the one place they must not be
 * confused is the row that carries both.
 */
export async function noteRefusal(id: string, note: string): Promise<void> {
  await execute("UPDATE blocks SET approval_note = $2 WHERE id = $1", [id, note]);
}
