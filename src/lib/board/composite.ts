import { createHash } from "node:crypto";
import sharp from "sharp";
import { execute, query, queryOne } from "../db";
import { IMAGE_BEARING_STATUSES, publishesTextSql } from "./block-image";
import { BOARD_HEIGHT, BOARD_WIDTH } from "./geometry";
import type { Fit } from "./image-fit";

/**
 * The wall as one bitmap: 1250×800 of everybody's artwork, versioned by its
 * own content.
 *
 * WHO CALLS THIS. `src/app/api/board/route.ts` and `src/app/page.tsx` call
 * `ensureWall` — they are the two places that answer "what is on the board
 * right now", and the version they hand back is what the browser then loads.
 * `src/app/api/wall/[version]/route.ts` calls `wallPng` to serve the bytes.
 * Nothing else reaches in here, and nothing in the browser can: this file
 * imports `sharp` and the pool.
 *
 * WHY A COMPOSITE AT ALL. The board used to ship one JSON row per block and
 * the canvas fetched one bitmap per block. That was designed for ten thousand
 * 10×10 blocks. A pixel is the unit now, so a full wall is potentially tens of
 * thousands of purchases, and tens of thousands of image requests is not a
 * page — it is a denial of service the visitor performs on themselves. One PNG
 * of exactly the wall is a few hundred kilobytes and one request.
 *
 * WHAT IS AND IS NOT IN IT. Only purchases: `paid` and `minted`, and only
 * while `hidden_at` is null. A HOLD IS NOT IN IT, on purpose — a hold appears
 * and expires within half an hour, and baking one in would rebuild the whole
 * wall twice for every abandoned purchase. Holds are drawn by the canvas from
 * the rectangle list, which is where volatile state belongs. A taken-down
 * block contributes nothing at all, which is the takedown's whole effect on
 * the render.
 *
 * WHAT A FAILURE DOES. DESIGN.md's states table says of a sold block whose
 * bitmap will not load: "Solid, edge to edge, 1px ink border. This is the
 * fallback, not the sold treatment: what the rectangle shows in the moment
 * before its bitmap arrives, and what it keeps if the bitmap never does." That
 * is kept true here at two levels. One unreadable stored image paints its
 * rectangle solid and the rest of the wall composes normally. And if the whole
 * build throws, `ensureWall` returns the version that was already serving, so
 * the wall goes stale rather than blank — a broken wall is worse than an old
 * one.
 */

/** How many past walls stay reachable after a rebuild. */
const KEEP_VERSIONS = 3;

/**
 * The sheet's own cream, `--canvas` in globals.css and `PAINT.paper` in
 * BoardCanvas.
 *
 * Two jobs here. It is what an upload with an alpha channel is composited
 * ONTO, so a transparent PNG cannot let the graph ruling show through pixels
 * somebody bought. And it is what a `contain` fit's bars are made of, for the
 * same reason.
 *
 * It is deliberately NOT the composite's background. Unsold pixels are
 * TRANSPARENT, so the canvas can draw the paper and its ruling underneath and
 * have the artwork cover them exactly where a purchase covers them. A cream
 * background here would hide the ruling under the whole wall.
 */
/**
 * The two colours this file paints, and why neither is the board's paper any
 * more.
 *
 * THE WALL IS ONE BITMAP AND THERE ARE NOW TWO THEMES, so anything baked into
 * it has to be right in both. Unsold pixels are transparent and always were —
 * the paper shows through them, whichever paper that is today. What was NOT
 * transparent was two things inside a sold rectangle: the bars a `contain` fit
 * leaves, and the ground an upload with an alpha channel is flattened onto.
 * Both were the cream paper, which would put cream slabs inside every
 * letterboxed purchase for a reader on the dark register.
 *
 * They are `--sold-fallback`'s tone instead, and that is a better answer than a
 * theme-neutral compromise: **those pixels belong to the sale, not to the
 * wall.** A bar beside somebody's logo is part of what they bought, and a
 * transparent one would make part of a sold rectangle look free — which is the
 * exact hole the 1px sold edge exists to close. So they read as sold in both
 * themes, and the rule "a sale is never a hole in the wall" holds without the
 * bitmap having to know which register is being looked at.
 *
 * THE DOOR: if a buyer ever needs their transparency to sit on the reader's own
 * background, the answer is two composites keyed by theme — two versions of one
 * hash — and the cost is a second rebuild per purchase. `DECISIONS.md` carries
 * it. Nothing here is a promise about transparency either way, and no copy says
 * one.
 */
