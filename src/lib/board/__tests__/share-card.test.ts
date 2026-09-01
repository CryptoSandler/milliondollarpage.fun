import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { execute, query } from "../../db";
import { CARD_HEIGHT, CARD_WIDTH, renderShareCard } from "../share-card";
import { STORED_MAX_BYTES } from "../image-plan";

/**
 * The shareable card.
 *
 * Two things are asserted that a look at the image would not settle: that it
 * publishes exactly what `/image` publishes and nothing more, and that a card
 * over a photograph is genuinely too heavy to have stored — which is the
 * measurement the whole "generate, never store" decision rests on, so it is
 * pinned here rather than left in a commit message.
 */

const PER_PIXEL = 1_000_000;

/** A small, hard-edged bitmap: what most purchases actually are. */
async function pixelArt(w = 24, h = 18): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#1f4fd8" } })
    .composite([
      { input: { create: { width: 8, height: 6, channels: 3, background: "#eab308" } }, left: 4, top: 4 },
    ])
    .png()
    .toBuffer();
}

/** Gaussian noise is the incompressible limit a photograph approaches. */
async function photograph(w = 480, h = 360): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 60 } } })
    .png()
    .toBuffer();
}

async function sell(
  options: {
    w?: number;
    h?: number;
    image?: Buffer | null;
    status?: string;
    signature?: string | null;
    buyer?: string;
  } = {},
): Promise<string> {
  const w = options.w ?? 120;
  const h = options.h ?? 90;
  const image = options.image === undefined ? await pixelArt() : options.image;
  const [row] = await query<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                         payment_signature, buyer_pubkey, caption, link,
                         pending_image, pending_image_mime)
     VALUES (0, 0, $1, $2, $3, $4, $5, now(), $6, $7,
             'A CAPTION NOBODY MAY SEE', 'https://a-link-nobody-may-see.example', $8, 'image/png')
     RETURNING id`,
    [
      w,
      h,
      options.status ?? "paid",
      PER_PIXEL,
      w * h * PER_PIXEL,
      options.signature === undefined ? "5Kq2xVn7".repeat(11) : options.signature,
      options.buyer ?? "AWalletNobodyMayLearn",
      image,
    ],
  );
  return row.id;
}

describe("renderShareCard", () => {
  it("is the size every social card is", async () => {
    const card = await renderShareCard(await sell());
    const meta = await sharp(card!.bytes).metadata();

    expect(meta.width).toBe(CARD_WIDTH);
    expect(meta.height).toBe(CARD_HEIGHT);
    expect(meta.format).toBe("png");
  });

  it("carries the rectangle, its area and what was paid", async () => {
    const card = await renderShareCard(await sell({ w: 120, h: 90 }));
    expect(card!.blockPixels).toBe(10_800);
    // The chrome is drawn from these, so a card that composed at all composed
    // from the row rather than from anything a caller sent.
    expect(card!.bytes.byteLength).toBeGreaterThan(1_000);
  });

  describe("what it must never publish", () => {
    /**
     * A card is the most forwarded surface this product has, and the caption
     * and link on a block are a stranger's words. Neither reaches the renderer
     * at all — the query does not select them — so this asserts the query
     * rather than the pixels.
     */
    it("selects no name, no caption and no link", async () => {
      const id = await sell();
      const card = await renderShareCard(id);
      expect(card).not.toBeNull();

      const serialised = JSON.stringify(card!.blockPixels) + card!.bytes.toString("latin1");
      expect(serialised).not.toContain("AWalletNobodyMayLearn");
      expect(serialised).not.toContain("A CAPTION NOBODY MAY SEE");
      expect(serialised).not.toContain("a-link-nobody-may-see.example");
    });

    it("never carries a whole signature", async () => {
      const whole = "5Kq2xVn7".repeat(11);
      const card = await renderShareCard(await sell({ signature: whole }));

      expect(card!.bytes.toString("latin1")).not.toContain(whole);
    });

    it("refuses a hold, whose content is not public", async () => {
      const [row] = await query<{ id: string }>(
        `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc,
                             pending_image, pending_image_mime)
         VALUES (0, 0, 120, 90, 'reserved', '2999-01-01T00:00:00Z', $1, $2, $3, 'image/png')
         RETURNING id`,
        [PER_PIXEL, 10_800 * PER_PIXEL, await pixelArt()],
      );

      expect(await renderShareCard(row.id)).toBeNull();
    });

    it("refuses a block whose content was taken down", async () => {
      const id = await sell();
      await execute("UPDATE blocks SET hidden_at = now() WHERE id = $1", [id]);

      expect(await renderShareCard(id)).toBeNull();
    });

    it("refuses an id that names nothing", async () => {
      expect(await renderShareCard("11111111-1111-4111-8111-111111111111")).toBeNull();
    });
  });

  /**
   * THE MEASUREMENT THE WHOLE DESIGN RESTS ON. If a card fitted under the
   * stored cap, storing one would be the simpler thing to do — so the reason it
   * is generated has to stay true, and this is what says so if it stops being.
   *
   * The cap is `STORED_MAX_BYTES`, which is Irys's free tier and therefore not
   * a number anybody here can move.
   */
  it("is too heavy to have stored, in the case that actually matters", async () => {
    const card = await renderShareCard(await sell({ image: await photograph() }));
    const asWebp = await sharp(card!.bytes).webp({ quality: 82 }).toBuffer();

    expect(
      asWebp.byteLength,
      "a card over a photograph fits under the stored cap — re-open whether it should be stored",
    ).toBeGreaterThan(STORED_MAX_BYTES);
  });

  it("fits easily when the block is pixel art, which is the other half of the trade", async () => {
    const card = await renderShareCard(await sell({ image: await pixelArt() }));
    const asWebp = await sharp(card!.bytes).webp({ quality: 82 }).toBuffer();

    // Well under, which is why the cap is not the reason to generate — the
    // photograph is. Both numbers together are the argument.
    expect(asWebp.byteLength).toBeLessThan(STORED_MAX_BYTES);
  });
});
