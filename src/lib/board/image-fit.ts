/**
 * Where a bitmap lands inside the rectangle that was bought.
 *
 * Called by `src/components/BoardCanvas.tsx`, which turns the two rectangles
 * `placeImage` returns into the nine-argument form of `drawImage`; by
 * `./image-plan.ts`, which shares `centredCrop` so the crop applied when an
 * image is STORED and the crop applied when it is DRAWN can never be two
 * different crops; by `./content.ts` and `src/components/ContentForm.tsx`,
 * which ask `canHonourContain` whether `contain` is a fit this purchase can
 * actually be given; and by `./__tests__/image-fit.test.ts`.
 *
 * WHY THIS IS NOT INLINE IN THE CANVAS. The board used to call
 * `drawImage(image, x, y, w, h)` — five arguments, which stretches whatever
 * it is given to whatever shape the block happens to be. A buyer who chose
 * "Fit inside" for a wide photograph on a square block approved a letterboxed
 * preview and got a squashed one, permanently, because the content is
 * immutable once paid. The arithmetic that stops that has to be provable
 * without a canvas, so it lives here and is unit tested.
 *
 * IT REPRODUCES CSS `object-fit`, DELIBERATELY.
 * `src/components/ConfirmationStep.tsx` shows the buyer their picture in an
 * `<img>` with `style={{ objectFit: draft.imageFit }}`, and that preview is
 * the promise the board has to keep. `contain` therefore scales by the SMALLER
 * of the two ratios and centres what is left over; `cover` scales by the
 * larger and centres the crop. Same two rules, same centring, so the preview
 * and the board are the same picture.
 *
 * PURE: no canvas, no DOM, no `Image`. It is handed numbers and returns
 * numbers, which is also why `BoardCanvas` (a "use client" component) can
 * import it without dragging anything into the browser bundle.
 */

/** The two ways a picture may be made to fit a rectangle it does not match. */
export type Fit = "contain" | "cover";

export type Box = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * The part of the source to read, and the part of the block to write it to.
 *
 * Both are absolute: `dest` is already offset by the block's own position on
 * the canvas, so a caller passes these straight through to `drawImage`
 * without further arithmetic — the arithmetic is the whole point of asking.
 */
export type Placement = { source: Rect; dest: Rect };

/**
 * A degenerate size is treated as one pixel rather than divided by.
 *
 * A 1×1 image is a real thing a buyer can upload and it must letterbox like
 * any other; a 0×0 one cannot exist as a decoded bitmap, but an undecoded
 * `Image` reports exactly that, and a NaN rectangle would silently paint
 * nothing while looking like a drawing bug rather than a loading state.
 */