function rgb(hex: string): { r: number; g: number; b: number; alpha: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    alpha: 1,
  };
}

/**
 * What a sold rectangle shows where the buyer's own picture does not reach —
 * a `contain` fit's bars, and behind an alpha channel.
 *
 * It is the DARK theme's sold-fallback, and picking one of the two was
 * unavoidable: a bitmap cannot hold both. This one, because a mid slate reads
 * as "something is here" against the cream paper AND against the near-black,
 * where the cream would have vanished into one of them.
 */
export const SOLD_GROUND = rgb("#2e3642");

export type Wall = {
  /** The sha256 of the PNG, and the only thing in its URL that changes. */
  version: string;
  /** Where the browser gets it. Built here so nothing else has to know the shape. */
  url: string;
  width: number;
  height: number;
};

type CurrentWall = Wall & { fingerprint: string };

export type PurchaseRow = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  image_fit: Fit | null;
  pending_image: Buffer | null;
  pending_image_mime: string | null;
};

/**
 * Where a version of the wall lives.
 *
 * One definition, so the payload, the route and any future preloader cannot
 * disagree about the shape of the URL. Nothing is escaped because the version
 * is a sha256 out of `createHash` and the route refuses anything that is not
 * 64 hex characters before it touches the database.
 */
export function wallUrl(version: string): string {
  return `/api/wall/${version}`;
}

/**
 * A digest of the ROWS a composite would be built from.
 *
 * This is the "has anything changed" question, asked in one aggregate instead
 * of by rebuilding and comparing. What it covers is exactly what changes a
 * pixel: which rectangles are visible, where they are, how big they are, which
 * fit their buyer chose, and which bytes are under them.
 *
 * It does NOT need to cover the bytes changing under a fixed id, because they
 * cannot: `attachContent` refuses once an order is paid, and every visible row
 * here is paid. `image_sha256` is therefore a stable name for the picture, and
 * `md5(pending_image)` is only reached by a row that somehow has bytes without
 * a hash — which `attachContent` never writes, and which a fixture might.
 *
 * ponytail: one aggregate per board request, which is a sequential scan of a
 * table that will hold tens of thousands of rows. If that ever shows up in a
 * trace, the upgrade is a trigger on `blocks` maintaining a counter, and this
 * function becomes a single-row read. It is not that today because a trigger
 * has to be kept in step with every column that affects a pixel, and this
 * cannot fall out of step with anything.
 */
export async function wallFingerprint(): Promise<string> {
  const row = await queryOne<{ fingerprint: string }>(
    `SELECT COALESCE(
              md5(string_agg(
                id::text || ':' || x || ',' || y || ',' || w || ',' || h
                  || ':' || COALESCE(image_fit, '-')
                  || ':' || COALESCE(image_sha256, md5(pending_image), '-'),
                '|' ORDER BY id)),
              'empty') AS fingerprint
       FROM blocks
      WHERE ${publishesTextSql(1)}`,
    [[...IMAGE_BEARING_STATUSES]],
  );
  return row!.fingerprint;
}

/**
 * Every purchase the wall draws, in the order it draws them.
 *
 * `created_at` order is not cosmetic: the rectangles cannot overlap (the
 * exclusion constraint sees to that), so no two layers can fight, but a stable
 * order is what makes the encoder produce identical bytes for identical rows —
 * which is what makes the version stable and the rebuild idempotent.
 */
async function visiblePurchases(): Promise<PurchaseRow[]> {
  return query<PurchaseRow>(
    `SELECT id, x, y, w, h, image_fit, pending_image, pending_image_mime
       FROM blocks
      WHERE ${publishesTextSql(1)}
      ORDER BY created_at, id`,
    [[...IMAGE_BEARING_STATUSES]],
  );
}

/** A rectangle's worth of opaque RGBA, with no image involved. */
function solid(w: number, h: number, colour: typeof SOLD_GROUND): Buffer {
  const data = Buffer.alloc(w * h * 4);
  for (let at = 0; at < data.length; at += 4) {
    data[at] = colour.r;
    data[at + 1] = colour.g;
    data[at + 2] = colour.b;
    data[at + 3] = 255;
  }
  return data;
}

