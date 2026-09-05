import { describe, expect, it } from "vitest";
import { execute, query } from "../../db";

type Inserted = { x: number; y: number; w: number; h: number; x_range: string; y_range: string };

async function insertBlock(
  x: number,
  y: number,
  w: number,
  h: number,
  status = "minted",
): Promise<void> {
  // Migration 002 requires a reserved block to carry an expiry (and forbids
  // one on every other status), so a reserved fixture needs one here to reach
  // the overlap constraint this suite is actually exercising.
  const expiresAt = status === "reserved" ? "now() + interval '30 minutes'" : "NULL";
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at, approved_at)
     VALUES ($1, $2, $3, $4, $5, 1000000, $6, ${expiresAt}, CASE WHEN $5 IN ('paid','minted') THEN now() END)`,
    [x, y, w, h, status, w * h * 1000000],
  );
}

async function errorCodeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error) {
    return (error as { code?: string }).code ?? "no code";
  }
  return "no error";
}

describe("the blocks table", () => {
  it("derives its ranges from x, y, w and h so they cannot drift", async () => {
    await insertBlock(0, 0, 10, 10);
    const rows = await query<Inserted>("SELECT x, y, w, h, x_range, y_range FROM blocks");
    expect(rows[0].x_range).toBe("[0,10)");
    expect(rows[0].y_range).toBe("[0,10)");
  });

  it("accepts blocks that share an edge", async () => {
    await insertBlock(0, 0, 10, 10);
    await insertBlock(10, 0, 10, 10);
    await insertBlock(0, 10, 10, 10);
    const rows = await query("SELECT id FROM blocks");
    expect(rows).toHaveLength(3);
  });

  it("refuses blocks that actually overlap", async () => {
    await insertBlock(0, 0, 20, 20);
    expect(await errorCodeOf(() => insertBlock(10, 10, 20, 20))).toBe("23P01");
  });

  it("refuses a reservation that overlaps a minted block", async () => {
    await insertBlock(0, 0, 20, 20, "minted");
    expect(await errorCodeOf(() => insertBlock(0, 0, 10, 10, "reserved"))).toBe("23P01");
  });

  /**
   * The reversal migration 006 exists for. 001 excluded `removed` from the
   * overlap constraint so a moderated rectangle went back on sale, which is
   * ownership lapsing; a takedown is a flag on a row that stays sold, so the
   * constraint keeps covering it and nobody else can ever buy those pixels.
   */
  it("keeps a taken-down block's rectangle out of everybody else's reach", async () => {
    await insertBlock(0, 0, 20, 20, "minted");
    await execute("UPDATE blocks SET hidden_at = now(), takedown_reason = 'a report'");
    expect(await errorCodeOf(() => insertBlock(0, 0, 20, 20, "reserved"))).toBe("23P01");
    expect(await query("SELECT id FROM blocks")).toHaveLength(1);
  });

  it("no longer has the status a takedown used to be", async () => {
    expect(await errorCodeOf(() => insertBlock(0, 0, 10, 10, "removed"))).toBe("23514");
  });

  it("refuses to hide a hold, which has no published content to take down", async () => {
    const code = await errorCodeOf(() =>
      execute(
        `INSERT INTO blocks (x, y, w, h, status, expires_at, hidden_at,
                             price_per_pixel_usdc, total_usdc)
         VALUES (0, 0, 10, 10, 'reserved', now() + interval '30 minutes', now(), 1000000, 100000000)`,
      ),
    );
    expect(code).toBe("23514");
  });

  it("refuses a purge that left the bytes, the mime, the caption or the link behind", async () => {
    await insertBlock(0, 0, 10, 10, "paid");
    const code = await errorCodeOf(() =>
      execute(
        `UPDATE blocks SET hidden_at = now(), purged_at = now(), pending_image = $1,
                           pending_image_mime = 'image/png'`,
        [Buffer.from([1, 2, 3])],
      ),
    );
    expect(code).toBe("23514");
  });

  it("refuses a purge that never hid anything, because destroyed bytes cannot still be published", async () => {
    await insertBlock(0, 0, 10, 10, "paid");
    expect(await errorCodeOf(() => execute("UPDATE blocks SET purged_at = now()"))).toBe("23514");
  });

  it("accepts a rectangle that lines up with no grid, because there is none", async () => {
    // The exact insert the old blocks_on_grid CHECK would have refused.
    await insertBlock(137, 41, 23, 7);
    const rows = await query<Inserted>("SELECT x, y, w, h, x_range, y_range FROM blocks");
    expect(rows[0]).toMatchObject({ x: 137, y: 41, w: 23, h: 7 });
    expect(rows[0].x_range).toBe("[137,160)");
  });

  it("accepts a single pixel, which is the smallest purchase there is", async () => {
    await insertBlock(1249, 799, 1, 1);
    const rows = await query<Inserted>("SELECT x, y, w, h, x_range, y_range FROM blocks");
    expect(rows[0].x_range).toBe("[1249,1250)");
    expect(rows[0].y_range).toBe("[799,800)");
  });

  it("refuses a rectangle with no area at all", async () => {
    // A zero-height row would produce an EMPTY int4range, and an empty range
    // conflicts with nothing — so this check is what keeps the overlap
    // constraint meaningful, not merely what keeps the UI tidy.
    expect(await errorCodeOf(() => insertBlock(0, 0, 10, 0))).toBe("23514");
    expect(await errorCodeOf(() => insertBlock(0, 0, 0, 10))).toBe("23514");
  });

  it("refuses blocks that leave the wall, and the wall is 1250 by 800", async () => {
    expect(await errorCodeOf(() => insertBlock(1240, 0, 20, 10))).toBe("23514");
    expect(await errorCodeOf(() => insertBlock(0, 790, 10, 20))).toBe("23514");
    // Wider than the old square board and still on the wall; well inside it
    // across and off the bottom of it down. A single board size could not
    // tell those two apart.
    await insertBlock(1100, 0, 100, 10);
    expect(await errorCodeOf(() => insertBlock(0, 900, 10, 10))).toBe("23514");
  });

  it("refuses a caption longer than 32 characters", async () => {
    const code = await errorCodeOf(() =>
      execute(
        `INSERT INTO blocks (x, y, w, h, status, caption, price_per_pixel_usdc, total_usdc, approved_at)
         VALUES (0, 0, 10, 10, 'minted', $1, 1000000, 100000000, now())`,
        ["x".repeat(33)],
      ),
    );
    expect(code).toBe("23514");
  });

  it("refuses a status nobody defined", async () => {
    expect(await errorCodeOf(() => insertBlock(0, 0, 10, 10, "sold"))).toBe("23514");
  });
});

/**
 * The one invariant the application is not allowed to be responsible for.
 *
 * These break the trigger on purpose. The UPDATE is issued straight at the
 * table — no route, no library function, nothing that could be holding a check
 * of its own — and the refusal has to come from the database, because a test
 * that went through an API path would pass just as happily against a schema
 * with no trigger in it at all. Each one also reads the row back afterwards:
 * a statement that errors and still wrote is the failure mode worth naming.
 */
describe("the ownership trigger", () => {
  const OWNER = "OwnerWalletAddress11111111111111";
  const THIEF = "ThiefWallet2222222222222222";

  async function soldTo(status: string, buyer = OWNER, x = 0): Promise<string> {
    const rows = await query<{ id: string }>(
      `INSERT INTO blocks (x, y, w, h, status, owner_address, price_per_pixel_usdc, total_usdc, approved_at)
       VALUES ($1, 0, 10, 10, $2, $3, 1000000, 100000000, CASE WHEN $2 IN ('paid','minted') THEN now() END)
       RETURNING id`,
      [x, status, buyer],
    );
    return rows[0].id;
  }

  async function ownerOf(id: string): Promise<string | null> {
    const rows = await query<{ owner_address: string | null }>(
      "SELECT owner_address FROM blocks WHERE id = $1",
      [id],
    );
    return rows[0].owner_address;
  }

  it("refuses an UPDATE that hands a paid block to somebody else", async () => {
    const id = await soldTo("paid");
    // 23001, restrict_violation: an integrity rule said no.
    expect(
      await errorCodeOf(() =>
        execute("UPDATE blocks SET owner_address = $2 WHERE id = $1", [id, THIEF]),
      ),
    ).toBe("23001");
    expect(await ownerOf(id)).toBe(OWNER);
  });

  it("refuses it for a minted block too", async () => {
    const id = await soldTo("minted");
    expect(
      await errorCodeOf(() =>
        execute("UPDATE blocks SET owner_address = $2 WHERE id = $1", [id, THIEF]),
      ),
    ).toBe("23001");
    expect(await ownerOf(id)).toBe(OWNER);
  });

  it("refuses it for a taken-down block, because a takedown does not move ownership", async () => {
    const id = await soldTo("paid");
    await execute("UPDATE blocks SET hidden_at = now() WHERE id = $1", [id]);
    expect(
      await errorCodeOf(() =>
        execute("UPDATE blocks SET owner_address = $2 WHERE id = $1", [id, THIEF]),
      ),
    ).toBe("23001");
    expect(await ownerOf(id)).toBe(OWNER);
  });

  it("refuses to blank the owner, which is the same theft written differently", async () => {
    const id = await soldTo("paid");
    expect(
      await errorCodeOf(() => execute("UPDATE blocks SET owner_address = NULL WHERE id = $1", [id])),
    ).toBe("23001");
    expect(await ownerOf(id)).toBe(OWNER);
  });

  it("refuses a blanket UPDATE over the table, and leaves every row as it was", async () => {
    // The shape of the accident this exists for: one statement, no WHERE.
    const first = await soldTo("paid", OWNER, 0);
    const second = await soldTo("minted", "SecondOwner333333333333333", 100);
    expect(await errorCodeOf(() => execute("UPDATE blocks SET owner_address = $1", [THIEF]))).toBe(
      "23001",
    );
    expect(await ownerOf(first)).toBe(OWNER);
    expect(await ownerOf(second)).toBe("SecondOwner333333333333333");
  });

  it("still lets a sold block change everything else about itself", async () => {
    // The trigger guards one column. A mint landing, a moderation status, an
    // image being attached: all still ordinary UPDATEs.
    const id = await soldTo("paid");
    await execute("UPDATE blocks SET status = 'minted', minted_at = now() WHERE id = $1", [id]);
    const rows = await query<{ status: string }>("SELECT status FROM blocks WHERE id = $1", [id]);
    expect(rows[0].status).toBe("minted");
    expect(await ownerOf(id)).toBe(OWNER);
  });

  it("leaves a reservation's buyer alone, because a hold is not a sale", async () => {
    const rows = await query<{ id: string }>(
      `INSERT INTO blocks (x, y, w, h, status, owner_address, expires_at, price_per_pixel_usdc, total_usdc)
       VALUES (0, 0, 10, 10, 'reserved', 'HolderWallet4444444444444444', now() + interval '30 minutes',
               1000000, 100000000)
       RETURNING id`,
    );
    await execute("UPDATE blocks SET owner_address = $2 WHERE id = $1", [rows[0].id, THIEF]);
    expect(await ownerOf(rows[0].id)).toBe(THIEF);
  });
});

describe("the settings table", () => {
  it("ships one dollar per pixel, in USDC base units", async () => {
    const rows = await query<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'price_per_pixel_usdc'",
    );
    expect(rows[0].value).toBe("1000000");
  });
});
