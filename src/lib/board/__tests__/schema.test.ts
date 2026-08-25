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
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc)
     VALUES ($1, $2, $3, $4, $5, 1000000, $6)`,
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

  it("frees a removed block's rectangle for someone else", async () => {
    await insertBlock(0, 0, 20, 20, "removed");
    await insertBlock(0, 0, 20, 20, "minted");
    const rows = await query("SELECT id FROM blocks WHERE status = 'minted'");
    expect(rows).toHaveLength(1);
  });

  it("refuses blocks that are off the grid", async () => {
    expect(await errorCodeOf(() => insertBlock(5, 0, 10, 10))).toBe("23514");
  });

  it("refuses blocks smaller than one block", async () => {
    // A zero-height row would also produce an EMPTY int4range, and an empty
    // range conflicts with nothing — so this check is what keeps the overlap
    // constraint meaningful, not merely what keeps the UI tidy.
    expect(await errorCodeOf(() => insertBlock(0, 0, 10, 0))).toBe("23514");
  });

  it("refuses blocks that leave the board", async () => {
    expect(await errorCodeOf(() => insertBlock(990, 0, 20, 10))).toBe("23514");
  });

  it("refuses a caption longer than 32 characters", async () => {
    const code = await errorCodeOf(() =>
      execute(
        `INSERT INTO blocks (x, y, w, h, status, caption, price_per_pixel_usdc, total_usdc)
         VALUES (0, 0, 10, 10, 'minted', $1, 1000000, 100000000)`,
        ["x".repeat(33)],
      ),
    );
    expect(code).toBe("23514");
  });

  it("refuses a status nobody defined", async () => {
    expect(await errorCodeOf(() => insertBlock(0, 0, 10, 10, "sold"))).toBe("23514");
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
