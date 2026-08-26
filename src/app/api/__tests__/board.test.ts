import { describe, expect, it } from "vitest";
import { execute } from "../../../lib/db";
import { GET } from "../board/route";

async function insert(x: number, y: number, w: number, h: number, status: string): Promise<void> {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, caption, link, price_per_pixel_usdc, total_usdc)
     VALUES ($1, $2, $3, $4, $5, 'A caption', 'https://example.com', 1000000, $6)`,
    [x, y, w, h, status, w * h * 1000000],
  );
}

describe("GET /api/board", () => {
  it("serves an empty board without failing", async () => {
    const body = await (await GET()).json();
    expect(body.blocks).toEqual([]);
    expect(body.stats).toEqual({ pixelsSold: 0, blocksSold: 0, percentSold: 0 });
    expect(body.pricePerPixelBaseUnits).toBe(1_000_000);
  });

  it("serves the blocks a canvas needs to draw, with their hover text", async () => {
    await insert(120, 340, 50, 20, "minted");
    const body = await (await GET()).json();
    expect(body.blocks).toHaveLength(1);
    expect(body.blocks[0]).toMatchObject({
      x: 120,
      y: 340,
      w: 50,
      h: 20,
      caption: "A caption",
      link: "https://example.com",
    });
  });

  it("counts sold pixels in the stats", async () => {
    await insert(0, 0, 100, 100, "minted");
    const body = await (await GET()).json();
    expect(body.stats.pixelsSold).toBe(10_000);
    expect(body.stats.percentSold).toBeCloseTo(1, 10);
  });

  it("tells the canvas which blocks have a bitmap to fetch", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc,
                           pending_image, pending_image_mime)
       VALUES (260, 490, 10, 10, 'paid', 1000000, 100000000, $1, 'image/webp')`,
      [Buffer.from([1, 2, 3])],
    );
    await insert(0, 0, 10, 10, "minted");
    const body = await (await GET()).json();
    const withImage = body.blocks.filter((b: { hasImage: boolean }) => b.hasImage);
    expect(withImage).toHaveLength(1);
    expect(withImage[0]).toMatchObject({ x: 260, y: 490 });
  });

  /**
   * The board is one public, unauthenticated payload with no reader to be the
   * owner of anything, so a hold's words are absent from it for everybody —
   * including the buyer, who reads their own back from their order instead.
   */
  it("keeps a held block's caption and link to itself, which is what makes a free hold worthless to abuse", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, expires_at, caption, link, price_per_pixel_usdc, total_usdc)
       VALUES (0, 0, 10, 10, 'reserved', '2999-01-01T00:00:00Z',
               'Claim your airdrop', 'https://not-really-us.example/claim', 1000000, 100000000)`,
    );
    const response = await GET();
    const raw = await response.text();
    expect(raw).not.toContain("Claim your airdrop");
    expect(raw).not.toContain("not-really-us.example");

    const body = JSON.parse(raw);
    expect(body.blocks).toHaveLength(1);
    expect(body.blocks[0]).toMatchObject({ status: "reserved", caption: null, link: null });
  });

  it("publishes a sold block's caption and link to everyone, because somebody paid for them", async () => {
    await insert(10, 0, 10, 10, "paid");
    await insert(20, 0, 10, 10, "minted");
    const body = await (await GET()).json();
    expect(body.blocks).toHaveLength(2);
    for (const block of body.blocks) {
      expect(block.caption).toBe("A caption");
      expect(block.link).toBe("https://example.com");
    }
  });

  it("tells the canvas which fit a sold block chose, so it stops squashing people's photographs", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, image_fit, price_per_pixel_usdc, total_usdc)
       VALUES (260, 490, 10, 10, 'paid', 'contain', 1000000, 100000000)`,
    );
    const body = await (await GET()).json();
    expect(body.blocks[0].imageFit).toBe("contain");
  });

  it("keeps a held block's upload to itself, however far along it is", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc,
                           pending_image, pending_image_mime)
       VALUES (0, 0, 10, 10, 'reserved', '2999-01-01T00:00:00Z', 1000000, 100000000, $1, 'image/webp')`,
      [Buffer.from([1, 2, 3])],
    );
    const body = await (await GET()).json();
    expect(body.blocks[0].hasImage).toBe(false);
  });

  it("never ships the bytes themselves, or the one credential the site has", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, buyer_pubkey, price_per_pixel_usdc, total_usdc,
                           pending_image, pending_image_mime)
       VALUES (0, 0, 10, 10, 'paid', 'AWalletNobodyMayLearn', 1000000, 100000000, $1, 'image/webp')`,
      [Buffer.from([1, 2, 3])],
    );
    const raw = await (await GET()).text();
    expect(raw).not.toContain("AWalletNobodyMayLearn");
    expect(raw).not.toContain("buyerPubkey");
    expect(raw).not.toContain("pending_image");
    // The whole payload for one block stays a few hundred bytes: a boolean,
    // not a bitmap.
    expect(raw.length).toBeLessThan(500);
  });

  it("is never cached, because a reservation changes the board within seconds", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
