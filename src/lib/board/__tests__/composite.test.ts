import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { execute, query } from "../../db";
import { GET as wallRoute } from "../../../app/api/wall/[version]/route";
import { listBoardRects } from "../blocks";
import { currentWall, ensureWall, wallPng } from "../composite";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../geometry";
import { placeImage } from "../image-fit";
import { SOLD_GROUND } from "../composite";

/**
 * The wall, checked by looking at it.
 *
 * EVERY ASSERTION HERE SAMPLES THE RENDERED PNG. Nothing recomputes where a
 * rectangle ought to land from the same arithmetic `composeWall` used — a
 * guard that did that would agree with the code about a wall that was blank.
 * So the composite is decoded back to raw pixels and read at coordinates the
 * test chose, against colours the test uploaded.
 */

/**
 * Lets one test break `sharp` on purpose, so the failure path is exercised
 * rather than asserted about.
 *
 * `vi.hoisted` because `vi.mock` factories run before the module body: a plain
 * `let` would still be in its temporal dead zone when the factory executes.
 * While `broken` is false every call is the real sharp, which is what builds
 * the fixtures below.
 */
const sharpState = vi.hoisted(() => ({ broken: false }));

vi.mock("sharp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sharp")>();
  const wrapped = ((...args: unknown[]) => {
    if (sharpState.broken) throw new Error("sharp is unavailable");
    return (actual.default as (...a: unknown[]) => unknown)(...args);
  }) as unknown as typeof actual.default;
  Object.assign(wrapped, actual.default);
  return { ...actual, default: wrapped };
});

type Rgba = { r: number; g: number; b: number; a: number };

async function solidPng(size: number, colour: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: size, height: size, channels: 3, background: colour } })
    .png()
    .toBuffer();
}

/** A paid rectangle carrying a picture, inserted the way a finished order looks. */
async function buy(
  rect: { x: number; y: number; w: number; h: number },
  image: Buffer | null,
  fit: "contain" | "cover" = "cover",
): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, buyer_pubkey, image_fit,
                         price_per_pixel_usdc, total_usdc,
                         pending_image, pending_image_mime, image_sha256)
     VALUES ($1, $2, $3, $4, 'paid', 'BuyerWallet1111111111', $5, 1000000, $6, $7, $8, $9)
     RETURNING id`,
    [
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      fit,
      rect.w * rect.h * 1000000,
      image,
      image ? "image/png" : null,
      image ? createHash("sha256").update(image).digest("hex") : null,
    ],
  );
  return rows[0].id;
}

/** One pixel out of a PNG, decoded. The whole point of this file. */
async function pixelAt(png: Buffer, x: number, y: number): Promise<Rgba> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * 4;
  return { r: data[at], g: data[at + 1], b: data[at + 2], a: data[at + 3] };
}

/** The bytes the browser would actually receive for the current wall. */
async function servedWall(): Promise<{ version: string; png: Buffer }> {
  const wall = await ensureWall();
  if (!wall) throw new Error("there should be a wall");
  const response = await wallRoute(new Request(`http://localhost${wall.url}`), {
    params: Promise.resolve({ version: wall.version }),
  });
  expect(response.status).toBe(200);
  return { version: wall.version, png: Buffer.from(await response.arrayBuffer()) };
}