/**
 * One purchase, rendered at the size it was bought at, as raw RGBA.
 *
 * RAW rather than a PNG per block: `composite` below would otherwise decode
 * every layer it was just handed, which is two extra codec passes per purchase
 * for bytes that never leave this function.
 *
 * NEAREST ON THE WAY UP, LANCZOS ON THE WAY DOWN, and the split is the whole
 * of the decision. DESIGN.md's rule is that "a bitmap that has been smoothed
 * is no longer the picture the buyer uploaded" and that there is "no scale at
 * which the artwork is allowed to go soft" — which is a rule about ENLARGING.
 * A stored image is four times its rectangle's size on purpose (see
 * `BLOCK_PIXEL_SCALE` in image-plan.ts), so the common case here is a 4:1
 * REDUCTION, and dropping fifteen of every sixteen pixels of a photograph is
 * not sharpness, it is a different picture. The buyer approved a browser-drawn
 * preview of that same reduction, and `image-fit.ts` exists precisely so the
 * board keeps the preview's promise. So: pixel art enlarged into its rectangle
 * stays hard-edged, and a photograph reduced into its rectangle stays a
 * photograph.
 *
 * An unreadable stored image is not an error. It paints the solid fallback and
 * the wall carries on — one corrupt row must not take the other ten thousand
 * purchases off the board.
 */
async function layer(row: PurchaseRow): Promise<Buffer> {
  if (!row.pending_image || !row.pending_image_mime) {
    return solid(row.w, row.h, SOLD_GROUND);
  }

  try {
    const source = await sharp(row.pending_image).metadata();
    const enlarging = row.w * row.h >= (source.width ?? 1) * (source.height ?? 1);
    return await sharp(row.pending_image)
      .resize(row.w, row.h, {
        // `contain` letterboxes onto the paper's own cream and `cover` crops
        // centred: the same two rules `placeImage` applies on the canvas, and
        // the same two CSS `object-fit` gave the buyer in the preview.
        fit: row.image_fit === "cover" ? "cover" : "contain",
        position: "centre",
        background: SOLD_GROUND,
        kernel: enlarging ? "nearest" : "lanczos3",
      })
      // Onto the cream rather than onto nothing: an upload with an alpha
      // channel must not let the ruling show through a rectangle somebody
      // bought.
      .flatten({ background: SOLD_GROUND })
      .ensureAlpha()
      .raw()
      .toBuffer();
  } catch {
    return solid(row.w, row.h, SOLD_GROUND);
  }
}

/**
 * The wall itself: a transparent 1250×800 sheet with every visible purchase
 * composited onto it at its own coordinates.
 *
 * Exported so a guard can build one from rows it wrote itself and then SAMPLE
 * the result, rather than trusting a round trip through the table.
 *
 * ponytail: every layer is decoded before any is composited, which is fine for
 * a wall of small rectangles and would hold a lot of raw RGBA for a wall of
 * large ones. If that ever matters, composite in batches and round-trip the
 * accumulator as raw — the output is identical either way, because the
 * rectangles cannot overlap.
 */
export type EncodedWall = { bytes: Buffer; mime: "image/png" | "image/webp" };

