import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { CONTENT_LIMITS, validateContent } from "../../../lib/board/content";
import { ensureWall, wallPng } from "../../../lib/board/composite";
import {
  MAX_INPUT_BYTES,
  STORED_MAX_BYTES,
  TARGET_STORED_BYTES,
  encodeAttempts,
  plannedEncode,
  type Box,
  type Fit,
} from "../../../lib/board/image-plan";
import { reserveRect } from "../../../lib/board/reserve";
import { GET as IMAGE } from "../blocks/[id]/image/route";
import { POST as POST_CONFIRM } from "../orders/[id]/confirm/route";
import { POST as POST_CONTENT } from "../orders/[id]/content/route";

/**
 * The dollar purchase, and the photograph nobody has to shrink by hand.
 *
 * Two claims, both checked by looking at what actually came out rather than by
 * asking the code what it intended:
 *
 *   1. A 1×1 goes all the way through — hold, content, payment — and what is
 *      stored on it is 4×4. Not `targetBox(...)`, which is the arithmetic
 *      under test: the literal four, read back out of the bytes the image
 *      route serves.
 *   2. A genuinely large photograph is never refused for its weight or its
 *      dimensions. The RAW file is refused, and that is the point — the browser
 *      shrinks it first, and what reaches the server is inside every cap.
 *
 * WHAT `shrink` IS. `image-encode.ts` is the browser half of the upload: a
 * canvas fed by `plannedEncode` and `encodeAttempts`, which are pure and live
 * in `image-plan.ts`. A canvas is not available here, so `shrink` below is the
 * same two pure functions with `sharp` standing in for the canvas — the plan
 * is shared, only the pixel pusher differs. The real canvas path is driven
 * through headless Chrome; see the task report.
 */

// A hold, a content submission, a payment and a wall rebuild each cost their
// own round trip to a remote Neon branch, and the largest test here also
// encodes a six-megapixel photograph several times over.
vi.setConfig({ testTimeout: 60_000 });

const BUYER = "SmallBuyerPubkey11111111111111111111111111";
const CALLER = "1".repeat(64);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/**
 * A photograph, in the only way that matters here: big, detailed, and heavy.
 *
 * Noise put through a small blur, because flat colour and hard edges are the
 * two things a JPEG encoder finds easy and a real photograph is neither. The
 * result is several megabytes at six megapixels, which is what a phone hands
 * over.
 */
async function photograph(width = 3000, height = 2000): Promise<Buffer> {
  const noise = Buffer.alloc(width * height * 3);
  // Deterministic rather than random: a fixture that weighs a different number
  // of bytes on every run is a fixture that will one day fail on the cap by
  // luck. This is a cheap LCG, and it produces the same picture every time.
  let seed = 20260827;
  for (let at = 0; at < noise.length; at += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    noise[at] = (seed >> 16) & 0xff;
  }
  return sharp(noise, { raw: { width, height, channels: 3 } })
    .blur(1.6)
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** A picture of exactly one colour, whose correct resize is knowable by hand. */
async function solid(
  width: number,
  height: number,
  colour: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: colour } })
    .jpeg({ quality: 100 })
    .toBuffer();
}

/**
 * What the browser does to a file before it is sent, with sharp for a canvas.
 *
 * Walks the same ladder `image-encode.ts` walks, in the same order, and stops
 * at the first rung under the target — so what this returns is the shape and
 * the weight the real upload path produces, not an approximation of it.
 */
async function shrink(file: Buffer, block: Box, fit: Fit): Promise<{ bytes: Buffer; box: Box }> {
  const source = await sharp(file).metadata();
  let smallest: { bytes: Buffer; box: Box } | null = null;

  for (const attempt of encodeAttempts(block)) {
    const plan = plannedEncode(source.width!, source.height!, block, fit, attempt.maxLongEdge);
    // The crop is fractional (`centredCrop` centres it), and `extract` takes
    // whole pixels — so each edge is floored and then clamped inside the
    // source, which is what a canvas does when it is handed the same numbers.
    const left = Math.floor(plan.source.x);
    const top = Math.floor(plan.source.y);
    const bytes = await sharp(file)
      .extract({
        left,
        top,
        width: Math.min(Math.round(plan.source.width), source.width! - left),
        height: Math.min(Math.round(plan.source.height), source.height! - top),
      })
      .resize(plan.target.width, plan.target.height, { fit: "fill" })
      .webp({ quality: Math.round(attempt.quality * 100) })
      .toBuffer();
    const encoded = { bytes, box: plan.target };
    if (bytes.byteLength <= TARGET_STORED_BYTES) return encoded;
    if (!smallest || bytes.byteLength < smallest.bytes.byteLength) smallest = encoded;
  }

  if (!smallest) throw new Error("the ladder produced nothing at all");
  return smallest;
}