describe("the composite wall", () => {
  it("is exactly the wall: 1250 by 800", async () => {
    const { png } = await servedWall();
    const { width, height } = await sharp(png).metadata();
    expect({ width, height }).toEqual({ width: BOARD_WIDTH, height: BOARD_HEIGHT });
  });

  it("carries the colours of the purchases it was built from, where they were bought", async () => {
    const red = { r: 220, g: 20, b: 20 };
    const blue = { r: 20, g: 40, b: 200 };
    await buy({ x: 100, y: 100, w: 40, h: 40 }, await solidPng(80, red));
    await buy({ x: 600, y: 500, w: 30, h: 20 }, await solidPng(60, blue));

    const { png } = await servedWall();
    expect(await pixelAt(png, 120, 120)).toMatchObject({ ...red, a: 255 });
    expect(await pixelAt(png, 615, 510)).toMatchObject({ ...blue, a: 255 });
  });

  it("paints every pixel of a purchase and not one beyond it", async () => {
    const green = { r: 10, g: 180, b: 90 };
    await buy({ x: 200, y: 300, w: 20, h: 10 }, await solidPng(40, green));
    const { png } = await servedWall();

    // The four corners the rectangle owns, half-open: (200,300) through
    // (219,309). And the two pixels just outside two of them.
    for (const [x, y] of [
      [200, 300],
      [219, 300],
      [200, 309],
      [219, 309],
    ]) {
      expect(await pixelAt(png, x, y), `inside at ${x},${y}`).toMatchObject({ ...green, a: 255 });
    }
    expect(await pixelAt(png, 220, 300).then((p) => p.a)).toBe(0);
    expect(await pixelAt(png, 200, 310).then((p) => p.a)).toBe(0);
  });

  /**
   * The paper's cream means available. On the wall bitmap that is TRANSPARENT
   * rather than cream, so the canvas can draw the paper and its ruling
   * underneath and have the artwork cover them exactly where somebody bought.
   */
  it("leaves unsold pixels transparent, so the paper and its ruling show through", async () => {
    await buy({ x: 0, y: 0, w: 10, h: 10 }, await solidPng(20, { r: 1, g: 2, b: 3 }));
    const { png } = await servedWall();
    expect((await pixelAt(png, 900, 700)).a).toBe(0);
    expect((await pixelAt(png, 10, 0)).a).toBe(0);
  });

  it("composites an upload with an alpha channel onto the sold ground", async () => {
    const transparent = await sharp({
      create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    await buy({ x: 400, y: 400, w: 20, h: 20 }, transparent);

    const { png } = await servedWall();
    // The sold ground, not a hole in the wall. It is no longer the paper:
    // the bitmap is shared by two themes and cannot bake either one's.
    expect(await pixelAt(png, 410, 410)).toEqual({ r: SOLD_GROUND.r, g: SOLD_GROUND.g, b: SOLD_GROUND.b, a: 255 });
  });

  it("paints a sale whose bytes cannot be decoded solid, rather than dropping the whole wall", async () => {
    const good = { r: 200, g: 100, b: 40 };
    await buy({ x: 0, y: 0, w: 20, h: 20 }, Buffer.from("this is not an image at all", "utf8"));
    await buy({ x: 100, y: 0, w: 20, h: 20 }, await solidPng(40, good));

    const { png } = await servedWall();
    // The sold ground — what DESIGN.md names for a sold rectangle with no
    // bitmap to show. The rest of the wall is unaffected.
    expect(await pixelAt(png, 10, 10)).toEqual({ r: SOLD_GROUND.r, g: SOLD_GROUND.g, b: SOLD_GROUND.b, a: 255 });
    expect(await pixelAt(png, 110, 10)).toMatchObject({ ...good, a: 255 });
  });

  it("paints a sale nobody uploaded to solid as well", async () => {
    await buy({ x: 0, y: 0, w: 20, h: 20 }, null);
    const { png } = await servedWall();
    expect(await pixelAt(png, 10, 10)).toEqual({ r: SOLD_GROUND.r, g: SOLD_GROUND.g, b: SOLD_GROUND.b, a: 255 });
  });

  it("leaves a HOLD out of the wall entirely, because a hold is not a purchase", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc,
                           pending_image, pending_image_mime)
       VALUES (700, 100, 40, 40, 'reserved', '2999-01-01T00:00:00Z', 1000000, 1600000000, $1, 'image/png')`,
      [await solidPng(80, { r: 250, g: 0, b: 250 })],
    );
    const { png } = await servedWall();
    expect((await pixelAt(png, 720, 120)).a).toBe(0);
  });
});

describe("the wall and the rectangle list agree about what is where", () => {
  it("has opaque pixels under every sold rectangle and transparent ones under every hold", async () => {
    await buy({ x: 10, y: 10, w: 30, h: 30 }, await solidPng(60, { r: 90, g: 90, b: 90 }));
    await buy({ x: 500, y: 200, w: 15, h: 25 }, await solidPng(30, { r: 5, g: 250, b: 5 }));
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc)
       VALUES (800, 600, 20, 20, 'reserved', '2999-01-01T00:00:00Z', 1000000, 400000000)`,
    );

    const { png } = await servedWall();
    const rects = await listBoardRects();
    expect(rects).toHaveLength(3);

    for (const rect of rects) {
      // Every rectangle the list publishes is on the wall's own coordinates.
      expect(rect.x + rect.w).toBeLessThanOrEqual(BOARD_WIDTH);
      expect(rect.y + rect.h).toBeLessThanOrEqual(BOARD_HEIGHT);

      const middle = await pixelAt(
        png,
        rect.x + Math.floor(rect.w / 2),
        rect.y + Math.floor(rect.h / 2),
      );
      if (rect.status === "reserved") {
        expect(middle.a, `hold at ${rect.x},${rect.y} should not be in the wall`).toBe(0);
      } else {
        expect(middle.a, `sale at ${rect.x},${rect.y} should be in the wall`).toBe(255);
      }
    }
  });
});

