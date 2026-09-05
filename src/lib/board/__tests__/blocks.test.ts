import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { execute, query } from "../../db";
import { boardStats, getBlockDetails, listBoardRects, sweepExpiredReservations } from "../blocks";
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
    `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc, approved_at)
     VALUES ($1, $2, $3, $4, $5, $6, 1000000, $7, CASE WHEN $5 IN ('paid','minted') THEN now() END)`,
    [x, y, w, h, status, expiresAt, w * h * 1000000],
  );
}

describe("listBoardRects", () => {
  it("returns nothing for an empty board", async () => {
    expect(await listBoardRects()).toEqual([]);
  });

  it("includes reserved, paid and minted rectangles, because all three hold pixels", async () => {
    await insert(0, 0, 10, 10, "reserved", "2999-01-01T00:00:00Z");
    await insert(10, 0, 10, 10, "paid");
    await insert(20, 0, 10, 10, "minted");
    const rects = await listBoardRects();
    expect(rects.map((r) => r.status).sort()).toEqual(["minted", "paid", "reserved"]);
  });

  /**
   * The reversal migration 006 made. A takedown used to be a status the
   * overlap constraint ignored, which put the rectangle back on sale; it is a
   * flag on a row that stays sold, so the rectangle is still HERE — the board
   * has to keep those pixels out of the selector — and only its content goes.
   */
  it("still returns a taken-down rectangle, because its pixels are still not for sale", async () => {
    await insert(0, 0, 10, 10, "paid");
    await execute("UPDATE blocks SET hidden_at = now()");
    const rects = await listBoardRects();
    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ status: "paid", x: 0, y: 0, w: 10, h: 10 });
  });

  it("excludes reservations that have already expired", async () => {
    await insert(0, 0, 10, 10, "reserved", "2000-01-01T00:00:00Z");
    expect(await listBoardRects()).toEqual([]);
  });

  it("returns coordinates a canvas can hit-test without further arithmetic", async () => {
    await insert(120, 340, 50, 20, "minted");
    const [rect] = await listBoardRects();
    expect(rect).toMatchObject({ x: 120, y: 340, w: 50, h: 20 });
  });

  /**
   * The whole point of the new shape: an id and four numbers. Every caption,
   * link, fit and image flag that used to ride along here is gone — the
   * artwork is one composite bitmap and the words are fetched per rectangle —
   * and this is the assertion that fails the day one of them creeps back in
   * and turns a payload of tens of thousands of rectangles into a payload of
   * tens of thousands of captions.
   */
  it("carries no content at all, and never the buyer's wallet", async () => {
    // The wallet goes in with the row rather than being UPDATEd on after: a
    // paid row's owner_address is frozen by the ownership trigger (migration
    // 005), which is the point of that trigger and would refuse this fixture.
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, owner_address, caption, link, image_fit,
                           price_per_pixel_usdc, total_usdc, pending_image, pending_image_mime, approved_at)
       VALUES (0, 0, 10, 10, 'paid', 'AWalletNobodyMayLearn', 'My shop',
               'https://example.com/shop', 'cover', 1000000, 100000000, $1, 'image/webp', now())`,
      [Buffer.from([0x52, 0x49, 0x46, 0x46])],
    );
    const [rect] = await listBoardRects();
    expect(Object.keys(rect).sort()).toEqual(["h", "id", "status", "w", "x", "y"]);
  });
});

describe("getBlockDetails", () => {
  it("returns nothing for a well-formed id that names no rectangle", async () => {
    expect(await getBlockDetails("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("publishes a paid rectangle's caption and link, which is what somebody bought", async () => {
    await insert(0, 0, 10, 10, "paid");
    await execute(`UPDATE blocks SET caption = 'My shop', link = 'https://example.com/shop'`);
    const [rect] = await listBoardRects();
    const details = await getBlockDetails(rect.id);
    expect(details).toMatchObject({
      caption: "My shop",
      link: "https://example.com/shop",
      x: 0,
      w: 10,
      status: "paid",
    });
  });

  it("publishes a minted rectangle's caption and link too", async () => {
    await insert(0, 0, 10, 10, "minted");
    await execute(`UPDATE blocks SET caption = 'Minted', link = 'https://example.com/minted'`);
    const [rect] = await listBoardRects();
    expect(await getBlockDetails(rect.id)).toMatchObject({
      caption: "Minted",
      link: "https://example.com/minted",
    });
  });

  /**
   * A hold's words are as unpaid as its pixels.
   *
   * Reserving costs nothing and lasts half an hour. Before this rule existed,
   * the board published a reservation's caption and link to every visitor,
   * which made a free hold into free hosting for a phishing link, repeatable
   * for as long as somebody cared to keep re-reserving. Moving the words onto
   * their own route does not move the rule with them.
   */
  it("publishes no caption and no link for a hold, however filled in it is", async () => {
    await insert(0, 0, 10, 10, "reserved", "2999-01-01T00:00:00Z");
    await execute(
      `UPDATE blocks SET caption = 'Free money', link = 'https://not-really-us.example/'`,
    );
    const [rect] = await listBoardRects();
    const details = await getBlockDetails(rect.id);
    expect(details).toMatchObject({ status: "reserved", caption: null, link: null });
  });

  it("publishes none of a taken-down rectangle's words, and still gives its shape", async () => {
    await insert(0, 0, 10, 10, "paid");
    await execute(
      `UPDATE blocks SET caption = 'My shop', link = 'https://example.com/shop', hidden_at = now()`,
    );
    const [rect] = await listBoardRects();
    expect(await getBlockDetails(rect.id)).toMatchObject({
      status: "paid",
      caption: null,
      link: null,
      w: 10,
      h: 10,
    });
  });

  it("returns nothing for an expired hold, the same as for a rectangle that never existed", async () => {
    await insert(0, 0, 10, 10, "reserved", "2999-01-01T00:00:00Z");
    const [rect] = await listBoardRects();
    await execute("UPDATE blocks SET expires_at = '2000-01-01T00:00:00Z' WHERE id = $1", [rect.id]);
    expect(await getBlockDetails(rect.id)).toBeNull();
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
    expect(await listBoardRects()).toEqual([]);
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
    expect(await listBoardRects()).toHaveLength(1);
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
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, { chain: "solana", address: "BuyerPubkey1111" }, "f".repeat(64));
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
      block: { width: 10, height: 10 },
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
