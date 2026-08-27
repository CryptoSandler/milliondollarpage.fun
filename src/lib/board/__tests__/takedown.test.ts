import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { execute, query, queryOne } from "../../db";
import { GET as detailsRoute } from "../../../app/api/blocks/[id]/route";
import { GET as imageRoute } from "../../../app/api/blocks/[id]/image/route";
import { getBlockImage } from "../blocks";
import { ensureWall, wallPng } from "../composite";
import { reserveRect } from "../reserve";

/**
 * What a takedown does, and — far more importantly — what it does not do.
 *
 * Every assertion here reads the DATABASE or an ENDPOINT's own answer. Nothing
 * recomputes the rule from the SQL the code writes: a guard that rebuilt the
 * predicate would pass against a schema with the flag missing entirely.
 *
 * The rule being guarded is SECURITY.md's: "normal = bandera de visibilidad,
 * contenido intacto y reversible; legal = purga real de bytes cuando la ley
 * obliga, la propiedad del rectángulo NO se transfiere ni se pierde." Migration
 * 006 is the mechanism; this is the proof.
 */

const OWNER = "OwnerWalletAddress11111111111111";
const PICTURE = Buffer.from("RIFF....WEBPVP8 a picture somebody paid for", "utf8");

/** A real, decodable picture, for the assertions that sample the wall. */
async function magenta(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 250, g: 0, b: 250 } } })
    .png()
    .toBuffer();
}

async function sold(x = 0): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, buyer_pubkey, caption, link,
                         price_per_pixel_usdc, total_usdc,
                         pending_image, pending_image_mime, image_sha256)
     VALUES ($1, 0, 20, 20, 'paid', $2, 'My shop', 'https://example.com/shop',
             1000000, 400000000, $3, 'image/webp', $4)
     RETURNING id`,
    [x, OWNER, PICTURE, "a".repeat(64)],
  );
  return row!.id;
}

async function hide(id: string): Promise<void> {
  await execute("UPDATE blocks SET hidden_at = now(), takedown_reason = $2 WHERE id = $1", [
    id,
    "a report we are still checking",
  ]);
}

async function fetchImage(id: string): Promise<Response> {
  return imageRoute(new Request(`http://localhost/api/blocks/${id}/image`), {
    params: Promise.resolve({ id }),
  });
}

async function fetchDetails(id: string): Promise<Response> {
  return detailsRoute(new Request(`http://localhost/api/blocks/${id}`), {
    params: Promise.resolve({ id }),
  });
}