describe("regenerating the wall", () => {
  it("is idempotent: unchanged rows give the same version and the same URL", async () => {
    await buy({ x: 0, y: 0, w: 10, h: 10 }, await solidPng(20, { r: 7, g: 7, b: 7 }));
    const first = await ensureWall();
    const second = await ensureWall();
    expect(second).toEqual(first);
    expect(await query("SELECT version FROM board_composites")).toHaveLength(1);
  });

  it("gives a new version when a purchase lands, so the URL busts the cache by changing", async () => {
    const before = await ensureWall();
    await buy({ x: 0, y: 0, w: 10, h: 10 }, await solidPng(20, { r: 7, g: 7, b: 7 }));
    const after = await ensureWall();
    expect(after!.version).not.toBe(before!.version);
    expect(after!.url).toContain(after!.version);
  });

  it("keeps the previous wall reachable, so a browser holding the old URL is not left blank", async () => {
    const before = await ensureWall();
    await buy({ x: 0, y: 0, w: 10, h: 10 }, await solidPng(20, { r: 7, g: 7, b: 7 }));
    await ensureWall();
    expect(await wallPng(before!.version)).not.toBeNull();
  });

  /**
   * DESIGN.md's failure mode, kept true for the new shape: a wall that cannot
   * be rebuilt goes stale, not blank. What the visitor gets is the version
   * that was already serving.
   */
  it("serves the previous wall when a rebuild fails outright", async () => {
    await buy({ x: 0, y: 0, w: 10, h: 10 }, await solidPng(20, { r: 7, g: 7, b: 7 }));
    const standing = await ensureWall();

    // A second purchase means the fingerprint no longer matches, so this call
    // genuinely attempts a rebuild rather than short-circuiting.
    await buy({ x: 100, y: 0, w: 10, h: 10 }, await solidPng(20, { r: 9, g: 9, b: 9 }));
    sharpState.broken = true;
    try {
      expect(await ensureWall()).toEqual(standing);
    } finally {
      sharpState.broken = false;
    }
    expect((await currentWall())!.version).toBe(standing!.version);
    expect(await wallPng(standing!.version)).not.toBeNull();
  });

  it("answers 404 for a version that is not one of ours, and for a malformed one", async () => {
    for (const version of ["not-a-version", "f".repeat(64)]) {
      const response = await wallRoute(new Request(`http://localhost/api/wall/${version}`), {
        params: Promise.resolve({ version }),
      });
      expect(response.status).toBe(404);
    }
  });

  it("serves the wall as an immutable PNG, because its URL is its hash", async () => {
    const wall = await ensureWall();
    const response = await wallRoute(new Request(`http://localhost${wall!.url}`), {
      params: Promise.resolve({ version: wall!.version }),
    });
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

/**
 * A picture made of four solid quadrants, whose correct resize is knowable
 * without knowing the resizer.
 *
 * This is what makes the next test a guard rather than a restatement. Any
 * honest reduction of a large flat region samples that region's own colour —
 * lanczos, bilinear, nearest, it does not matter — so the expected wall is
 * four solid quarters of the colours that went in, and nothing here has to
 * agree with `composite.ts` about how the resize is done.
 */
async function quarters(
  size: number,
  colours: [Rgba3, Rgba3, Rgba3, Rgba3],
): Promise<Buffer> {
  const half = size / 2;
  const parts = await Promise.all(
    colours.map((colour) =>
      sharp({ create: { width: half, height: half, channels: 3, background: colour } })
        .png()
        .toBuffer(),
    ),
  );
  return sharp({ create: { width: size, height: size, channels: 3, background: colours[0] } })
    .composite([
      { input: parts[0], left: 0, top: 0 },
      { input: parts[1], left: half, top: 0 },
      { input: parts[2], left: 0, top: half },
      { input: parts[3], left: half, top: half },
    ])
    .png()
    .toBuffer();
}

type Rgba3 = { r: number; g: number; b: number };

describe("the wall draws the picture that was uploaded", () => {
  /**
   * FOUR TIMES DOWN, AND STILL THE SAME PICTURE.
   *
   * A purchase stores four image pixels per pixel bought, so the common case
   * on the wall is a 4:1 reduction. What the buyer approved is that reduction,
   * and this reads it back out of the rendered PNG: the four quadrants land
   * where the four quadrants were, in the colours they were, at the size the
   * rectangle was bought at.
   */
  it("reduces a stored image into its rectangle without moving anything", async () => {
    const tl = { r: 210, g: 30, b: 30 };
    const tr = { r: 30, g: 170, b: 60 };
    const bl = { r: 30, g: 60, b: 200 };
    const br = { r: 220, g: 190, b: 20 };
    // 400x400 stored on a 100x100 rectangle: exactly the four-to-one this
    // board is built around.
    await buy({ x: 300, y: 200, w: 100, h: 100 }, await quarters(400, [tl, tr, bl, br]), "cover");

    const { png } = await servedWall();
    // Well inside each quarter, so no filter's edge kernel is being asked
    // about — the claim is about where the picture is, not about the seam.
    expect(await pixelAt(png, 310, 210)).toMatchObject({ ...tl, a: 255 });
    expect(await pixelAt(png, 390, 210)).toMatchObject({ ...tr, a: 255 });
    expect(await pixelAt(png, 310, 290)).toMatchObject({ ...bl, a: 255 });
    expect(await pixelAt(png, 390, 290)).toMatchObject({ ...br, a: 255 });
  });

  it("enlarges a stored image into its rectangle the same way", async () => {
    const tl = { r: 12, g: 12, b: 12 };
    const tr = { r: 240, g: 240, b: 240 };
    const bl = { r: 240, g: 12, b: 240 };
    const br = { r: 12, g: 240, b: 12 };
    // 4x4 on a 40x40 rectangle — a small purchase's stored image, blown up
    // ten times. Nearest neighbour, so the quarters stay hard-edged.
    await buy({ x: 500, y: 600, w: 40, h: 40 }, await quarters(4, [tl, tr, bl, br]), "cover");

    const { png } = await servedWall();
    expect(await pixelAt(png, 505, 605)).toMatchObject({ ...tl, a: 255 });
    expect(await pixelAt(png, 535, 605)).toMatchObject({ ...tr, a: 255 });
    expect(await pixelAt(png, 505, 635)).toMatchObject({ ...bl, a: 255 });
    expect(await pixelAt(png, 535, 635)).toMatchObject({ ...br, a: 255 });
  });
});

/**
 * THE CHECKOUT AND THE WALL, ASKED THE SAME QUESTION.
 *
 * `ConfirmationStep` renders its preview by asking `placeImage` where the
 * stored bitmap goes inside the rectangle, then drawing it there. The wall
 * never calls `placeImage` at all — it hands `fit`, `position` and a
 * background to sharp and lets sharp do it. Two implementations of one rule,
 * which is exactly the pair that can silently drift.
 *
 * So the expected coordinates below come from the PREVIEW's module, and the
 * colours come out of the WALL's rendered PNG. If sharp and `placeImage` ever
 * disagree about where a contained picture sits, a buyer approves a preview
 * they do not get, and this is what says so.
 */
describe("the checkout preview and the wall agree about the rectangle", () => {
  it("puts a contained picture where placeImage says, and the paper either side of it", async () => {
    const ink = { r: 190, g: 20, b: 140 };
    const rect = { x: 700, y: 300, w: 60, h: 60 };
    // Twice as wide as it is tall, contained in a square rectangle: the case
    // with bars, and the case a five-argument drawImage used to squash.
    await buy(rect, await solidRect(200, 100, ink), "contain");

    const { dest } = placeImage(
      { width: 200, height: 100 },
      { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
      "contain",
    );
    const { png } = await servedWall();

    // The middle of where the preview says the picture is.
    const middle = { x: Math.round(dest.x + dest.width / 2), y: Math.round(dest.y + dest.height / 2) };
    expect(await pixelAt(png, middle.x, middle.y)).toMatchObject({ ...ink, a: 255 });

    // And the bars: the sold ground, one pixel inside the rectangle at
    // the top and at the bottom, where the preview says there is no picture.
    const bars = { r: SOLD_GROUND.r, g: SOLD_GROUND.g, b: SOLD_GROUND.b, a: 255 };
    expect(await pixelAt(png, middle.x, rect.y + 1)).toEqual(bars);
    expect(await pixelAt(png, middle.x, rect.y + rect.h - 2)).toEqual(bars);

    // The picture's own top edge, two pixels below where the preview puts it,
    // so a rounding difference of one is not what is being asserted.
    expect(await pixelAt(png, middle.x, Math.round(dest.y) + 2)).toMatchObject({ ...ink, a: 255 });
  });

  it("fills the rectangle edge to edge when the buyer chose to fill it", async () => {
    const ink = { r: 20, g: 120, b: 190 };
    const rect = { x: 900, y: 500, w: 60, h: 30 };
    await buy(rect, await solidRect(200, 100, ink), "cover");

    const { dest } = placeImage(
      { width: 200, height: 100 },
      { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
      "cover",
    );
    // The preview says a cover fit leaves no gap, so every corner is picture.
    expect(dest).toEqual({ x: rect.x, y: rect.y, width: rect.w, height: rect.h });

    const { png } = await servedWall();
    for (const [x, y] of [
      [rect.x, rect.y],
      [rect.x + rect.w - 1, rect.y],
      [rect.x, rect.y + rect.h - 1],
      [rect.x + rect.w - 1, rect.y + rect.h - 1],
    ]) {
      expect(await pixelAt(png, x, y), `corner ${x},${y}`).toMatchObject({ ...ink, a: 255 });
    }
  });
});

/** A solid picture that is not square, so a fit has something to do. */
async function solidRect(width: number, height: number, colour: Rgba3): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: colour } })
    .png()
    .toBuffer();
}
