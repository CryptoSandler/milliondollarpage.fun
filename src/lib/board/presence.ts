import { execute, query } from "../db";
import { ONLINE_WINDOW_SECONDS } from "./presence-window";

export { HEARTBEAT_MS, ONLINE_WINDOW_SECONDS } from "./presence-window";

/**
 * How many people are on the wall, and how many have been.
 *
 * WHO CALLS THIS: `/api/presence`, which is the heartbeat every open board
 * sends; `/stats`, which reads all four numbers; and `src/app/page.tsx`, which
 * ships the live count with the first paint so the banner does not appear a
 * beat after the board does. None of them could do it themselves — the window,
 * the bucket boundaries and the roll-up have to agree with each other, and
 * three callers agreeing by hand is three chances to disagree.
 *
 * ## Anonymity is a property of the schema, not of this file
 *
 * The only thing stored per visitor is `hashIp`'s output: sha256 over
 * `RATE_LIMIT_SALT` and a normalised IP. There is no reverse. There is also no
 * path, referrer, user agent, session or cookie anywhere in the table, which is
 * what makes "anonymous" a fact about `migrations/013_presence.sql` rather than
 * a claim in a comment.
 */

/**
 * How long raw minute rows are kept before the roll-up eats them.
 *
 * 25 hours, and the extra hour is the point: a DAY bucket is counted from the
 * raw minutes inside that day, so every one of them has to still be here when
 * the day closes. Twenty-four would race the boundary.
 */
export const RAW_RETENTION_HOURS = 25;

/**
 * How old an hour must be before it is rolled up.
 *
 * Two hours, so the hour being counted is finished and the one after it is too.
 * Rolling up the hour that just ended would be correct and would also delete
 * the rows `/stats` is most likely to be asked about.
 */
export const ROLLUP_AFTER_HOURS = 2;

/**
 * Records that this caller is here, now — and says whether it was the first
 * time this minute.
 *
 * THE PRIMARY KEY IS THE RATE LIMIT, which is the whole reason this returns
 * anything. `/api/presence` is the cheapest write on the site to call in a
 * loop, so it needs a ceiling; and the ceiling that is already there, for free,
 * is (caller_hash, minute) — a second heartbeat inside the same minute inserts
 * nothing, and `rowCount` says so. One accepted write per caller per minute,
 * enforced by the database rather than by a counter somebody has to keep, and
 * with nothing extra stored to enforce it.
 *
 * That is also why there is no "heartbeats per hour" ceiling next to it: with
 * this rule a caller cannot exceed sixty rows an hour however hard they try, so
 * a second limit would be one that can never fire. See `PRESENCE_LIMIT` in
 * `../callers/limits.ts`, which records that reasoning where the other ceilings
 * are.
 *
 * `retryAt` is the top of the next minute, which is exactly when a refused
 * heartbeat becomes acceptable again.
 */
export async function recordHeartbeat(
  callerHash: string,
): Promise<{ accepted: boolean; retryAt: string }> {
  const written = await execute(
    `INSERT INTO presence_seen (caller_hash, minute)
     VALUES ($1, date_trunc('minute', now()))
     ON CONFLICT DO NOTHING`,
    [callerHash],
  );

  const nextMinute = new Date(Math.ceil((Date.now() + 1) / 60_000) * 60_000);
  return { accepted: written > 0, retryAt: nextMinute.toISOString() };
}

/**
 * How many distinct visitors have beaten inside the window.
 *
 * Counted off the raw table, which always holds at least the last 25 hours, so
 * this never depends on the roll-up having run.
 */
export async function onlineNow(): Promise<number> {
  const [row] = await query<{ online: string }>(
    /*
      THE BOUNDARY IS TRUNCATED TOO, and leaving it un-truncated cost the window
      most of its slack without saying so.

      A heartbeat at 11:58:55 is stored as the minute 11:58:00, because the
      minute is the key. Comparing that against a raw `now() - 150 seconds` —
      11:58:20 at 12:00:50 — excludes it: the row was pushed back by 55 seconds
      and the boundary was not. The window is nominally 150 seconds and was in
      fact anywhere from 91 to 150 depending on where in the minute the question
      happened to be asked, which is BELOW two beats. So the flicker the 150 was
      chosen to prevent was still possible, and only at some times of the
      minute, which is the worst way for it to be possible.

      Truncating both sides puts the comparison in the same units the rows are
      stored in: the window is whole minutes, always, and one missed heartbeat
      is survivable at every second of the clock. Found by a test that asserted
      115 seconds and passed or failed on where the minute hand was.
    */
    `SELECT count(DISTINCT caller_hash) AS online
       FROM presence_seen
      WHERE minute >= date_trunc('minute', now() - make_interval(secs => $1))`,
    [ONLINE_WINDOW_SECONDS],
  );
  return Number(row?.online ?? 0);
}