/** One pixel of the current wall, decoded. */
async function wallPixelAt(x: number, y: number) {
  const wall = await ensureWall();
  if (!wall) throw new Error("there should be a wall");
  const png = await wallPng(wall.version);
  const { data, info } = await sharp(png!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * 4;
  return { r: data[at], g: data[at + 1], b: data[at + 2], a: data[at + 3] };
}

describe("a normal takedown", () => {
  it("stops the image route serving the bytes", async () => {
    const id = await sold();
    expect((await fetchImage(id)).status).toBe(200);
    await hide(id);
    expect((await fetchImage(id)).status).toBe(404);
  });

  it("stops the words being published, without deleting them", async () => {
    const id = await sold();
    await hide(id);
    expect(await getBlockImage(id)).toBeNull();

    // Still in the row, untouched. This is the half that makes it reversible,
    // and it is the half a status change could not have given us.
    const row = await queryOne<{ caption: string; link: string; n: number }>(
      "SELECT caption, link, octet_length(pending_image) AS n FROM blocks WHERE id = $1",
      [id],
    );
    expect(row).toMatchObject({ caption: "My shop", link: "https://example.com/shop" });
    expect(Number(row!.n)).toBe(PICTURE.byteLength);
  });

  it("gives the same picture back, byte for byte, when the flag is cleared", async () => {
    const id = await sold();
    const before = await fetchImage(id);
    const bytesBefore = Buffer.from(await before.arrayBuffer());

    await hide(id);
    expect((await fetchImage(id)).status).toBe(404);

    await execute("UPDATE blocks SET hidden_at = NULL, takedown_reason = NULL WHERE id = $1", [id]);
    const after = await fetchImage(id);
    expect(after.status).toBe(200);
    expect(after.headers.get("content-type")).toBe(before.headers.get("content-type"));
    expect(Buffer.compare(Buffer.from(await after.arrayBuffer()), bytesBefore)).toBe(0);
  });

  it("stops the words being served by the route that hands them out one at a time", async () => {
    const id = await sold();
    expect((await fetchDetails(id)).status).toBe(200);
    await hide(id);
    const raw = await (await fetchDetails(id)).text();
    expect(raw).not.toContain("My shop");
    expect(raw).not.toContain("example.com");
    expect(JSON.parse(raw)).toMatchObject({ caption: null, link: null });
  });

  /**
   * The takedown's whole effect on the render, sampled rather than reasoned
   * about: the pixels the rectangle covers go back to transparent, which is
   * what the canvas draws the paper through.
   */
  it("contributes nothing to the composite wall", async () => {
    const id = await sold();
    await execute("UPDATE blocks SET pending_image = $2, pending_image_mime = 'image/png' WHERE id = $1", [
      id,
      await magenta(),
    ]);
    expect(await wallPixelAt(10, 10)).toMatchObject({ r: 250, g: 0, b: 250, a: 255 });

    await hide(id);
    expect((await wallPixelAt(10, 10)).a).toBe(0);

    // And it comes back, unchanged, when the flag is cleared.
    await execute("UPDATE blocks SET hidden_at = NULL WHERE id = $1", [id]);
    expect(await wallPixelAt(10, 10)).toMatchObject({ r: 250, g: 0, b: 250, a: 255 });
  });

  it("leaves the rectangle sold, so nobody else can reserve it", async () => {
    const id = await sold();
    await hide(id);
    await expect(
      reserveRect({ x: 0, y: 0, w: 20, h: 20 }, "SomebodyElse2222222222", "d".repeat(64)),
    ).rejects.toThrow();

    const rows = await query<{ status: string; buyer_pubkey: string }>(
      "SELECT status, buyer_pubkey FROM blocks WHERE id = $1",
      [id],
    );
    expect(rows[0]).toEqual({ status: "paid", buyer_pubkey: OWNER });
  });
});

describe("a legal purge", () => {
  it("destroys the bytes and the words", async () => {
    const id = await sold();
    await execute("SELECT block_purge_content($1, $2)", [id, "a court order"]);

    const row = await queryOne<{
      pending_image: Buffer | null;
      pending_image_mime: string | null;
      image_sha256: string | null;
      caption: string | null;
      link: string | null;
      purged_at: Date | null;
    }>(
      `SELECT pending_image, pending_image_mime, image_sha256, caption, link, purged_at
         FROM blocks WHERE id = $1`,
      [id],
    );
    expect(row!.pending_image).toBeNull();
    expect(row!.pending_image_mime).toBeNull();
    expect(row!.image_sha256).toBeNull();
    expect(row!.caption).toBeNull();
    expect(row!.link).toBeNull();
    expect(row!.purged_at).not.toBeNull();
    expect((await fetchImage(id)).status).toBe(404);
  });

  it("leaves the row, the rectangle and the owner exactly where they were", async () => {
    const id = await sold();
    await execute("SELECT block_purge_content($1, $2)", [id, "a court order"]);

    const rows = await query<{ status: string; buyer_pubkey: string; x: number; w: number }>(
      "SELECT status, buyer_pubkey, x, w FROM blocks WHERE id = $1",
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ status: "paid", buyer_pubkey: OWNER, x: 0, w: 20 });
  });

  it("does not put the pixels back on sale either", async () => {
    const id = await sold();
    await execute("SELECT block_purge_content($1, $2)", [id, "a court order"]);
    await expect(
      reserveRect({ x: 10, y: 0, w: 5, h: 5 }, "SomebodyElse2222222222", "d".repeat(64)),
    ).rejects.toThrow();
    expect(await query("SELECT id FROM blocks WHERE id = $1", [id])).toHaveLength(1);
  });

  it("takes the pixels off the wall as well as out of the row", async () => {
    const id = await sold();
    await execute("UPDATE blocks SET pending_image = $2, pending_image_mime = 'image/png' WHERE id = $1", [
      id,
      await magenta(),
    ]);
    expect((await wallPixelAt(10, 10)).a).toBe(255);
    await execute("SELECT block_purge_content($1, $2)", [id, "a court order"]);
    expect((await wallPixelAt(10, 10)).a).toBe(0);
  });

  it("hides as well as erasing, so nothing is left claiming to be publishable", async () => {
    const id = await sold();
    await execute("SELECT block_purge_content($1, $2)", [id, "a court order"]);
    const rows = await query<{ hidden_at: Date | null }>(
      "SELECT hidden_at FROM blocks WHERE id = $1",
      [id],
    );
    expect(rows[0].hidden_at).not.toBeNull();
  });

  it("refuses to touch a hold, which has nothing anybody bought", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, OWNER, "e".repeat(64));
    await execute("SELECT block_purge_content($1, $2)", [held.id, "a court order"]);
    const rows = await query<{ status: string; purged_at: Date | null }>(
      "SELECT status, purged_at FROM blocks WHERE id = $1",
      [held.id],
    );
    expect(rows[0]).toEqual({ status: "reserved", purged_at: null });
  });
});
