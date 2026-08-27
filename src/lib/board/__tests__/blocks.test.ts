import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { execute, query } from "../../db";
import { boardStats, listLiveBlocks, sweepExpiredReservations } from "../blocks";
import { validateContent } from "../content";
import { attachContent } from "../orders";
import { reserveRect } from "../reserve";
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

  it("says a sold block has no image when nobody uploaded one", async () => {
    await insert(0, 0, 10, 10, "paid");
    expect((await listLiveBlocks())[0].hasImage).toBe(false);
  });

  it("says a sold block has one once bytes are attached", async () => {
    await insert(0, 0, 10, 10, "paid");
    await execute(`UPDATE blocks SET pending_image = $1, pending_image_mime = 'image/webp'`, [
      Buffer.from([0x52, 0x49, 0x46, 0x46]),
    ]);
    expect((await listLiveBlocks())[0].hasImage).toBe(true);
  });

  it("says a HELD block has none even when it does, because a hold publishes no pixels", async () => {
    await insert(0, 0, 10, 10, "reserved", "2999-01-01T00:00:00Z");
    await execute(`UPDATE blocks SET pending_image = $1, pending_image_mime = 'image/webp'`, [
      Buffer.from([0x52, 0x49, 0x46, 0x46]),
    ]);
    expect((await listLiveBlocks())[0].hasImage).toBe(false);
  });

  it("never selects the bytes, or the buyer's wallet, into the public payload", async () => {
    // The wallet goes in with the row rather than being UPDATEd on after: a
    // paid row's buyer_pubkey is frozen by the ownership trigger (migration
    // 005), which is the point of that trigger and would refuse this fixture.
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, buyer_pubkey, price_per_pixel_usdc, total_usdc)
       VALUES (0, 0, 10, 10, 'paid', 'AWalletNobodyMayLearn', 1000000, 100000000)`,
    );
    const [block] = await listLiveBlocks();
    expect(Object.keys(block).sort()).toEqual(
      ["caption", "h", "hasImage", "id", "imageFit", "link", "status", "w", "x", "y"],
    );
  });

  /**
   * A hold's words are as unpaid as its pixels.
   *
   * Reserving costs nothing and lasts half an hour. Before this, the board
   * published a reservation's caption and link to every visitor, which made a
   * free hold into free hosting for a phishing link, repeatable for as long
   * as somebody cared to keep re-reserving. The bytes were already protected;
   * these are the same rule applied to the text.
   */
  it("publishes no caption and no link for a held block, however filled in it is", async () => {
    await insert(0, 0, 10, 10, "reserved", "2999-01-01T00:00:00Z");
    await execute(
      `UPDATE blocks SET caption = 'Free money', link = 'https://not-really-us.example/', image_fit = 'cover'`,
    );
    const [block] = await listLiveBlocks();
    expect(block.status).toBe("reserved");
    expect(block.caption).toBeNull();
    expect(block.link).toBeNull();
    expect(block.imageFit).toBeNull();
  });

  it("still returns the held block itself, because the board has to draw it", async () => {
    await insert(40, 50, 20, 20, "reserved", "2999-01-01T00:00:00Z");
    await execute(`UPDATE blocks SET caption = 'Free money', link = 'https://not-really-us.example/'`);
    const blocks = await listLiveBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ x: 40, y: 50, w: 20, h: 20, status: "reserved" });
  });

  it("publishes a paid block's caption and link, which is what somebody bought", async () => {
    await insert(0, 0, 10, 10, "paid");
    await execute(`UPDATE blocks SET caption = 'My shop', link = 'https://example.com/shop'`);
    const [block] = await listLiveBlocks();
    expect(block.caption).toBe("My shop");
    expect(block.link).toBe("https://example.com/shop");
  });

  it("publishes a minted block's caption and link too", async () => {
    await insert(0, 0, 10, 10, "minted");
    await execute(`UPDATE blocks SET caption = 'Minted', link = 'https://example.com/minted'`);
    const [block] = await listLiveBlocks();
    expect(block.caption).toBe("Minted");
    expect(block.link).toBe("https://example.com/minted");
  });

  /**
   * The canvas cannot draw an image correctly without knowing which fit its
   * buyer chose. It used to stretch every bitmap to the block's shape; now it
   * letterboxes or crops, and this is the column that tells it which.
   */
  it("tells the canvas the fit a sold block's buyer chose", async () => {
    await insert(0, 0, 10, 10, "paid");
    await execute(`UPDATE blocks SET image_fit = 'contain'`);
    expect((await listLiveBlocks())[0].imageFit).toBe("contain");

    await execute(`UPDATE blocks SET image_fit = 'cover'`);
    expect((await listLiveBlocks())[0].imageFit).toBe("cover");
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

  /**
   * A hold that ends takes the buyer's image, link and caption with it.
   *
   * That is true by construction — the sweep DELETEs the whole row, so there
   * is nothing left to hold anything — and it was asserted nowhere, which
   * means the day somebody turns this into a soft delete (a status change, a
   * `deleted_at`, a row kept "for analytics") the promise would break in
   * silence. This test is what breaks instead: it fails the moment an
   * abandoned upload survives the hold it was attached to.
   */
  it("takes the image, the link and the caption with it, because it deletes the whole row", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, "BuyerPubkey1111", "f".repeat(64));
    const image = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .png()
      .toBuffer();
    const validated = await validateContent({
      bytes: image,
      declaredMime: "image/png",
      link: "https://example.com/secret",
      caption: "Their caption",
      imageFit: "contain",
    });
    if (!validated.ok) throw new Error("the fixture content should validate");
    await attachContent(held.id, "BuyerPubkey1111", validated.content);

    // It really was stored before the sweep, or the assertion after it would
    // pass against a row that never had content in the first place.
    const before = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM blocks
        WHERE id = $1 AND pending_image IS NOT NULL AND link IS NOT NULL AND caption IS NOT NULL`,
      [held.id],
    );
    expect(before[0].n).toBe("1");

    await execute("UPDATE blocks SET expires_at = now() - interval '1 minute' WHERE id = $1", [held.id]);
    expect(await sweepExpiredReservations()).toBe(1);

    // Not "the row is no longer live" — the row, and every byte of what the
    // buyer put in it, is gone from the table.
    const after = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM blocks
        WHERE id = $1 OR pending_image IS NOT NULL OR link IS NOT NULL OR caption IS NOT NULL`,
      [held.id],
    );
    expect(after[0].n).toBe("0");
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
