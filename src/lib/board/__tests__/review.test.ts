import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { execute, query } from "../../db";
import { getBlockImage, getBlockPage, listBoardRects, boardStats } from "../blocks";
import { ensureWall, wallImage } from "../composite";
import { recentPurchases } from "../tape";
import { approve, awaitingReview, awaitingReviewCount } from "../review";

/**
 * The queue between paying and being painted, checked from both sides.
 *
 * THE HALF THAT IS EASY TO GET WRONG IS THE SECOND ONE. That an unapproved
 * picture stays off the wall is the feature; that the SALE is completely
 * unaffected is the design, and it is the half a careless implementation
 * breaks — a fourth status would have taken the purchase out of the register,
 * out of `/stats` and out of the buyer's own page at the same time.
 *
 * `DECISIONS.md`: "The sale is not pending — the publication is."
 */
const PER_PIXEL = 1_000_000;
let slot = 0;

async function paidBlock({ approved }: { approved: boolean }): Promise<string> {
  const x = 100 + slot++ * 30;
  const image = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer();

  const rows = await query<{ id: string }>(
    `INSERT INTO blocks (id, x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                         owner_address, payment_signature, caption, link,
                         pending_image, pending_image_mime, image_fit, approved_at)
     VALUES ($1, $2, 500, 10, 10, 'paid', $3, $4, now(), 'OwnerPubkey1111', $5,
             'A caption', 'https://example.com/', $6, 'image/png', 'contain', $7)
     RETURNING id`,
    [randomUUID(), x, PER_PIXEL, 100 * PER_PIXEL, `sig-${slot}`, image, approved ? new Date() : null],
  );
  return rows[0].id;
}

describe("a purchase that nobody has looked at yet", () => {
  /**
   * IT IS STILL A RECTANGLE ON THE BOARD, and that is the same rule a takedown
   * already follows: those pixels are sold, nobody else may buy them, and the
   * board has to hit-test them or it would offer them for sale twice. What
   * waits is the PICTURE — so the rectangle is listed and the bytes are not
   * served, which is exactly the shape `blocks.ts` describes for a hidden
   * block above `LIVE`.
   *
   * The first version of this test asserted the rectangle was absent, and the
   * suite was right to refuse it: that would have been a sold rectangle the
   * board would happily sell again.
   */
  it("is still a rectangle nobody else can buy, but its bytes are not served", async () => {
    const id = await paidBlock({ approved: false });

    expect((await listBoardRects()).find((rect) => rect.id === id)).toBeDefined();
    expect(await getBlockImage(id)).toBeNull();
  });

  it("still has a page, and the page says it is in review", async () => {
    const id = await paidBlock({ approved: false });
    const page = await getBlockPage(id);
    // A 404 here would be the site losing a purchase in front of the person who
    // just made it.
    expect(page).not.toBeNull();
    expect(page!.approvedAt).toBeNull();
  });

  /**
   * THE SALE IS NOT WAITING, and these are the four places that would have gone
   * quiet if the queue had been a status instead of a column.
   */
  it("is still a sale everywhere a sale is counted", async () => {
    const before = await boardStats();
    const id = await paidBlock({ approved: false });
    const after = await boardStats();

    expect(after.pixelsSold - before.pixelsSold).toBe(100);
    expect((await recentPurchases()).some((row) => row.id === id)).toBe(true);
    const rows = await query<{ status: string }>("SELECT status FROM blocks WHERE id = $1", [id]);
    expect(rows[0].status).toBe("paid");
  });

  it("is in the queue, oldest first", async () => {
    const first = await paidBlock({ approved: false });
    await execute("UPDATE blocks SET paid_at = now() - interval '1 hour' WHERE id = $1", [first]);
    const second = await paidBlock({ approved: false });

    const waiting = await awaitingReview();
    expect(waiting.map((row) => row.id).slice(0, 2)).toEqual([first, second]);
    expect(await awaitingReviewCount()).toBe(waiting.length);
  });
});

describe("approving one", () => {
  it("puts the picture on the wall and hands the bytes back", async () => {
    const id = await paidBlock({ approved: false });
    expect(await approve(id, "looked at it")).not.toBeNull();

    expect(await getBlockImage(id)).not.toBeNull();
    expect((await getBlockPage(id))!.approvedAt).not.toBeNull();
  });

  it("is drawn into the composite, which an unapproved one is not", async () => {
    const id = await paidBlock({ approved: false });
    const pending = await ensureWall();
    await approve(id, "");
    const published = await ensureWall();
    // A different wall, because a rectangle appeared on it. If approval did not
    // reach the composite these two versions would be the same hash.
    expect(published!.version).not.toBe(pending!.version);

    const image = await wallImage(published!.version);
    const { data, info } = await sharp(image!.bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rect = (await listBoardRects()).find((candidate) => candidate.id === id)!;
    const at = ((rect.y + 5) * info.width + rect.x + 5) * 4;
    expect(data[at + 3]).toBe(255);
  });

  /**
   * IDEMPOTENT BY THE `IS NULL`, not by a read-then-write. Two operators
   * pressing the button at the same moment is one row changed and one honest
   * "nothing happened".
   */
  it("does nothing the second time, and says so", async () => {
    const id = await paidBlock({ approved: false });
    expect(await approve(id, "")).not.toBeNull();
    expect(await approve(id, "")).toBeNull();
  });

  it("does nothing for an id that names no sale", async () => {
    expect(await approve(randomUUID(), "")).toBeNull();
  });
});