export async function composeWall(rows: PurchaseRow[]): Promise<EncodedWall> {
  const layers = await Promise.all(
    rows.map(async (row) => ({
      input: await layer(row),
      raw: { width: row.w, height: row.h, channels: 4 as const },
      left: row.x,
      top: row.y,
    })),
  );

  const composed = sharp({
    create: {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(layers);

  /*
    BOTH ENCODINGS, AND THE SMALLER ONE WINS. `docs/imagenes.md` §5 measured a
    photographic wall at 3.8 MiB of PNG and recommended WebP; what it also
    recommended — a PNG fallback chosen by `Accept` — is not what shipped.
    Content negotiation means one URL with two bodies, which needs `Vary`,
    splits every shared cache, and undoes the property the version exists for.
    The version is the hash of the bytes, so an encoding is just a different
    URL, and the build can simply pick the smaller.

    LOSSLESS, AND THAT IS THE PRODUCT DECISION IN THIS FILE. Lossy WebP is where
    most of §5's saving lives, and it is the one thing this wall may not do:
    DESIGN.md says a bitmap that has been smoothed is no longer the picture the
    buyer uploaded, and a buyer of a 6×40 block paid for forty exact pixels.
    Lossless WebP still beats PNG on flat art — which is what most of this wall
    is — and where it does not, PNG is kept and nothing is lost either way.

    // ponytail: two encodes per rebuild, which is milliseconds beside the
    // compositing (§5 measured 1.6s for 10,000 layers against 45ms to encode).
    // If a rebuild ever becomes hot, encode WebP only and keep PNG for walls
    // under a size where the difference cannot matter.
  */
  const [png, webp] = await Promise.all([
    composed.clone().png({ compressionLevel: 9 }).toBuffer(),
    composed.clone().webp({ lossless: true, effort: 6 }).toBuffer(),
  ]);

  return webp.length < png.length
    ? { bytes: webp, mime: "image/webp" }
    : { bytes: png, mime: "image/png" };
}

/** The wall currently being served, or null before the first one is built. */
export async function currentWall(): Promise<CurrentWall | null> {
  const row = await queryOne<{ version: string; fingerprint: string }>(
    "SELECT version, fingerprint FROM board_composites ORDER BY built_at DESC LIMIT 1",
  );
  if (!row) return null;
  return {
    version: row.version,
    url: wallUrl(row.version),
    fingerprint: row.fingerprint,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
  };
}

/**
 * The current wall, rebuilt first if the rows it was built from have moved.
 *
 * SAFE TO RE-RUN, and safe to run concurrently. Unchanged rows produce the
 * same fingerprint and this returns without touching sharp at all; changed
 * rows produce a PNG whose sha256 IS the version, so two instances rebuilding
 * the same wall at the same moment write the same row and the upsert has
 * nothing to resolve.
 *
 * A FAILED BUILD LEAVES THE PREVIOUS WALL SERVING. The rebuild is the only
 * thing inside the try, and what comes back on a throw is exactly what was
 * being served a moment ago. The board goes stale by one purchase; it does not
 * go blank, and it does not 500 a page whose whole job is to show the artwork.
 */
export async function ensureWall(): Promise<Wall | null> {
  const [fingerprint, current] = await Promise.all([wallFingerprint(), currentWall()]);
  if (current && current.fingerprint === fingerprint) return published(current);

  try {
    return await rebuild(fingerprint);
  } catch (error) {
    // The operational reason goes to the server log; the visitor gets the wall
    // that was already there.
    console.error("composite: rebuild failed, serving the previous wall", error);
    return current && published(current);
  }
}

/**
 * The wall without its fingerprint.
 *
 * The fingerprint is a digest of the rows and it is nobody's business outside
 * this module: `ensureWall`'s answer goes straight into a public,
 * unauthenticated payload, and shipping an internal digest of the table is the
 * kind of thing that is harmless right up until somebody reasons from it.
 */
function published(wall: CurrentWall): Wall {
  return { version: wall.version, url: wall.url, width: wall.width, height: wall.height };
}

async function rebuild(fingerprint: string): Promise<Wall> {
  const wall = await composeWall(await visiblePurchases());
  // The hash is of the BYTES, so the encoding is part of the identity: the
  // same pixels encoded twice are two versions, and a browser holding either
  // URL is holding a URL that is still correct.
  const version = createHash("sha256").update(wall.bytes).digest("hex");

  await execute(
    `INSERT INTO board_composites (version, png, mime, fingerprint)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (version) DO UPDATE
       SET built_at = now(), fingerprint = EXCLUDED.fingerprint`,
    [version, wall.bytes, wall.mime, fingerprint],
  );

  // Old walls stay reachable for a little while rather than vanishing the
  // instant a new one is built: a browser holding a board payload from thirty
  // seconds ago is still asking for the previous URL, and a 404 there would
  // blank its wall until the next poll. Three is two more than correctness
  // needs and small enough that the table never grows.
  await execute(
    `DELETE FROM board_composites
      WHERE version NOT IN (
        SELECT version FROM board_composites ORDER BY built_at DESC LIMIT ${KEEP_VERSIONS}
      )`,
  );

  return { version, url: wallUrl(version), width: BOARD_WIDTH, height: BOARD_HEIGHT };
}

/**
 * One version's bytes and what they are, or null — the route answers both with
 * its own 404.
 *
 * The column is still called `png`, because an applied migration is never
 * edited and the bytes are what they always were: a picture of the wall. What
 * changed is that the row now says which encoding, rather than the route
 * assuming.
 */
export async function wallImage(version: string): Promise<EncodedWall | null> {
  const row = await queryOne<{ png: Buffer; mime: string }>(
    "SELECT png, mime FROM board_composites WHERE version = $1",
    [version],
  );
  if (!row) return null;
  return { bytes: row.png, mime: row.mime === "image/webp" ? "image/webp" : "image/png" };
}

/** True for the 64-hex shape `version` always has. Checked before any query. */
export function isWallVersion(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
