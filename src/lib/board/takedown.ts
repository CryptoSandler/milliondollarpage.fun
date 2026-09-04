import { query, queryOne, transaction } from "../db";
import { IMAGE_BEARING_STATUSES } from "./block-image";

/**
 * The two takedown levels, as functions a route can call.
 *
 * WHO CALLS THIS: `src/app/api/admin/blocks/[id]/route.ts`, which turns an
 * operator's hide / unhide / purge into one of these, and
 * `src/app/api/admin/takedowns/route.ts`, which lists what is currently
 * hidden. Both sit behind `requireAdmin` (`src/lib/admin-guard.ts`); nothing
 * else in the repository reaches in here, and nothing in the browser can —
 * this file imports the pool.
 *
 * THE BINDING AUTHORITY IS `SECURITY.md` § Takedown, and this module adds
 * nothing to it. That section says a normal takedown "is a visibility flag":
 *
 *   UPDATE blocks SET hidden_at = now(), takedown_reason = '...' WHERE id = '...';
 *   UPDATE blocks SET hidden_at = NULL, takedown_reason = NULL WHERE id = '...';
 *
 * and that a legal purge is `block_purge_content(id, reason)`. Those three
 * statements are what `hide`, `unhide` and `purge` run. The same section says
 * the console "adds no third level and no new semantics — a route that could
 * hide something this section does not describe would be a route contradicting
 * its own specification", so there is deliberately no fourth function here.
 *
 * WHAT NONE OF THEM TOUCH: `status`, `buyer_pubkey`, `x`, `y`, `w`, `h`. "In
 * neither case does ownership of the rectangle transfer or lapse", and
 * `blocks_owner_is_final` (migration 006) refuses the write even if this file
 * were edited to try. The statements below simply never mention those columns.
 *
 * EVERY FUNCTION RETURNS THE ROW IT ACTUALLY CHANGED, or null. A caller that
 * was handed `void` would have to report success on a hide of an id that names
 * nothing, of a hold — which `blocks_takedown_only_when_sold` refuses to flag —
 * or of a row whose bytes are already gone. `RETURNING` is what makes those
 * cases distinguishable, and it costs nothing over the UPDATE that was already
 * being sent.
 */

/**
 * A block's moderation state, and only that.
 *
 * The rectangle is here because an operator deciding about a takedown needs to
 * know which pixels they are looking at. `status` and `buyer_pubkey` are NOT,
 * because no function in this file can change either, so publishing them would
 * invite a caller to render a fact this module has no part in.
 *
 * `hiddenAt` is nullable on one type rather than split across two: `unhide`
 * returns the row it just cleared, so its answer is a block with no
 * `hiddenAt` at all, and a second type whose only difference is that one field
 * would be a type per statement rather than per thing.
 */
export type TakedownState = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** When it was taken down. Null on the row `unhide` just brought back. */
  hiddenAt: Date | null;
  /** Why, in the operator's words. Null once it is unhidden. */
  takedownReason: string | null;
  /** Set once the bytes have been destroyed. Never cleared, by anything. */
  purgedAt: Date | null;
};

type TakedownRow = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden_at: Date | null;
  takedown_reason: string | null;
  purged_at: Date | null;
};

/** A whitelist, and it stays one: `pending_image` must never join it. */
const COLUMNS = "id, x, y, w, h, hidden_at, takedown_reason, purged_at";

function toState(row: TakedownRow): TakedownState {
  return {
    id: row.id,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    hiddenAt: row.hidden_at,
    takedownReason: row.takedown_reason,
    purgedAt: row.purged_at,
  };
}

/** The sold statuses, from the one place that defines them. */
const SOLD = [...IMAGE_BEARING_STATUSES];

