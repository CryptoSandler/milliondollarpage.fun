/**
 * How big an upload should be stored, what part of it survives, and how hard
 * the browser should squeeze it. Pure arithmetic — no canvas, no DOM, no
 * `sharp` — so the fiddly half of the upload is unit tested instead of being
 * eyeballed in a browser.
 *
 * THE APP SHRINKS THE IMAGE, NOT THE BUYER. A buyer picks any photo their
 * browser can decode, up to `MAX_INPUT_BYTES`, and the page resizes and
 * re-encodes it until it fits comfortably inside the stored cap. Nobody is
 * ever shown a weight error for a picture the browser could open.
 *
 * WHAT IS NOT NEGOTIABLE HERE. The STORED payload still has to land under
 * `CONTENT_LIMITS.maxBytes` (100 KiB). That number is not a storage
 * preference: Irys uploads under 100 KiB are free, free uploads are what let
 * the signing key stay permanently unfunded, and the startup check refuses to
 * boot if that key ever holds a balance (SECURITY.md, "Enforced conditions").
 * So this module aims at `TARGET_STORED_BYTES`, comfortably below the cap,
 * and gives up resolution rather than asking for the cap to move.
 *
 * `image-encode.ts` is the thin browser half that feeds a real canvas from
 * what this decides.
 */

import { centredCrop, type Box, type Fit, type Rect } from "./image-fit";

/** A block pixel is stored at four device pixels, so a zoomed block is sharp. */
export const BLOCK_PIXEL_SCALE = 4;

/**
 * The ceiling on the stored long edge, whatever the block's size.
 *
 * A 10×10 block stores 40×40 and a 100×100 block stores 400×400, exactly as
 * specified. This only bites above a 256-pixel block: a 500×500 rectangle
 * would want 2000×2000, and 2000×2000 of anything photographic cannot be
 * squeezed under 100 KiB without looking like a fax. 1024 is the honest
 * trade — the biggest blocks get less than 4× per pixel, and they get an
 * image that still looks like a photograph.
 */
export const STORED_MAX_LONG_EDGE = 1024;

/**
 * The cap on the STORED payload, in bytes, and the one number in this file
 * that may not move without the owner: 100 KiB is Irys's free tier, and free
 * uploads are what keep the signing key unfundable. `CONTENT_LIMITS.maxBytes`
 * in content.ts is this constant — it lives here so the browser can aim at it
 * without importing a module that loads `sharp`.
 */
export const STORED_MAX_BYTES = 102_400;

/** What the browser will accept off the file picker, before it decodes anything. */
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/**
 * What the client aims the encoded payload at: 90 KiB, roughly 12% under the
 * 100 KiB stored cap. The headroom is deliberate — multipart framing, a long
 * link and a caption ride along in the same request, and an encoder that
 * lands one byte under a hard cap is an encoder that will one day land one
 * byte over it.
 */
export const TARGET_STORED_BYTES = 92_160;

/**
 * Re-exported from `./image-fit.ts`, which owns them: the fit a buyer picks
 * decides both what gets STORED (here) and what gets DRAWN (there), and one
 * vocabulary for both is what keeps those two answers the same answer.
 */
export type { Box, Fit, Rect } from "./image-fit";

export type EncodePlan = {
  /** The stored image's own size: the canvas the browser draws into. */
  target: Box;
  /** The part of the source that survives. The whole of it, unless cover crops. */
  source: Rect;
  /** Where that part lands on the canvas. */
  dest: Rect;
};

/** One rung of the squeeze: a long-edge ceiling and an encoder quality. */
export type EncodeAttempt = { maxLongEdge: number; quality: number };

const QUALITY_LADDER = [0.85, 0.7, 0.55];
const EDGE_LADDER = [1, 0.75, 0.5, 0.35];
const MIN_LONG_EDGE = 16;

/**
 * The box a block wants: its pixel size times four, held under `maxLongEdge`
 * with the block's own aspect ratio kept.
 */
