import { describe, expect, it } from "vitest";
import { execute, queryOne } from "../../db";
import {
  IMAGE_BEARING_STATUSES,
  blockImageUrl,
  hasPublicImageSql,
  publishesText,
  publishesTextSql,
  servesImage,
} from "../block-image";
import { getBlockImage } from "../blocks";

const WEBP = Buffer.from("RIFF....WEBPVP8 fake bytes for a test", "utf8");

async function insert(
  status: string,
  image: Buffer | null,
  mime: string | null,
  x = 0,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc,
                         pending_image, pending_image_mime)
     VALUES ($1, 0, 10, 10, $2, $3, 1000000, 100000000, $4, $5)
     RETURNING id`,
    [x, status, status === "reserved" ? "2999-01-01T00:00:00Z" : null, image, mime],
  );
  return row!.id;
}

describe("servesImage", () => {
  it("publishes a paid block's pixels, because somebody bought them", () => {
    expect(servesImage("paid")).toBe(true);
  });

  it("publishes a minted block's pixels for the same reason", () => {
    expect(servesImage("minted")).toBe(true);
  });

  it("refuses a reservation: unpaid, unfinished, and nobody else's business", () => {
    expect(servesImage("reserved")).toBe(false);
  });

  it("refuses the status a takedown used to be, because migration 006 retired it", () => {
    expect(servesImage("removed")).toBe(false);
  });

  it("refuses a status it has never heard of", () => {
    expect(servesImage("")).toBe(false);
    expect(servesImage("PAID")).toBe(false);
  });

  it("agrees with the list the SQL binds", () => {
    expect([...IMAGE_BEARING_STATUSES]).toEqual(["paid", "minted"]);
    expect([...IMAGE_BEARING_STATUSES].every(servesImage)).toBe(true);
  });
});

describe("blockImageUrl", () => {
  it("maps a block id onto its own route, and nothing else", () => {
    expect(blockImageUrl("24f229b2-f126-455c-a6a0-0a68c32975b9")).toBe(
      "/api/blocks/24f229b2-f126-455c-a6a0-0a68c32975b9/image",
    );
  });
});

describe("publishesText — the same rule, applied to the caption and the link", () => {
  it("lets a sold block publish its words", () => {
    expect(publishesText("paid")).toBe(true);
    expect(publishesText("minted")).toBe(true);
  });

  it("refuses a hold, which has paid for neither its pixels nor its words", () => {
    expect(publishesText("reserved")).toBe(false);
  });

  it("refuses the retired status too, and for the same reason", () => {
    expect(publishesText("removed")).toBe(false);
  });

  /**
   * A takedown is a flag, so it is unreachable from a status. This is the one
   * pair of functions in the module allowed not to know about it, and the
   * assertion exists so that a reader who finds them answering `true` for a
   * hidden block's status does not read it as a bug in the wrong place.
   */
  it("says nothing about a takedown, which is not a status and never was", () => {
    expect(publishesText("paid")).toBe(true);
    expect(publishesTextSql(1)).toContain("hidden_at IS NULL");
  });

  /**
   * Not "these two happen to agree": the same function, so they cannot stop
   * agreeing. A second list of statuses is exactly how the text came to be
   * published when the bytes were not.
   */
  it("is the pixel predicate itself, not a copy of it", () => {
    expect(publishesText).toBe(servesImage);
  });
});

describe("publishesTextSql", () => {
  it("binds the statuses at the position it is given rather than splicing them in", () => {
    expect(publishesTextSql(1)).toContain("status = ANY($1)");
    expect(publishesTextSql(4)).toContain("status = ANY($4)");
    expect(publishesTextSql(1)).not.toContain("paid");
  });

  it("asks nothing about the bytes, which a caption does not have", () => {
    expect(publishesTextSql(1)).not.toContain("pending_image");
  });

  it("is the status half of the image test, so the two can never disagree", () => {
    expect(hasPublicImageSql(3)).toContain(publishesTextSql(3));
  });
});

describe("hasPublicImageSql", () => {
  it("binds the statuses at the position it is given rather than splicing them in", () => {
    expect(hasPublicImageSql(2)).toContain("status = ANY($2)");
    expect(hasPublicImageSql(7)).toContain("status = ANY($7)");
    expect(hasPublicImageSql(1)).not.toContain("paid");
  });

  it("demands the bytes and the mime together, never one without the other", () => {
    const sql = hasPublicImageSql(1);
    expect(sql).toContain("pending_image IS NOT NULL");
    expect(sql).toContain("pending_image_mime IS NOT NULL");
  });
});

describe("getBlockImage", () => {
  it("returns a paid block's bytes and mime exactly as stored", async () => {
    const id = await insert("paid", WEBP, "image/webp");
    const image = await getBlockImage(id);
    expect(image?.mime).toBe("image/webp");
    expect(Buffer.compare(image!.bytes, WEBP)).toBe(0);
  });

  it("returns a minted block's bytes too", async () => {
    const id = await insert("minted", WEBP, "image/png");
    expect((await getBlockImage(id))?.mime).toBe("image/png");
  });

  it("returns nothing for a reservation, however finished its upload looks", async () => {
    const id = await insert("reserved", WEBP, "image/webp");
    expect(await getBlockImage(id)).toBeNull();
  });

  it("returns nothing for a block that has been taken down, whose pixels are still its owner's", async () => {
    const id = await insert("paid", WEBP, "image/webp");
    await execute("UPDATE blocks SET hidden_at = now() WHERE id = $1", [id]);
    expect(await getBlockImage(id)).toBeNull();
  });

  it("returns nothing for a sale whose buyer uploaded nothing", async () => {
    const id = await insert("paid", null, null);
    expect(await getBlockImage(id)).toBeNull();
  });

  it("returns nothing when the bytes have no declared type, rather than guessing one", async () => {
    const id = await insert("paid", WEBP, null);
    expect(await getBlockImage(id)).toBeNull();
  });

  it("returns nothing for a well-formed id that names no block", async () => {
    expect(await getBlockImage("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("hands back one block's bytes and not a neighbour's", async () => {
    const mine = await insert("paid", WEBP, "image/webp", 0);
    const theirs = Buffer.from("a completely different picture", "utf8");
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc,
                           pending_image, pending_image_mime)
       VALUES (100, 0, 10, 10, 'paid', 1000000, 100000000, $1, 'image/png')`,
      [theirs],
    );
    expect(Buffer.compare((await getBlockImage(mine))!.bytes, WEBP)).toBe(0);
  });
});