/**
 * Takes a sold block's content out of publication. Reversible.
 *
 * Null means nothing was hidden, and it covers three cases at once: no such
 * block, a block that is only held — `blocks_takedown_only_when_sold` refuses
 * the flag on one, so the guard is here rather than left to a constraint
 * violation surfacing as a 500 — and a block whose content has already been
 * purged.
 *
 * ponytail: the caller is told "nothing happened" rather than which of the
 * three it was. If an operator ever needs the difference, the upgrade is one
 * extra SELECT on the null path, not a different shape here.
 *
 * A PURGED ROW IS REFUSED rather than re-flagged. It is already hidden, so the
 * only thing a second hide could change is `takedown_reason` — overwriting the
 * reason a legal destruction was recorded under, with no bytes left to take
 * down. Nothing is gained and a record is lost.
 *
 * `COALESCE(hidden_at, now())` where SECURITY.md writes `now()`: re-hiding an
 * already-hidden block amends the reason without moving the timestamp, because
 * when it came down is the fact and the second statement is an edit to the
 * note beside it. Every other effect is identical to the statement as written.
 */
export async function hide(id: string, reason: string): Promise<TakedownState | null> {
  const row = await queryOne<TakedownRow>(
    `UPDATE blocks
        SET hidden_at = COALESCE(hidden_at, now()),
            takedown_reason = $2
      WHERE id = $1 AND status = ANY($3) AND purged_at IS NULL
      RETURNING ${COLUMNS}`,
    [id, reason, SOLD],
  );
  return row ? toState(row) : null;
}

/**
 * Puts a hidden block back. The bytes were never touched, so what comes back
 * is the same picture byte for byte — that is the whole of "reversible".
 *
 * A PURGED ROW IS REFUSED, and this is the guard that makes "not reversible
 * and not meant to be" true rather than aspirational. `blocks_purge_implies_
 * hidden` would reject the write anyway, so without `purged_at IS NULL` here
 * an operator's unhide would be a 500 instead of an answer — and a purged row
 * has nothing to bring back regardless.
 *
 * No status clause: only a sold row can carry `hidden_at` at all
 * (`blocks_takedown_only_when_sold`), so `hidden_at IS NOT NULL` already says
 * "a sale". Null therefore means the block does not exist, is not hidden, or
 * has been purged.
 */
export async function unhide(id: string): Promise<TakedownState | null> {
  const row = await queryOne<TakedownRow>(
    `UPDATE blocks
        SET hidden_at = NULL, takedown_reason = NULL
      WHERE id = $1 AND hidden_at IS NOT NULL AND purged_at IS NULL
      RETURNING ${COLUMNS}`,
    [id],
  );
  return row ? toState(row) : null;
}

/**
 * Destroys the content. Not reversible.
 *
 * Calls `block_purge_content` and deliberately does NOT re-implement what it
 * clears. That function and `blocks_purged_keeps_nothing` are, between them,
 * the definition of what a purge erases — the CHECK exists "so a purge that
 * missed a column is a statement the database refuses rather than a residue
 * nobody notices" — and a column list in TypeScript would be a second
 * definition, which is a definition that can drift. A column added to the
 * CHECK later is cleared by this function on the day it is added, with no
 * change here.
 *
 * One transaction and three statements, because the SQL function returns void
 * and its own `WHERE ... AND status IN ('paid','minted')` therefore cannot
 * tell this caller whether it touched anything:
 *
 *  1. lock the row, and only if it is a sale that has not already been purged;
 *  2. run the function;
 *  3. read back what it left.
 *
 * ponytail: the `FOR UPDATE` is what makes two operators purging at once
 * produce one purge and one honest "nothing happened" rather than two claimed
 * successes and one overwritten `purged_at`. The lazier version — no
 * transaction, purge then read — is a round trip cheaper and reports a purge
 * that was somebody else's. For the one statement in this project that
 * destroys a buyer's bytes, that is not the trade to take.
 */
