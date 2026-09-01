import { afterEach, describe, expect, it, vi } from "vitest";
import { execute, query } from "../../db";
import {
  ONLINE_WINDOW_SECONDS,
  onlineNow,
  presenceHistory,
  recordHeartbeat,
  rollUpPresence,
} from "../presence";

/**
 * Presence, and the three claims it makes.
 *
 * It counts people without knowing who they are; it does not flicker when one
 * heartbeat is dropped; and a roll-up never turns one visitor into several,
 * which is the failure the obvious implementation has and does not report.
 */

/** Writes a heartbeat at a chosen moment, which the route cannot do. */
async function seen(caller: string, at: string): Promise<void> {
  await execute(
    `INSERT INTO presence_seen (caller_hash, minute)
     VALUES ($1, date_trunc('minute', $2::timestamptz)) ON CONFLICT DO NOTHING`,
    [caller, at],
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("recordHeartbeat", () => {
  it("accepts the first beat of a minute and refuses the rest", async () => {
    const first = await recordHeartbeat("caller-a");
    expect(first.accepted).toBe(true);

    const second = await recordHeartbeat("caller-a");
    expect(second.accepted).toBe(false);

    // And the refusal stored nothing: one caller, one minute, one row.
    const [row] = await query<{ count: string }>("SELECT count(*)::text FROM presence_seen");
    expect(Number(row.count)).toBe(1);
  });

  it("points a refused caller at the top of the next minute", async () => {
    await recordHeartbeat("caller-a");
    const refused = await recordHeartbeat("caller-a");

    const retry = Date.parse(refused.retryAt);
    expect(retry).toBeGreaterThan(Date.now());
    expect(retry % 60_000).toBe(0);
    expect(retry - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it("counts two callers separately in the same minute", async () => {
    expect((await recordHeartbeat("caller-a")).accepted).toBe(true);
    expect((await recordHeartbeat("caller-b")).accepted).toBe(true);
    expect(await onlineNow()).toBe(2);
  });
});

describe("onlineNow", () => {
  it("is zero on a wall nobody is looking at", async () => {
    expect(await onlineNow()).toBe(0);
  });

  it("counts a visitor once however many minutes they have been here", async () => {
    const now = Date.now();
    await seen("caller-a", new Date(now).toISOString());
    await seen("caller-a", new Date(now - 60_000).toISOString());
    await seen("caller-a", new Date(now - 120_000).toISOString());

    expect(await onlineNow()).toBe(1);
  });

  /**
   * The reason the window is 150 seconds and not 120: one dropped beat must not
   * drop somebody out of the count and then back in.
   *
   * ASSERTED AT EVERY SECOND OF THE MINUTE, not at one. The first version of
   * this test wrote a beat 115 seconds ago and passed or failed depending on
   * where the minute hand was when it ran — because a stored minute is
   * truncated and the boundary it was compared against was not, so the real
   * window was between 91 and 150 seconds. That is how the bug in `onlineNow`
   * was found, and pinning the offset would have hidden it again. This walks
   * the whole minute instead, which is what makes the claim load-independent.
   */
  it("keeps a visitor who missed one heartbeat, whatever the time is", async () => {
    for (let second = 0; second < 60; second += 7) {
      await execute("TRUNCATE presence_seen");
      const at = new Date();
      at.setSeconds(second, 0);
      await seen("caller-a", new Date(at.getTime() - 115_000).toISOString());

      expect(await onlineNow(), `a beat 115s before :${second}`).toBe(1);
    }
  });

  it("drops a visitor who missed two", async () => {
    await seen("caller-a", new Date(Date.now() - (ONLINE_WINDOW_SECONDS + 90) * 1_000).toISOString());
    expect(await onlineNow()).toBe(0);
  });
});

describe("rollUpPresence", () => {
  /**
   * THE FAILURE THIS SUITE EXISTS FOR. A visitor present at 09:05 and again at
   * 09:40 is two rows and one person. An hour bucket built by counting rows —
   * or by adding minute buckets — reports two. Only `count(DISTINCT ...)` over
   * the raw rows gets it right, which is why the raw rows have to outlive the
   * buckets made from them.
   */
  it("counts a visitor once per hour, not once per minute they were here", async () => {
    for (const minute of ["09:05", "09:06", "09:07", "09:40"]) {
      await seen("caller-a", `2026-01-01T${minute}:00Z`);
    }
    await seen("caller-b", "2026-01-01T09:30:00Z");

    await rollUpPresence();

    const [hour] = await query<{ visitors: number }>(
      `SELECT visitors FROM presence_rollup WHERE span = 'hour' AND bucket_start = '2026-01-01T09:00:00Z'`,
    );
    expect(hour.visitors).toBe(2);
  });

  it("counts a visitor once per day, not once per hour they were here", async () => {
    for (const hour of ["01", "05", "09", "22"]) {
      await seen("caller-a", `2026-01-01T${hour}:00:00Z`);
    }

    await rollUpPresence();

    const [day] = await query<{ visitors: number }>(
      `SELECT visitors FROM presence_rollup WHERE span = 'day' AND bucket_start = '2026-01-01T00:00:00Z'`,
    );
    // Four hour buckets, one visitor. Adding the hours would say four.
    expect(day.visitors).toBe(1);
  });

  it("deletes the raw rows it has already counted, and keeps the recent ones", async () => {
    await seen("caller-old", "2026-01-01T09:00:00Z");
    await seen("caller-now", new Date().toISOString());

    await rollUpPresence();

    const rows = await query<{ caller_hash: string }>("SELECT caller_hash FROM presence_seen");
    expect(rows.map((row) => row.caller_hash)).toEqual(["caller-now"]);
  });

  it("writes the same numbers when it runs twice, because it rides on a heartbeat", async () => {
    await seen("caller-a", "2026-01-01T09:05:00Z");
    await seen("caller-b", "2026-01-01T09:40:00Z");

    await rollUpPresence();
    const first = await query<{ span: string; visitors: number }>(
      "SELECT span, visitors FROM presence_rollup ORDER BY span",
    );
    await rollUpPresence();
    const second = await query<{ span: string; visitors: number }>(
      "SELECT span, visitors FROM presence_rollup ORDER BY span",
    );

    expect(second).toEqual(first);
  });

  it("leaves the hour that just ended alone, because /stats is asked about it", async () => {
    await seen("caller-a", new Date(Date.now() - 30 * 60_000).toISOString());
    await rollUpPresence();

    const [row] = await query<{ count: string }>("SELECT count(*)::text FROM presence_seen");
    expect(Number(row.count)).toBe(1);
  });
});

describe("presenceHistory", () => {
  it("shows the current hour even though the roll-up has not reached it", async () => {
    await seen("caller-a", new Date().toISOString());

    const history = await presenceHistory();
    expect(history.hours.at(-1)?.visitors).toBe(1);
    expect(history.days.at(-1)?.visitors).toBe(1);
  });

  it("shows a rolled-up hour after its raw rows are gone", async () => {
    await seen("caller-a", "2026-01-01T09:05:00Z");
    await rollUpPresence();

    // Far enough in the past that the default window does not reach it, which
    // is the honest answer rather than a hole: ask for a wider window.
    const wide = await presenceHistory(24 * 365 * 5, 365 * 5);
    const hour = wide.hours.find((h) => h.start === new Date("2026-01-01T09:00:00Z").toISOString());
    expect(hour?.visitors).toBe(1);
  });
});

describe("what presence stores", () => {
  it("has no column that could name a person", async () => {
    const columns = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'presence_seen'`,
    );
    expect(columns.map((c) => c.column_name).sort()).toEqual(["caller_hash", "minute"]);
  });

  it("refuses a bucket that does not start on its own boundary", async () => {
    await expect(
      execute(
        `INSERT INTO presence_rollup (span, bucket_start, visitors)
         VALUES ('hour', '2026-01-01T09:17:00Z', 1)`,
      ),
    ).rejects.toThrow(/presence_rollup_starts_on_boundary/);
  });

  it("refuses a span nobody defined", async () => {
    await expect(
      execute(
        `INSERT INTO presence_rollup (span, bucket_start, visitors)
         VALUES ('week', '2026-01-01T00:00:00Z', 1)`,
      ),
    ).rejects.toThrow(/presence_rollup_span_known/);
  });
});