export type PresenceHistory = {
  /** Distinct visitors in each of the last hours, oldest first. */
  hours: { start: string; visitors: number }[];
  /** Distinct visitors in each of the last days, oldest first. */
  days: { start: string; visitors: number }[];
};

/**
 * The rolled-up history, plus whatever the roll-up has not reached yet.
 *
 * The current hour and the current day are still raw, so they are counted from
 * raw here and unioned with the buckets. Without that, `/stats` would show a
 * hole where today is.
 */
export async function presenceHistory(hours = 24, days = 30): Promise<PresenceHistory> {
  const [hourRows, dayRows] = await Promise.all([
    query<{ start: Date; visitors: string }>(
      `SELECT bucket_start AS start, visitors
         FROM presence_rollup
        WHERE span = 'hour' AND bucket_start >= date_trunc('hour', now()) - make_interval(hours => $1)
        UNION ALL
       SELECT date_trunc('hour', minute) AS start, count(DISTINCT caller_hash)::int AS visitors
         FROM presence_seen
        WHERE minute >= date_trunc('hour', now()) - make_interval(hours => $1)
        GROUP BY 1
        ORDER BY 1`,
      [hours],
    ),
    query<{ start: Date; visitors: string }>(
      `SELECT bucket_start AS start, visitors
         FROM presence_rollup
        WHERE span = 'day' AND bucket_start >= date_trunc('day', now()) - make_interval(days => $1)
        UNION ALL
       SELECT date_trunc('day', minute) AS start, count(DISTINCT caller_hash)::int AS visitors
         FROM presence_seen
        WHERE minute >= date_trunc('day', now()) - make_interval(days => $1)
        GROUP BY 1
        ORDER BY 1`,
      [days],
    ),
  ]);

  const shape = (rows: { start: Date; visitors: string }[]) =>
    rows.map((row) => ({ start: row.start.toISOString(), visitors: Number(row.visitors) }));

  return { hours: shape(hourRows), days: shape(dayRows) };
}

/**
 * Collapses raw minutes into hour and day buckets, then deletes what it has
 * counted.
 *
 * EVERY BUCKET IS COUNTED FROM RAW, NEVER BY ADDING SMALLER BUCKETS. A visitor
 * present in three hours of a day is one visitor and three hour-buckets; summing
 * would report three. So the day's count is `count(DISTINCT caller_hash)` over
 * that day's own raw minutes, which is why the raw rows outlive the hour
 * buckets made from them.
 *
 * Idempotent: both inserts are `ON CONFLICT DO UPDATE`, so running this twice
 * over the same window writes the same numbers. It has to be — it is called
 * opportunistically from the heartbeat route rather than from a scheduler this
 * project does not have.
 *
 * ponytail: no cron, no queue, no worker. A few hundred rows an hour is not
 * work that needs one, and a scheduler would be a second deployment target for
 * a DELETE. If presence ever outgrows this, the upgrade is a Vercel cron
 * calling the same function, and nothing else changes.
 */
export async function rollUpPresence(): Promise<{ hours: number; days: number; deleted: number }> {
  const hours = await execute(
    `INSERT INTO presence_rollup (span, bucket_start, visitors)
     SELECT 'hour', date_trunc('hour', minute), count(DISTINCT caller_hash)
       FROM presence_seen
      WHERE minute < date_trunc('hour', now()) - make_interval(hours => $1)
      GROUP BY 2
     ON CONFLICT (span, bucket_start) DO UPDATE SET visitors = excluded.visitors`,
    [ROLLUP_AFTER_HOURS],
  );

  const days = await execute(
    `INSERT INTO presence_rollup (span, bucket_start, visitors)
     SELECT 'day', date_trunc('day', minute), count(DISTINCT caller_hash)
       FROM presence_seen
      WHERE minute < date_trunc('day', now())
      GROUP BY 2
     ON CONFLICT (span, bucket_start) DO UPDATE SET visitors = excluded.visitors`,
  );

  // Only now, and only what both buckets above have already counted.
  const deleted = await execute(
    `DELETE FROM presence_seen WHERE minute < now() - make_interval(hours => $1)`,
    [RAW_RETENTION_HOURS],
  );

  return { hours, days, deleted };
}