function atLeastOne(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * The largest centred rectangle of `box`'s shape that fits inside the source.
 *
 * This is `cover`'s crop, and it is shared with the encoder: `plannedEncode`
 * crops a covering upload to the block's shape before storing it, and the
 * board crops again on the way to the screen. The second crop is a no-op on
 * anything this app stored — which is exactly the property that would rot if
 * these were two hand-written copies of the same three lines.
 */
export function centredCrop(sourceWidth: number, sourceHeight: number, box: Box): Rect {
  const width = Math.min(sourceWidth, sourceHeight * (box.width / box.height));
  const height = Math.min(sourceHeight, sourceWidth / (box.width / box.height));
  return { x: (sourceWidth - width) / 2, y: (sourceHeight - height) / 2, width, height };
}

/**
 * What to read and where to draw it, for one bitmap in one block.
 *
 * `contain` never crops: the whole source is drawn, scaled down until both
 * edges fit, and centred — so the block keeps bars on two sides and the
 * picture keeps its shape. The caller is responsible for what those bars show
 * (the board paints the sheet's own cream over the whole rectangle first, so
 * the graph ruling can never come back through a block somebody bought).
 *
 * `cover` never leaves a gap: the source is cropped, centred, to the block's
 * own shape and then fills it edge to edge.
 *
 * Neither ever distorts. That is the one thing the five-argument `drawImage`
 * this replaced could not promise.
 */
export function placeImage(source: Box, block: Rect, fit: Fit): Placement {
  const sourceWidth = atLeastOne(source.width);
  const sourceHeight = atLeastOne(source.height);
  const blockWidth = atLeastOne(block.width);
  const blockHeight = atLeastOne(block.height);

  if (fit === "cover") {
    return {
      source: centredCrop(sourceWidth, sourceHeight, { width: blockWidth, height: blockHeight }),
      dest: { x: block.x, y: block.y, width: blockWidth, height: blockHeight },
    };
  }

  const scale = Math.min(blockWidth / sourceWidth, blockHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    source: { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
    dest: {
      x: block.x + (blockWidth - width) / 2,
      y: block.y + (blockHeight - height) / 2,
      width,
      height,
    },
  };
}

/**
 * How close to zero a bar has to be before it counts as no bar at all, in
 * block pixels.
 *
 * `min(w/sw, h/sh)` is a division and a multiplication away from an exact
 * match, so a source that genuinely has the block's own shape can come back a
 * few ulps short of filling it. A millionth of a pixel is not a bar on any
 * wall.
 */
const NO_BAR_AT_ALL = 1e-6;

/**
 * Whether `contain` is a fit this purchase can actually be GIVEN, rather than
 * only promised.
 *
 * IT ASKS `placeImage`, IT DOES NOT RESTATE IT. With the block put at the
 * origin, the destination's own x and y ARE the bars — the left one and the
 * top one — so "how much of the block is left over" is answered by the very
 * call the board draws with. Change the placement and this changes with it;
 * that is the whole reason it lives in this file rather than beside either
 * caller.
 *
 * THE INPUT IS (SOURCE, BLOCK), NOT THE BLOCK ALONE. A block-only threshold
 * would have to assume a source, and the source is half the answer: a 200×50
 * rectangle letterboxes a square photograph with enormous bars and cannot
 * letterbox a 4:1 banner at all. The buyer's picture is known at both call
 * sites — the browser has already decoded it for the thumbnail, and the
 * server reads its size off the stored bytes with `sharp` — so the answer is
 * exact rather than a guess about what somebody might upload.
 *
 * THREE OUTCOMES, AND ONLY THE MIDDLE ONE IS A LIE.
 *   - Bars of at least one whole block pixel per side: the wall draws them,
 *     and `contain` means what it says.
 *   - No bars at all, because the picture already has the block's shape:
 *     `contain` and `cover` are then the same picture and both are honoured.
 *     A rule that demanded VISIBLE bars would refuse this one, which is the
 *     wide logo in the wide rectangle the owner's verdict said not to touch.
 *   - Bars thinner than a whole block pixel: `composite.ts` resizes to whole
 *     pixels and pads with what is left over, so a thin bar is rounded away
 *     or rounded into existence rather than drawn at the size it was
 *     computed. A buyer who picked "Fit inside" would be looking at a fill,
 *     permanently. That is the promise this refuses to let anybody make, and
 *     the whole band is refused rather than the half of it that rounds down:
 *     a bar a buyer was promised should be a bar a buyer was shown, not one
 *     the renderer happened to round into existence.
 */
export function canHonourContain(source: Box, block: Box): boolean {
  const { dest } = placeImage(source, { x: 0, y: 0, width: block.width, height: block.height }, "contain");
  const bar = Math.max(dest.x, dest.y);
  return bar < NO_BAR_AT_ALL || bar >= 1;
}

/**
 * How far apart two aspect ratios have to be before `contain` is the wrong
 * default.
 *
 * TWO, MEASURED RATHER THAN CHOSEN. `docs/imagenes.md` §2 put twenty real flags
 * through the pipeline and read the bars off the result: a 31×169 column spent
 * **88%** of what its buyer paid on flat grey, a 173×16 strip 85%, a 6×40 block
 * 90%. Every one of those is well past a factor of two; nothing below two was
 * anywhere near as bad. So two is where the honest default flips.
 */
export const ASPECT_GAP_FOR_COVER = 2;

/**
 * Which fit to OPEN the form on, for this picture in this rectangle.
 *
 * WHO CALLS THIS: `src/components/ContentForm.tsx`, once per picture, and the
 * buyer can change it immediately afterwards. It is a default and never a
 * decision — `docs/imagenes.md` is explicit that the two fits stay and that the
 * buyer still chooses; what changed is which one they start on.
 *
 * WHY IT IS NOT JUST `canHonourContain`. That answers a different question —
 * whether `contain` can be drawn at all — and it is false only for rectangles
 * so extreme the bars leave no room. Everything between "impossible" and
 * "fine" was defaulting to `contain` and spending most of a purchase on grey.
 *
 * `cover` crops and `contain` letterboxes, and both are lossy in their own way.
 * The trade below is deliberately asymmetric: a crop loses the edges of a
 * picture, bars lose the middle of a RECTANGLE SOMEBODY PAID FOR by the pixel.
 */
export function defaultFit(source: Box, block: Box): Fit {
  if (!canHonourContain(source, block)) return "cover";
  if (source.width <= 0 || source.height <= 0 || block.width <= 0 || block.height <= 0) {
    return "contain";
  }
  const sourceAspect = source.width / source.height;
  const blockAspect = block.width / block.height;
  const gap = sourceAspect > blockAspect ? sourceAspect / blockAspect : blockAspect / sourceAspect;
  return gap > ASPECT_GAP_FOR_COVER ? "cover" : "contain";
}