async function submitContent(orderId: string, bytes: Buffer, fit: Fit = "cover"): Promise<Response> {
  const form = new FormData();
  form.set("image", new Blob([new Uint8Array(bytes)], { type: "image/webp" }), "block.webp");
  form.set("link", "https://example.com/one-pixel");
  form.set("caption", "One pixel");
  form.set("imageFit", fit);
  form.set("buyerPubkey", BUYER);
  const framed = await new Response(form).arrayBuffer();
  return POST_CONTENT(
    new Request("http://localhost/api/orders/x/content", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.44", "content-length": String(framed.byteLength) },
      body: form,
    }),
    ctx(orderId),
  );
}

async function confirm(orderId: string): Promise<Response> {
  return POST_CONFIRM(
    new Request("http://localhost/api/orders/x/confirm", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.44" },
      body: JSON.stringify({ buyerPubkey: BUYER }),
    }),
    ctx(orderId),
  );
}

/** The bytes the browser would receive for a block's own picture. */
async function servedImage(id: string): Promise<Buffer> {
  const response = await IMAGE(new Request(`http://localhost/api/blocks/${id}/image`), ctx(id));
  expect(response.status).toBe(200);
  return Buffer.from(await response.arrayBuffer());
}

/** One pixel of the wall the browser would be served right now. */
async function wallPixel(x: number, y: number): Promise<{ r: number; g: number; b: number; a: number }> {
  const wall = await ensureWall();
  const png = (await wallPng(wall!.version))!;
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * 4;
  return { r: data[at], g: data[at + 1], b: data[at + 2], a: data[at + 3] };
}

describe("a purchase of one pixel, for one dollar", () => {
  it("goes through from hold to payment, and stores a 4 by 4 picture on the way", async () => {
    const orange = { r: 236, g: 118, b: 20 };
    const held = await reserveRect({ x: 640, y: 410, w: 1, h: 1 }, BUYER, CALLER);

    // A six-megapixel photograph on a one-pixel rectangle. The buyer does
    // nothing about the difference; the page does.
    const file = await solid(3000, 2000, orange);
    const prepared = await shrink(file, { width: 1, height: 1 }, "cover");

    expect((await submitContent(held.id, prepared.bytes)).status).toBe(200);
    expect((await confirm(held.id)).status).toBe(200);

    // READ THE BYTES, not the plan that produced them. Four is written out
    // here on purpose: `targetBox` is the thing this guard exists to hold
    // still, so it must not be the thing that says what to expect.
    const stored = await sharp(await servedImage(held.id)).metadata();
    expect({ width: stored.width, height: stored.height }).toEqual({ width: 4, height: 4 });

    // And the one pixel that pixel bought is the colour that was uploaded.
    const painted = await wallPixel(640, 410);
    expect(painted.a).toBe(255);
    expect(Math.abs(painted.r - orange.r)).toBeLessThanOrEqual(3);
    expect(Math.abs(painted.g - orange.g)).toBeLessThanOrEqual(3);
    expect(Math.abs(painted.b - orange.b)).toBeLessThanOrEqual(3);
  });
});

describe("a genuinely large photograph", () => {
  it("is never refused for its weight, because the page shrinks it first", async () => {
    const file = await photograph();
    const source = await sharp(file).metadata();

    // The premise: this really is the kind of file the naive answer refuses.
    expect(file.byteLength).toBeGreaterThan(STORED_MAX_BYTES * 4);
    expect(file.byteLength).toBeLessThan(MAX_INPUT_BYTES);
    expect(Math.max(source.width!, source.height!)).toBeGreaterThan(CONTENT_LIMITS.maxDimension);

    // And the server would indeed refuse it, unshrunk.
    const raw = await validateContent({
      bytes: file,
      declaredMime: "image/jpeg",
      link: "https://example.com/",
      caption: "",
      imageFit: "cover",
      block: { width: 60, height: 40 },
    });
    expect(raw.ok).toBe(false);

    // What the browser sends instead is inside every cap, at four stored
    // pixels per pixel bought.
    const prepared = await shrink(file, { width: 60, height: 40 }, "cover");
    expect(prepared.box).toEqual({ width: 240, height: 160 });
    expect(prepared.bytes.byteLength).toBeLessThanOrEqual(STORED_MAX_BYTES);

    const accepted = await validateContent({
      bytes: prepared.bytes,
      declaredMime: "image/webp",
      link: "https://example.com/",
      caption: "",
      imageFit: "cover",
      block: { width: 60, height: 40 },
    });
    expect(accepted.ok, "the shrunk photograph must be accepted").toBe(true);
  });

  it("reaches the board on a rectangle, rather than a weight error", async () => {
    const held = await reserveRect({ x: 100, y: 100, w: 60, h: 40 }, BUYER, CALLER);
    const prepared = await shrink(await photograph(), { width: 60, height: 40 }, "cover");

    const response = await submitContent(held.id, prepared.bytes);
    expect(response.status, await response.text()).toBe(200);
    expect((await confirm(held.id)).status).toBe(200);

    // Not a colour assertion — a photograph has no single colour. What is
    // asserted is that the rectangle is genuinely painted: the wall is opaque
    // where nothing was sold a moment ago.
    expect((await wallPixel(130, 120)).a).toBe(255);
  });
});

