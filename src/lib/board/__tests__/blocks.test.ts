import { describe, expect, it } from "vitest";
import { execute } from "../../db";
import { boardStats, listLiveBlocks, sweepExpiredReservations } from "../blocks";
import { pricePerPixelBaseUnits } from "../settings";

async function insert(
  x: number,
  y: number,
  w: number,
  h: number,
  status: string,
  expiresAt: string | null = null,
): Promise<void> {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc)
     VALUES ($1, $2, $3, $4, $5, $6, 1000000, $7)`,
    [x, y, w, h, status, expiresAt, w * h * 1000000],
  );
}

describe("listLiveBlocks", () => {
  it("returns nothing for an empty board", async () => {
    expect(await listLiveBlocks()).toEqual([]);
  });

  it("includes reserved, paid and minted blocks, because all three hold pixels", async () => {
    await insert(0, 0, 10, 10, "reserved", "2999-01-01T00:00:00Z");
    await insert(10, 0, 10, 10, "paid");
    await insert(20, 0, 10, 10, "minted");
    const blocks = await listLiveBlocks();
    expect(blocks.map((b) => b.status).sort()).toEqual(["minted", "paid", "reserved"]);
  });

  it("excludes removed blocks, whose pixels are for sale again", async () => {
    await insert(0, 0, 10, 10, "removed");
    expect(await listLiveBlocks()).toEqual([]);
  });

  it("excludes reservations that have already expired", async () => {
    await insert(0, 0, 10, 10, "reserved", "2000-01-01T00:00:00Z");
    expect(await listLiveBlocks()).toEqual([]);
  });

  it("returns coordinates a canvas can draw without further arithmetic", async () => {
    await insert(120, 340, 50, 20, "minted");
    const [block] = await listLiveBlocks();
    expect(block).toMatchObject({ x: 120, y: 340, w: 50, h: 20 });
  });
});

describe("boardStats", () => {
  it("reports an empty board honestly", async () => {
    expect(await boardStats()).toEqual({ pixelsSold: 0, blocksSold: 0, percentSold: 0 });
  });

  it("counts paid and minted pixels, but not reservations", async () => {
    await insert(0, 0, 100, 100, "minted");
    await insert(100, 0, 100, 100, "paid");
    await insert(200, 0, 100, 100, "reserved", "2999-01-01T00:00:00Z");
    const stats = await boardStats();
    expect(stats.pixelsSold).toBe(20_000);
    expect(stats.blocksSold).toBe(2);
    expect(stats.percentSold).toBeCloseTo(2, 10);
  });

  it("keeps enough precision for the four-decimal counter", async () => {
    await insert(0, 0, 10, 10, "minted");
    expect((await boardStats()).percentSold).toBeCloseTo(0.01, 10);
  });
});

describe("sweepExpiredReservations", () => {
  it("deletes expired reservations and reports how many", async () => {
    await insert(0, 0, 10, 10, "reserved", "2000-01-01T00:00:00Z");
    expect(await sweepExpiredReservations()).toBe(1);
    expect(await listLiveBlocks()).toEqual([]);
  });

  it("never touches a live reservation", async () => {
    await insert(0, 0, 10, 10, "reserved", "2999-01-01T00:00:00Z");
    expect(await sweepExpiredReservations()).toBe(0);
  });

  it("never touches a paid order, whose expiry is null", async () => {
    await insert(0, 0, 10, 10, "paid", null);
    expect(await sweepExpiredReservations()).toBe(0);
  });

  it("frees the rectangle it swept", async () => {
    await insert(0, 0, 10, 10, "reserved", "2000-01-01T00:00:00Z");
    await sweepExpiredReservations();
    await insert(0, 0, 10, 10, "minted");
    expect(await listLiveBlocks()).toHaveLength(1);
  });
});

describe("pricePerPixelBaseUnits", () => {
  it("reads the seeded dollar", async () => {
    expect(await pricePerPixelBaseUnits()).toBe(1_000_000);
  });

  it("reads a changed price", async () => {
    await execute("UPDATE settings SET value = '2500000' WHERE key = 'price_per_pixel_usdc'");
    try {
      expect(await pricePerPixelBaseUnits()).toBe(2_500_000);
    } finally {
      await execute("UPDATE settings SET value = '1000000' WHERE key = 'price_per_pixel_usdc'");
    }
  });
});
