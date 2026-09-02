import { execute, query } from "../db";

/**
 * How many people have ever been here, and how often one rectangle's link has
 * been followed.
 *
 * WHO CALLS THIS: `/api/board` and `src/app/page.tsx` for the total the header
 * prints; `/api/blocks/[id]` for the per-block count the hover card prints;
 * `/go/[id]` for the increment; and the presence cron, which rolls visits up
 * in the same pass it rolls presence up.
 *
 * ## Why it is a separate module from `presence.ts`
 *
 * That file owns a decision — who is here right now, counted without knowing
 * who anybody is — and its every function is about a window of minutes. This is
 * arithmetic OVER that decision plus a counter that has nothing to do with
 * presence at all. Putting the click counter in `presence.ts` would file it
 * under a privacy argument it does not belong to, and putting the visit roll-up
 * anywhere else would separate it from the query it is derived from.
 *
 * ## What neither of these collects
 *
 * Nothing new. `visitsTotal` is arithmetic over `presence_seen`, which the
 * anonymous heartbeat already writes; `block_clicks` is one integer per
 * rectangle. There is no IP, no cookie, no session, no referrer and no user
 * agent in either path, and `migrations/014_visits_and_clicks.sql` argues that
 * from the columns rather than from a promise.
 */

/**
 * The cumulative count of visits, as the header prints it.
 *
 * The stored total plus whatever has happened since the last roll-up, so the
 * number moves during the day rather than stepping once a night. Both halves
 * count SESSION STARTS — a minute whose visitor has no minute immediately
 * before it — which is what makes a visitor who comes back tomorrow two visits
 * and a visitor who stays for an hour one.
 */
export async function visitsTotal(): Promise<number> {
  /*
    THE COUNTER'S ROW MAY NOT EXIST, and this reads correctly when it does not.
    The migration seeds it, but a `TRUNCATE` takes it away — which is what the
    test harness does between every test, and would be what a restore from a
    schema-only dump did too. A missing row means nothing has been folded in
    yet, not that nobody has ever visited: the raw minutes are still there and
    still countable.
  */
  const rows = await query<{ visits: string }>(
    `SELECT (coalesce(v.visits, 0) + coalesce(s.started, 0))::bigint AS visits
       FROM (SELECT 1) AS one
       LEFT JOIN visit_total v ON v.only_row
       LEFT JOIN LATERAL (
         SELECT count(*) AS started
           FROM (
             SELECT minute,
                    lag(minute) OVER (PARTITION BY caller_hash ORDER BY minute) AS previous
               FROM presence_seen
              WHERE minute > coalesce(v.counted_through, '-infinity'::timestamptz)
           ) walked
          WHERE previous IS NULL OR minute - previous > interval '1 minute'
       ) s ON true`,
  );
  return rows.length === 0 ? 0 : Number(rows[0].visits);
}

/**
 * Folds everything before `through` into the stored total, once.
 *
 * WHO CALLS THIS: `rollUpPresence`'s caller, immediately BEFORE the roll-up
 * deletes raw minutes — which is the whole reason it takes the cutoff as an
 * argument rather than choosing one. Counting after the delete would count a
 * day that is no longer there.
 *
 * Idempotent by `counted_through`: a second run in the same minute counts
 * nothing, because there is nothing after the mark it just moved.
 */
export async function rollUpVisits(through: Date): Promise<number> {
  const rows = await query<{ added: string }>(
    `WITH mark AS (
       SELECT coalesce(
         (SELECT counted_through FROM visit_total WHERE only_row),
         '-infinity'::timestamptz) AS since
     ),
     started AS (
       SELECT count(*) AS n
         FROM (
           SELECT minute,
                  lag(minute) OVER (PARTITION BY caller_hash ORDER BY minute) AS previous
             FROM presence_seen, mark
            WHERE minute > mark.since AND minute <= $1
         ) walked
        WHERE previous IS NULL OR minute - previous > interval '1 minute'
     ),
     folded AS (
       INSERT INTO visit_total (only_row, visits, counted_through)
       SELECT true, started.n, $1 FROM started
       ON CONFLICT (only_row) DO UPDATE
          SET visits = visit_total.visits + excluded.visits,
              counted_through = excluded.counted_through
        WHERE excluded.counted_through > visit_total.counted_through
       RETURNING 1
     )
     SELECT CASE WHEN EXISTS (SELECT 1 FROM folded)
                 THEN (SELECT n FROM started) ELSE 0 END::bigint AS added`,
    [through],
  );
  return rows.length === 0 ? 0 : Number(rows[0].added);
}

/** How many times one rectangle's link has been followed. Zero if never. */
export async function clicksFor(blockId: string): Promise<number> {
  const rows = await query<{ clicks: string }>(
    `SELECT clicks::bigint AS clicks FROM block_clicks WHERE block_id = $1`,
    [blockId],
  );
  return rows.length === 0 ? 0 : Number(rows[0].clicks);
}

/**
 * One more follow of one rectangle's link.
 *
 * Upsert rather than update: the row is created by the first click, so a
 * rectangle nobody has clicked costs nothing and reads as zero. Best-effort at
 * the caller — see `/go/[id]`, where a counter that failed must not stop the
 * redirect the visitor asked for.
 */
export async function countClick(blockId: string): Promise<void> {
  await execute(
    `INSERT INTO block_clicks (block_id, clicks) VALUES ($1, 1)
     ON CONFLICT (block_id) DO UPDATE SET clicks = block_clicks.clicks + 1`,
    [blockId],
  );
}
