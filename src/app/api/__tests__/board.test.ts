import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { execute } from "../../../lib/db";
import { GET } from "../board/route";
import { TAPE_ROWS } from "../../../lib/board/tape";

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
    expect(body.rects).toEqual([]);
    expect(body.stats).toEqual({ pixelsSold: 0, blocksSold: 0, percentSold: 0 });
    expect(body.pricePerPixelBaseUnits).toBe(1_000_000);
  });

  it("serves the rectangles a canvas needs to hit-test", async () => {
    await insert(120, 340, 50, 20, "minted");
    const body = await (await GET()).json();
    expect(body.rects).toHaveLength(1);
    expect(body.rects[0]).toMatchObject({ x: 120, y: 340, w: 50, h: 20, status: "minted" });
  });

  it("counts sold pixels in the stats", async () => {
    await insert(0, 0, 100, 100, "minted");
    const body = await (await GET()).json();
    expect(body.stats.pixelsSold).toBe(10_000);
    expect(body.stats.percentSold).toBeCloseTo(1, 10);
  });

  /**
   * The representation change, as one assertion.
   *
   * A rectangle is an id and four numbers. Everything a block used to carry
   * along with it — its caption, its link, its fit, a flag saying it had a
   * bitmap of its own to go and fetch — belongs to the composite wall or to
   * the on-demand route now. This is what fails the day one creeps back in.
   */
  it("ships no content whatsoever in the rectangle list", async () => {
    await insert(120, 340, 50, 20, "minted");
    const raw = await (await GET()).text();
    expect(raw).not.toContain("A caption");
    expect(raw).not.toContain("https://example.com");
    expect(raw).not.toContain("hasImage");
    expect(raw).not.toContain("imageFit");

    const body = JSON.parse(raw);
    expect(Object.keys(body.rects[0]).sort()).toEqual(["h", "id", "status", "w", "x", "y"]);
  });

  it("points at one versioned wall rather than one bitmap per purchase", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc,
                           pending_image, pending_image_mime, image_fit)
       VALUES (260, 490, 10, 10, 'paid', 1000000, 100000000, $1, 'image/png', 'cover')`,
      [
        await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } } })
          .png()
          .toBuffer(),
      ],
    );
    const body = await (await GET()).json();
    expect(body.wall.width).toBe(1250);
    expect(body.wall.height).toBe(800);
    expect(body.wall.version).toMatch(/^[0-9a-f]{64}$/);
    expect(body.wall.url).toBe(`/api/wall/${body.wall.version}`);
  });

  it("keeps the digest it decides rebuilds by to itself", async () => {
    const raw = await (await GET()).text();
    expect(raw).not.toContain("fingerprint");
  });

  /**
   * A takedown hides content and does not put pixels back on sale, so the
   * rectangle stays in this list and its words stay out of it. Both halves
   * matter: drop the rectangle and the selector starts offering pixels the
   * database will refuse.
   */
  it("still lists a taken-down rectangle, and still publishes none of its words", async () => {
    await insert(0, 0, 10, 10, "paid");
    await execute("UPDATE blocks SET hidden_at = now()");
    const raw = await (await GET()).text();
    expect(raw).not.toContain("A caption");

    const body = JSON.parse(raw);
    expect(body.rects).toHaveLength(1);
    expect(body.rects[0]).toMatchObject({ status: "paid", x: 0, y: 0 });
  });

  it("lists a held rectangle, because the board has to draw it", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, expires_at, caption, link, price_per_pixel_usdc, total_usdc)
       VALUES (0, 0, 10, 10, 'reserved', '2999-01-01T00:00:00Z',
               'Claim your airdrop', 'https://not-really-us.example/claim', 1000000, 100000000)`,
    );
    const raw = await (await GET()).text();
    expect(raw).not.toContain("Claim your airdrop");
    expect(raw).not.toContain("not-really-us.example");

    const body = JSON.parse(raw);
    expect(body.rects).toHaveLength(1);
    expect(body.rects[0].status).toBe("reserved");
  });

  it("never ships the bytes themselves, or the one credential the site has", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, buyer_pubkey, price_per_pixel_usdc, total_usdc,
                           pending_image, pending_image_mime)
       VALUES (0, 0, 10, 10, 'paid', 'AWalletNobodyMayLearn', 1000000, 100000000, $1, 'image/webp')`,
      [Buffer.from([1, 2, 3])],
    );
    const raw = await (await GET()).text();
    // The address must not appear anywhere, and this row is now on TWO
    // surfaces in this payload — the rectangle list and the settled-purchase
    // tape — so this single assertion covers both.
    expect(raw).not.toContain("AWalletNobodyMayLearn");
    expect(raw).not.toContain("buyerPubkey");
    expect(raw).not.toContain("pending_image");

    /*
      MEASURED PER RECTANGLE, NOT AS A TOTAL, and that is a correction rather
      than a relaxation.

      This used to assert the whole body stayed under 500 bytes, with a comment
      saying it was about "the payload for one rectangle". Those were the same
      number only while the body was nothing but rectangles. It now also
      carries the settled-purchase tape, which is a FIXED cost — at most
      TAPE_ROWS rows however big the board gets — so an absolute ceiling
      measures the tape and calls it the rectangle list.

      What the claim was always about is the marginal cost of one more
      purchase, so that is what is measured: add a second rectangle and weigh
      the difference. Four numbers, an id and a status is well under 150 bytes;
      a bitmap or a caption on this path would be hundreds, and a payload that
      went back to shipping either would fail this by an order of magnitude.
    */
    // Fill the tape first. It carries at most TAPE_ROWS rows however many
    // purchases exist, so the marginal cost of a purchase is only honest once
    // the fixed part has stopped growing — before that, one more purchase is
    // one rectangle AND one tape row, which is a cost that stops being paid.
    const filler = Array.from(
      { length: TAPE_ROWS + 1 },
      (_, i) => `(${(i + 2) * 20}, 0, 10, 10, 'paid', 1000000, 100000000)`,
    ).join(", ");
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc) VALUES ${filler}`,
    );

    const before = (await (await GET()).text()).length;
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc)
       VALUES (20, 0, 10, 10, 'paid', 1000000, 100000000)`,
    );
    const grown = await (await GET()).text();

    // The tape stopped growing, so the whole cost of one more purchase is its
    // rectangle: four numbers, an id and a status.
    expect(JSON.parse(grown).tape).toHaveLength(TAPE_ROWS);
    expect(grown.length - before).toBeLessThan(150);
  });

  it("is never cached, because a reservation changes the board within seconds", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