export function targetBox(block: Box, maxLongEdge = STORED_MAX_LONG_EDGE): Box {
  const longest = Math.max(block.width, block.height) * BLOCK_PIXEL_SCALE;
  const squeeze = Math.min(1, maxLongEdge / longest);
  return {
    width: Math.max(1, Math.round(block.width * BLOCK_PIXEL_SCALE * squeeze)),
    height: Math.max(1, Math.round(block.height * BLOCK_PIXEL_SCALE * squeeze)),
  };
}

/**
 * What to draw where, for one source image, one block and one fit.
 *
 * `cover` crops the source to the block's aspect ratio, centred, and fills
 * the target box. `contain` keeps the whole source and lets the stored image
 * keep the SOURCE's aspect ratio inside the box — it does not paint bars.
 * Baked-in letterboxing would spend the byte budget on background and would
 * hand the board a picture that is not the one the buyer chose.
 *
 * THE BARS ARE THE BOARD'S JOB, and this comment used to claim they already
 * were before anything did them: `BoardCanvas` stretched every bitmap to the
 * block's shape, so a contained upload stored at its own aspect ratio came
 * out squashed. `placeImage` in `./image-fit.ts` is what actually keeps that
 * promise now, and the crop below is `centredCrop` from the same module, so
 * the shape this stores and the shape the board draws cannot drift apart.
 *
 * Neither fit ever ENLARGES. A source smaller than the box is stored at its
 * own size: upscaling invents detail that is not there and pays bytes for it,
 * and the board's nearest-neighbour drawing would rather have the original
 * few pixels than a smoothed guess at more.
 */
export function plannedEncode(
  sourceWidth: number,
  sourceHeight: number,
  block: Box,
  fit: Fit,
  maxLongEdge = STORED_MAX_LONG_EDGE,
): EncodePlan {
  const box = targetBox(block, maxLongEdge);
  const source = fit === "cover" ? centredCrop(sourceWidth, sourceHeight, box) : whole(sourceWidth, sourceHeight);

  const squeeze = Math.min(1, box.width / source.width, box.height / source.height);
  const target: Box = {
    width: Math.max(1, Math.round(source.width * squeeze)),
    height: Math.max(1, Math.round(source.height * squeeze)),
  };

  return { target, source, dest: { x: 0, y: 0, ...target } };
}

function whole(width: number, height: number): Rect {
  return { x: 0, y: 0, width, height };
}

/**
 * The order in which the browser tries to get under `TARGET_STORED_BYTES`:
 * every quality at the full stored size first, then the same qualities at a
 * smaller one. Resolution is the last thing given up, because a block that
 * is 40 pixels across has none to spare.
 *
 * Twelve rungs at most, and the first one wins for anything but a very large
 * block full of photographic detail.
 */
export function encodeAttempts(block: Box, maxLongEdge = STORED_MAX_LONG_EDGE): EncodeAttempt[] {
  const box = targetBox(block, maxLongEdge);
  const full = Math.max(box.width, box.height);
  const edges: number[] = [];
  for (const factor of EDGE_LADDER) {
    const edge = Math.max(MIN_LONG_EDGE, Math.round(full * factor));
    if (!edges.includes(edge)) edges.push(edge);
  }
  return edges.flatMap((edge) => QUALITY_LADDER.map((quality) => ({ maxLongEdge: edge, quality })));
}

/**
 * True for the one file this page must not touch: a GIF that already fits.
 *
 * Drawing a GIF to a canvas keeps its first frame and throws the rest away,
 * so re-encoding an animated one would silently turn it into a still. A GIF
 * already inside the stored budget and inside the stored size needs nothing
 * done to it, so it is sent exactly as the buyer chose it and keeps whatever
 * animation it had.
 *
 * It deliberately does not ask whether the GIF moves — that question belongs
 * to `gif.ts`, which walks the block structure, and it is asked for a
 * different reason: not to decide what to send, but to tell the buyer on the
 * confirmation screen that an animation is about to become a still.
 */
export function shouldSendUntouched(type: string, size: number, width: number, height: number): boolean {
  return (
    type === "image/gif" &&
    size <= TARGET_STORED_BYTES &&
    width <= STORED_MAX_LONG_EDGE &&
    height <= STORED_MAX_LONG_EDGE
  );
}