describe("the caps the purchase path is allowed to enforce", () => {
  it("still refuses bytes over the stored cap, because that cap is a security control", async () => {
    // The 100 KiB is what keeps an Irys upload free and therefore keeps the
    // signing key unfundable (SECURITY.md). "Never rejected for being too
    // large" is a promise about what a BUYER meets, not a promise that the
    // server stopped checking.
    const held = await reserveRect({ x: 300, y: 300, w: 200, h: 200 }, BUYER, CALLER);
    const oversized = await sharp(await photograph(1200, 1200))
      .webp({ quality: 100 })
      .toBuffer();
    expect(oversized.byteLength).toBeGreaterThan(STORED_MAX_BYTES);

    // 413, and refused on the content-length before a byte of the body is
    // read — which is a stronger answer than the 422 the validator would give
    // afterwards, and the reason the gate is in front of the parser.
    const response = await submitContent(held.id, oversized);
    expect(response.status).toBe(413);
  });
});

/**
 * The fit a rectangle is too small to draw, refused where refusing counts.
 *
 * The form stops offering "Fit inside" on a purchase like the first one below
 * (see `FitChoice` in ContentForm.tsx), but a hidden radio is not a boundary:
 * these submissions go straight at the route with a hand-built body, which is
 * exactly what a caller who never loaded the form would send. Content is
 * immutable once paid, so a stored `contain` that draws as a fill would be
 * permanent.
 */
describe("a contain the rectangle cannot letterbox", () => {
  it("is refused on a 1x1, however it is submitted, and the same bytes go on as a fill", async () => {
    const held = await reserveRect({ x: 700, y: 500, w: 1, h: 1 }, BUYER, CALLER);
    // 4:3, so the picture and the pixel are not the same shape. What it
    // stores is 4x3 — and one pixel has nowhere to put the bars.
    const prepared = await shrink(await solid(400, 300, { r: 20, g: 80, b: 200 }), { width: 1, height: 1 }, "contain");

    const refused = await submitContent(held.id, prepared.bytes, "contain");
    expect(refused.status).toBe(422);
    // Read the answer the caller actually receives, not the validator's.
    const body = (await refused.json()) as { rejections: { field: string; code: string }[] };
    expect(body.rejections.map((r) => [r.field, r.code])).toEqual([["imageFit", "fit_impossible"]]);

    // And nothing about the picture itself was wrong: the fill is accepted on
    // the very same bytes.
    expect((await submitContent(held.id, prepared.bytes, "cover")).status).toBe(200);
  });

  it("leaves contain on a large rectangle, and the wall draws the bars", async () => {
    const held = await reserveRect({ x: 400, y: 600, w: 100, h: 100 }, BUYER, CALLER);
    const blue = { r: 20, g: 80, b: 200 };
    const prepared = await shrink(await solid(1200, 300, blue), { width: 100, height: 100 }, "contain");

    expect((await submitContent(held.id, prepared.bytes, "contain")).status).toBe(200);
    expect((await confirm(held.id)).status).toBe(200);

    // READ THE WALL. A 4:1 picture contained in a 100x100 rectangle is
    // twenty-five pixels tall and centred, so the top of the block is bar and
    // the middle of it is picture. Nothing here recomputes where the edge
    // falls; both samples are well inside their own band.
    const bar = await wallPixel(450, 610);
    // The sheet's own cream, `--canvas` in DESIGN.md and `PAPER` in
    // composite.ts, which is what a contain fit's bars are made of.
    expect(bar).toEqual({ r: 0xf3, g: 0xed, b: 0xe0, a: 255 });

    const picture = await wallPixel(450, 650);
    expect(Math.abs(picture.r - blue.r)).toBeLessThanOrEqual(3);
    expect(Math.abs(picture.g - blue.g)).toBeLessThanOrEqual(3);
    expect(Math.abs(picture.b - blue.b)).toBeLessThanOrEqual(3);
  });
});
