import { query } from "../db";

/**
 * The register of settled purchases that runs along the bottom of the wall.
 *
 * WHO CALLS THIS: `/api/board`, which already makes one round trip for
 * everything the board needs and now carries this in it, and `src/app/page.tsx`
 * for the first paint. Neither could do it themselves: the row shape below is a
 * deliberate subtraction from `blocks`, and the subtraction is the point.
 *
 * ## What a row says, and what it must never say
 *
 * Size, position, amount, a truncated settlement signature, and when it
 * settled. Every one of those is a fact about a RECTANGLE. Nothing here
 * identifies a person: `buyer_pubkey` and `owner_wallet` are not selected, and
 * adding either to this query is the one change to this file that would need
 * an argument rather than a review.
 *
 * ## Why the signature is cut here and not in the browser
 *
 * A Solana signature is a lookup key. Publish it whole and one click on any
 * explorer returns the transaction, and the transaction names the wallet that
 * paid — so a feed carrying full signatures is a feed publishing its buyers'
 * addresses, however carefully the markup avoids printing them. Cutting it in
 * the component would be theatre: the whole string would still be in the JSON
 * the page fetched.
 *
 * Eight characters of eighty-eight is not enough to search with, and it is
 * enough for the buyer who has the other eighty to recognise their own. That
 * is the trade this makes: the row proves to YOU that YOUR purchase settled,
 * and proves to everybody else only that something did.
 *
 * ponytail: no explorer link, and that is a decision rather than an omission —
 * a link needs the whole signature, which is the thing being withheld. If the
 * owner ever decides a discoverable payer is acceptable (and it partly already
 * is: anybody watching the treasury sees every incoming transfer and its
 * sender), the upgrade is to select the column whole and link it, and nothing
 * else in this file changes. `DECISIONS.md` carries that door.
 */

/** Kept short deliberately — see the module comment. First four, last four. */
export const SIGNATURE_KEPT = 4;

export type TapeRow = {
  /** Already public: `/api/board` ships an id per live rectangle. */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pixels: number;
  totalBaseUnits: number;
  /**
   * `5Kq2…7Rp1`, or null for a sale settled before the money path existed.
   * Null renders as its own words rather than as an empty cell — a blank where
   * a proof goes reads as a proof that failed to load.
   */
  signature: string | null;
  /** ISO 8601. The browser turns it into "4m" against the `now` shipped beside it. */
  paidAt: string;
};

/**
 * Enough rows to fill a scrolling rail twice over at the widest window this
 * design targets, and few enough that the payload stays a rounding error next
 * to the rectangle list it travels with.
 */
export const TAPE_ROWS = 20;

export async function recentPurchases(limit: number = TAPE_ROWS): Promise<TapeRow[]> {
  const rows = await query<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    total_usdc: string;
    signature: string | null;
    paid_at: Date;
  }>(
    `SELECT id, x, y, w, h, total_usdc,
            CASE
              WHEN payment_signature IS NULL THEN NULL
              WHEN length(payment_signature) <= $2 * 2 THEN payment_signature
              ELSE left(payment_signature, $2) || '…' || right(payment_signature, $2)
            END AS signature,
            paid_at
       FROM blocks
      -- A taken-down rectangle stays on the tape, and that is deliberate. A
      -- takedown removes CONTENT; the sale stands, the rectangle is still its
      -- owner's, and this rail is a register of settlements rather than a
      -- gallery. Dropping the row would make the register disagree with the
      -- money. Nothing content-shaped is selected here anyway, so a hidden
      -- block's row is identical to any other's.
      WHERE status IN ('paid', 'minted')
        AND paid_at IS NOT NULL
      ORDER BY paid_at DESC
      LIMIT $1`,
    [limit, SIGNATURE_KEPT],
  );

  return rows.map((row) => ({
    id: row.id,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    pixels: row.w * row.h,
    // bigint comes back as a string from `pg`, which is right for a column that
    // could exceed 2^53 and wrong for arithmetic done by accident.
    totalBaseUnits: Number(row.total_usdc),
    signature: row.signature,
    paidAt: row.paid_at.toISOString(),
  }));
}
