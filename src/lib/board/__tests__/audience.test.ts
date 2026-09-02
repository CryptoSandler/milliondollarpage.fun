import { describe, expect, it } from "vitest";
import { execute, query } from "../../db";
import { clicksFor, countClick, rollUpVisits, visitsTotal } from "../audience";

/**
 * The two counts the wall shows, and the promise that neither knows anybody.
 *
 * ## Why the privacy check reads the SCHEMA and not the code
 *
 * A test that asserts "we do not store IPs" by reading the insert statements is
 * a test that passes until somebody adds a second insert. The guarantee this
 * project makes is about the COLUMNS — `migrations/014_visits_and_clicks.sql`
 * argues it that way on purpose — so the check asks Postgres what the columns
 * are. There is nowhere in either table to put a visitor, and that is a fact
 * about the database rather than about anybody's discipline.
 */
describe("what the audience tables can hold", () => {
  it("gives the visit counter nowhere to put a person", async () => {
    const columns = await query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_name = 'visit_total'
        ORDER BY column_name`,
    );

    expect(columns.map((c) => c.column_name)).toEqual([
      "counted_through",
      "only_row",
      "visits",
    ]);
    /*
      NOT ONE TEXT COLUMN. A hash, an address, a session id and a user agent are
      all text, so a table with no text column cannot acquire one of them
      without a migration somebody has to write and review. That is the whole
      claim, and it is worth more than a promise because it fails loudly.
    */
    for (const column of columns) {
      expect(
        column.data_type,
        `visit_total.${column.column_name} is ${column.data_type}, which could hold a visitor`,
      ).not.toMatch(/char|text|json|inet|uuid/);
    }
  });

  it("gives the click counter a block and a number and nothing else", async () => {
    const columns = await query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_name = 'block_clicks'
        ORDER BY column_name`,
    );

    expect(columns.map((c) => c.column_name)).toEqual(["block_id", "clicks"]);
    // No timestamp either: a time plus a block is close enough to a person to
    // be worth refusing — see the migration, which says why.
    for (const column of columns) {
      expect(column.data_type).not.toMatch(/timestamp|inet|text/);
    }
  });

  it("holds exactly one row, and the database is what stops a second", async () => {
    // The suite truncates between tests, so the migration's seeded row is gone
    // and this puts it back before asking the question it is about.
    await execute(`INSERT INTO visit_total (only_row) VALUES (true) ON CONFLICT DO NOTHING`);

    // A second row cannot be `true` — the primary key refuses it — and cannot be
    // `false` either, which is what the CHECK is for. Between them there is no
    // second row to have.
    await expect(execute(`INSERT INTO visit_total (only_row) VALUES (true)`)).rejects.toThrow();
    await expect(execute(`INSERT INTO visit_total (only_row) VALUES (false)`)).rejects.toThrow();

    const rows = await query<{ n: string }>(`SELECT count(*)::text AS n FROM visit_total`);
    expect(rows[0].n).toBe("1");
  });
});

describe("counting visits from the heartbeat that already exists", () => {
  /** A visitor seen at a run of minutes, as the heartbeat would have written. */
  async function seen(hash: string, minutes: string[]): Promise<void> {
    for (const minute of minutes) {
      await execute(
        `INSERT INTO presence_seen (caller_hash, minute) VALUES ($1, $2::timestamptz)
         ON CONFLICT DO NOTHING`,
        [hash, minute],
      );
    }
  }

  it("counts a visitor who stays for an hour once, and one who comes back twice", async () => {
    // Ten consecutive minutes is one session; a gap and three more is a second.
    await seen("a", [
      "2026-08-01T09:00Z",
      "2026-08-01T09:01Z",
      "2026-08-01T09:02Z",
      "2026-08-01T14:00Z",
      "2026-08-01T14:01Z",
    ]);
    // A different visitor, one session.
    await seen("b", ["2026-08-01T09:01Z", "2026-08-01T09:02Z"]);

    expect(await visitsTotal()).toBe(3);
  });

  it("moves the total into the counter and does not count it twice", async () => {
    await seen("a", ["2026-08-01T09:00Z", "2026-08-01T09:01Z"]);
    await seen("b", ["2026-08-01T11:00Z"]);

    const through = new Date("2026-08-01T12:00Z");
    expect(await rollUpVisits(through)).toBe(2);
    expect(await visitsTotal()).toBe(2);

    // The cron may run twice, or run again after a failure. A counter that
    // added the same window twice would be a number that only ever grew wrong.
    expect(await rollUpVisits(through)).toBe(0);
    expect(await visitsTotal()).toBe(2);
  });

  it("keeps counting after the raw minutes it counted are gone", async () => {
    await seen("a", ["2026-08-01T09:00Z"]);
    await rollUpVisits(new Date("2026-08-01T12:00Z"));
    // Which is what the roll-up does next, in the same request.
    await execute(`DELETE FROM presence_seen`);

    expect(await visitsTotal()).toBe(1);
  });
});

describe("counting clicks", () => {
  async function aBlock(): Promise<string> {
    const rows = await query<{ id: string }>(
      `INSERT INTO blocks (x, y, w, h, status, caption, link, price_per_pixel_usdc, total_usdc)
       VALUES (0, 0, 10, 10, 'paid', 'A caption', 'https://example.com', 1000000, 100000000)
       RETURNING id`,
    );
    return rows[0].id;
  }

  it("reads zero for a rectangle nobody has clicked, without a row for it", async () => {
    const id = await aBlock();
    expect(await clicksFor(id)).toBe(0);

    const rows = await query<{ n: string }>(`SELECT count(*)::text AS n FROM block_clicks`);
    expect(rows[0].n, "an unclicked rectangle should cost no row").toBe("0");
  });

  it("counts each follow, and creates the row on the first", async () => {
    const id = await aBlock();
    await countClick(id);
    await countClick(id);
    await countClick(id);
    expect(await clicksFor(id)).toBe(3);
  });

  /**
   * THE CASCADE, AND THE THING THAT MAKES IT NEARLY UNREACHABLE.
   *
   * The first version of this deleted a SOLD block and got
   * `block <id> is sold: it cannot be deleted` from the permanence trigger —
   * which is the invariant `SECURITY.md` opens with doing its job, and a better
   * answer than the one the test wanted. A sold rectangle's clicks cannot be
   * orphaned because a sold rectangle cannot go.
   *
   * So the cascade is only ever reachable for a rectangle that CAN be deleted —
   * an expired hold — and a hold has no public link, so `/go` refuses it and it
   * has no clicks to lose. The cascade is belt and braces for a row that should
   * never exist, and this proves it works rather than assuming it.
   */
  it("cannot orphan a count, because a sold rectangle cannot be deleted at all", async () => {
    const sold = await aBlock();
    await countClick(sold);
    await expect(execute(`DELETE FROM blocks WHERE id = $1`, [sold])).rejects.toThrow(
      /cannot be deleted/,
    );
    expect(await clicksFor(sold), "the count survives with the rectangle").toBe(1);

    // And where a delete IS allowed, the count goes with it.
    const held = await query<{ id: string }>(
      `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc)
       VALUES (500, 500, 10, 10, 'reserved', now() + interval '30 minutes', 1000000, 100000000)
       RETURNING id`,
    );
    await countClick(held[0].id);
    await execute(`DELETE FROM blocks WHERE id = $1`, [held[0].id]);
    expect(await clicksFor(held[0].id)).toBe(0);
  });
});