/*
 * WHERE A CHANGE REQUEST WILL LIVE, IF ONE EVER ARRIVES.
 *
 * `/faq` says a sold rectangle is not editable from this site, and it is true
 * of the code as well as the copy: `attachContent` refuses anything but a
 * `reserved` row, and migrations 005, 006 and 011 freeze the owner, the sale
 * and the row against deletion. There is no path from the site to a paid
 * block's picture.
 *
 * The owner considered a claims table — a signed request from `/b/<id>`, an
 * admin queue, an audit log — and the round on 2026-09-04 recommended against
 * building it yet: it would be the FIRST mutation path that has ever existed
 * here, built for a claim nobody has made, and it would make the promise weaker
 * while the copy got stronger. What shipped instead is the exact preview, which
 * is the thing that prevents most claims from existing at all, and an address.
 *
 * WHEN ONE DOES ARRIVE, IT BELONGS IN THIS FILE. This module already holds the
 * only sanctioned way published content changes after payment — `hide`,
 * `unhide` and `purge`, each token-gated and each recorded on the row — so an
 * applied change request is a fourth operator statement beside them rather than
 * a second system next to them. `DECISIONS.md` carries the reasoning.
 */

export async function purge(id: string, reason: string): Promise<TakedownState | null> {
  return transaction(async (client) => {
    const target = await client.query<{ id: string; image_sha256: string | null }>(
      `SELECT id, image_sha256 FROM blocks
        WHERE id = $1 AND status = ANY($2) AND purged_at IS NULL
        FOR UPDATE`,
      [id, SOLD],
    );
    if (target.rowCount === 0) return null;

    /*
      THE HASH IS TAKEN BEFORE THE BYTES GO, because after `block_purge_content`
      there is nothing left to hash. This is what makes a purge a RULE rather
      than an event: the same file cannot be bought onto another rectangle five
      minutes later, which it could until 2026-09-04.

      IN THE SAME TRANSACTION as the purge, so there is no window in which the
      picture is gone from the wall and still acceptable at the door. A row with
      no hash — one purged before `image_sha256` was written, or one that never
      had bytes — blocks nothing, which is the honest outcome rather than an
      error: there is no file to refuse.
    */
    const sha = target.rows[0].image_sha256;
    if (sha) {
      await client.query(
        `INSERT INTO blocked_images (sha256, reason, source)
         VALUES ($1, $2, 'purge')
         ON CONFLICT (sha256) DO NOTHING`,
        [sha, reason],
      );
    }

    await client.query(`SELECT block_purge_content($1, $2)`, [id, reason]);

    const after = await client.query<TakedownRow>(
      `SELECT ${COLUMNS} FROM blocks WHERE id = $1`,
      [id],
    );
    return after.rows[0] ? toState(after.rows[0]) : null;
  });
}

/**
 * Everything currently taken down, newest first.
 *
 * WHAT IT DELIBERATELY DOES NOT RETURN: the caption and the link.
 *
 * The question was asked, so here is the answer and the reasoning, because the
 * other choice is defensible. An operator deciding whether to unhide would
 * plainly find the words useful — they are often the reason the block came
 * down at all. Against that: the caption and the link ARE the material. A
 * takedown list that carries them is a page that renders a stranger's phishing
 * URL, live, next to the button that brings it back, for the one person in the
 * project whose session is worth the most to steal; and half the rows in this
 * list are purged ones, where those columns are NULL by constraint, so it is a
 * field the operator could not rely on even when it helped. An operator who
 * genuinely has to look at the material is looking at a report, or at psql.
 *
 * ponytail: if that turns out to be the wrong call in practice, the upgrade is
 * a per-block admin detail route behind the same `requireAdmin` — one row, one
 * decision, fetched on purpose — rather than putting the content back into the
 * list everything renders.
 *
 * `purgedAt` is what tells the two levels apart, and it is why the row is
 * still listed after a purge: what was destroyed, and when, is exactly what an
 * operator is asked about afterwards.
 */
export async function listHidden(): Promise<TakedownState[]> {
  const rows = await query<TakedownRow>(
    `SELECT ${COLUMNS}
       FROM blocks
      WHERE hidden_at IS NOT NULL
      ORDER BY hidden_at DESC, id`,
  );
  return rows.map(toState);
}
