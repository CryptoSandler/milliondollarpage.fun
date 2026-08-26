/**
 * Zoom, pan, and the screen-to-board conversion, with no DOM in sight.
 *
 * Kept pure so the fiddly part — the part where a zoom drifts by half a pixel
 * and nobody can say why — is unit tested instead of eyeballed.
 *
 * This board is 1000x1000 pixels. It has to stay readable zoomed all the way
 * out to fit a laptop screen, and zoomable in far enough to pick out a single
 * 10-pixel block.
 *
 * The last section of the file is about crispness rather than position: the
 * backing-store size and the zoom ladder that keep a board pixel sitting on a
 * whole number of screen pixels instead of somewhere between two.
 */

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Viewport = { centreX: number; centreY: number; scale: number };

/**
 * How far a pointer may travel and still count as a tap.
 *
 * Every pan on a touchscreen ends with a pointerup somewhere on the canvas. If
 * that always painted, the board would fill with pixels nobody meant to place.
 */
export const TAP_SLOP_PX = 8;

export function isTap(totalMovement: number): boolean {
  return totalMovement <= TAP_SLOP_PX;
}

export function boardToScreen(v: Viewport, screen: Size, board: Point): Point {
  return {
    x: screen.width / 2 + (board.x - v.centreX) * v.scale,
    y: screen.height / 2 + (board.y - v.centreY) * v.scale,
  };
}

export function screenToBoard(v: Viewport, screen: Size, point: Point): Point {
  return {
    x: v.centreX + (point.x - screen.width / 2) / v.scale,
    y: v.centreY + (point.y - screen.height / 2) / v.scale,
  };
}

/**
 * Zooms about a screen point, leaving whatever is under it exactly where it is.
 *
 * `target` is an ABSOLUTE scale, not a factor. That matters: the wheel snaps to
 * the rungs of `zoomLadder` below, and a rung reached by multiplying by
 * `rung / v.scale` arrives as 2.0000000000000004 rather than 2. The whole point
 * of the ladder is that a board pixel lands on a whole number of screen pixels,
 * so the exact value has to survive the trip.
 */
export function zoomToScale(
  v: Viewport,
  screen: Size,
  point: Point,
  target: number,
  limits: { min: number; max: number },
): Viewport {
  const scale = Math.min(limits.max, Math.max(limits.min, target));
  if (scale === v.scale) return v;

  const anchor = screenToBoard(v, screen, point);
  const offsetX = point.x - screen.width / 2;
  const offsetY = point.y - screen.height / 2;

  return {
    scale,
    centreX: anchor.x - offsetX / scale,
    centreY: anchor.y - offsetY / scale,
  };
}

export function panBy(v: Viewport, dxBoard: number, dyBoard: number): Viewport {
  return { ...v, centreX: v.centreX + dxBoard, centreY: v.centreY + dyBoard };
}

/** Keeps the centre on the board, so the canvas cannot be lost off-screen. */
export function clampToBoard(v: Viewport, board: Size): Viewport {
  return {
    ...v,
    centreX: Math.min(board.width, Math.max(0, v.centreX)),
    centreY: Math.min(board.height, Math.max(0, v.centreY)),
  };
}

/**
 * COVER, not contain.
 *
 * The board is scaled by WIDTH alone: the rendered board is exactly as wide as
 * the viewport, board pixels stay square, and whatever height that produces
 * overflows the free region between the bars and is panned. A 1000×1000 board
 * in a 1440px-wide window is 1440px tall, and that is correct — the alternative
 * (fitting the whole thing between the bars) leaves cream margins down both
 * sides of the artwork, which is the one thing the board must never do.
 *
 * The clamp on scale is not decoration: a zero-width viewport (the first paint,
 * before layout has run) yields a scale of zero, and every screen-to-board
 * conversion downstream divides by it.
 */
const MIN_INITIAL_SCALE = 0.01;

export function coverScale(screen: Size, board: Size): number {
  return Math.max(MIN_INITIAL_SCALE, screen.width / board.width);
}

/**
 * The range `centreY` may take while the board still covers the free region
 * between the bars, expressed in board pixels.
 *
 * `min` puts the board's TOP edge on the free region's top edge; `max` puts its
 * BOTTOM edge on the region's bottom edge. When the board is too short to span
 * the region — a very tall, narrow window — the range inverts (`min > max`),
 * which is the signal that there is nothing to pan and the board should simply
 * sit in the middle of the region instead.
 */
function verticalPanRange(
  screen: Size,
  bars: { top: number; bottom: number },
  board: Size,
  scale: number,
): { min: number; max: number } {
  const half = screen.height / 2;
  return {
    min: (half - bars.top) / scale,
    max: board.height - (screen.height - bars.bottom - half) / scale,
  };
}

/** Where the board sits when it is shorter than the region: centred in it. */
function centredInRegion(bars: { top: number; bottom: number }, board: Size, scale: number): number {
  return board.height / 2 - (bars.top - bars.bottom) / (2 * scale);
}

/**
 * The view the board opens on.
 *
 * Full-width, square pixels, and — when the board overflows the free region,
 * which is the normal case — anchored to its TOP edge rather than centred.
 * Top-aligned because the board's origin is (0, 0): a buyer landing mid-board
 * has no way to tell how much is above them, whereas landing on the top edge
 * makes the one visible boundary a fact about the artwork and turns every
 * remaining pixel into a downward scroll. It also matches where the canvas
 * fills in from, so the busiest part of the board is what greets a visitor.
 *
 * When the board is shorter than the region (a tall, narrow window) there is
 * nothing to anchor to, and it is centred between the bars instead.
 */
export function initialViewport(screen: Size, bars: { top: number; bottom: number }, board: Size): Viewport {
  const scale = coverScale(screen, board);
  const { min, max } = verticalPanRange(screen, bars, board, scale);
  return {
    scale,
    centreX: board.width / 2,
    centreY: min <= max ? min : centredInRegion(bars, board, scale),
  };
}

/**
 * Keeps the board covering the viewport while it is panned or zoomed.
 *
 * `clampToBoard` above only keeps the centre somewhere on the board, which is
 * enough to stop the canvas being lost but not enough to stop cream showing
 * down one side. This is the cover version: pan until an edge of the board
 * meets the corresponding edge of the free region and no further, in each axis
 * independently, so no drag can open a margin the design forbids.
 */
export function clampToCover(
  v: Viewport,
  screen: Size,
  bars: { top: number; bottom: number },
  board: Size,
): Viewport {
  const halfWidthInBoard = screen.width / 2 / v.scale;
  const centreX =
    board.width >= halfWidthInBoard * 2
      ? Math.min(board.width - halfWidthInBoard, Math.max(halfWidthInBoard, v.centreX))
      : board.width / 2;

  const { min, max } = verticalPanRange(screen, bars, board, v.scale);
  const centreY = min <= max ? Math.min(max, Math.max(min, v.centreY)) : centredInRegion(bars, board, v.scale);

  return { ...v, centreX, centreY };
}

/* ------------------------------------------------------------------------- *
 * Crisp pixels
 *
 * Blocks are small bitmaps of somebody's artwork. They have to read as SHARP
 * PIXELS at every scale the board offers, never as interpolated mush, which
 * takes two things: a backing store measured in real device pixels, and a zoom
 * that only ever stops where a board pixel covers a whole number of them.
 * ------------------------------------------------------------------------- */

/**
 * The canvas backing store for a CSS box at a given device pixel ratio.
 *
 * The canvas element has no intrinsic size — CSS gives it its box, and
 * `canvas.width`/`canvas.height` are a separate thing entirely: the number of
 * real pixels the browser allocates behind it. Leave them at the default 300×150
 * and the browser stretches that postage stamp across the whole viewport, which
 * is exactly the mush this board must not show. They must be the CSS size times
 * the device pixel ratio, and the drawing context scaled by the same ratio so
 * everything downstream can keep speaking CSS pixels.
 *
 * Rounded, because a backing store is a whole number of pixels: a 1440.5 CSS
 * pixel box at a ratio of 1.5 wants 2160.75, and the browser would truncate
 * silently. Rounding here makes the half-pixel a decision instead.
 *
 * A ratio of zero, NaN, or undefined (`window.devicePixelRatio` on an ancient
 * browser) falls back to 1 rather than allocating a zero-sized store.
 */
export function backingStoreSize(css: Size, dpr: number): Size {
  const ratio = dpr > 0 ? dpr : 1;
  return {
    width: Math.round(css.width * ratio),
    height: Math.round(css.height * ratio),
  };
}

/**
 * The scales the wheel is allowed to stop on.
 *
 * The bottom rung is `cover` itself — the scale at which the board is exactly
 * as wide as the viewport. It is almost never an integer (1440 / 1000 = 1.44)
 * and it is not negotiable: anything below it opens cream margins down the
 * sides of the artwork, which DESIGN.md forbids outright. So the ladder is not
 * simply the powers of two.
 *
 * Above it are the powers of two STRICTLY GREATER than cover, up to `maxZoom`.
 * Each doubles the screen pixels per board pixel, so a board pixel is a 2×2,
 * 4×4, 8×8 or 16×16 square of screen pixels and every edge in the artwork lands
 * on a pixel boundary.
 *
 *   1440px wide → cover 1.44 → [1.44, 2, 4, 8, 16]
 *    900px wide → cover 0.90 → [0.9, 1, 2, 4, 8, 16]
 *
 * Note the 1440 case skips 1 entirely: 1 is below cover, so it is not a rung.
 * `cover` outranks `maxZoom` if they ever conflict, because a board that does
 * not cover is broken in a way that a board zoomed slightly too far is not.
 */
export function zoomLadder(cover: number, maxZoom: number): number[] {
  const rungs = [cover];
  for (let rung = 1; rung <= maxZoom; rung *= 2) {
    if (above(rung, cover)) rungs.push(rung);
  }
  return rungs;
}

/**
 * One step up or down the ladder from wherever the viewport currently sits.
 *
 * This replaces multiplying by a continuous 1.15 per wheel notch, which put a
 * board pixel on 1.87 screen pixels far more often than on 2 and made every
 * upload look soft.
 *
 * `current` is not assumed to be on a rung: a window resize recomputes cover
 * and can leave the scale anywhere, so the step is always "the nearest rung in
 * that direction" rather than an index.
 *
 * ONE HONEST CAVEAT, and it is not fixable from here. An integer CSS scale is
 * only an integer number of DEVICE pixels when `devicePixelRatio` is itself an
 * integer. At the 1.5 that Windows display scaling is full of, CSS scale 1 is
 * 1.5 device pixels per board pixel; at the 2.75 some Android phones report,
 * CSS scale 2 is 5.5. Snapping the ladder in device space instead would fix
 * that and break something worse — the bottom rung must be exactly `cover`,
 * an irrational-ish number fixed by the viewport width, and a device-space
 * ladder cannot contain it. So this ladder is deliberately in CSS space, and
 * on a fractional ratio the residual error is left to the nearest-neighbour
 * sampling that BoardCanvas turns on: the artwork degrades to some rows of
 * device pixels being one wider than their neighbours — hard edges, slightly
 * uneven — rather than to a blur. Integer ratios (1, 2, 3) are exact.
 */
export function nextZoomScale(
  current: number,
  direction: "in" | "out",
  cover: number,
  maxZoom: number,
): number {
  const rungs = zoomLadder(cover, maxZoom);
  const floor = rungs[0];
  const top = rungs[rungs.length - 1];
  // A scale that has drifted outside the ladder — a resize between wheel
  // notches — steps from the nearest end rather than falling off.
  const at = Math.min(top, Math.max(floor, current));

  if (direction === "in") return rungs.find((rung) => above(rung, at)) ?? top;
  const lower = rungs.filter((rung) => above(at, rung));
  return lower.length > 0 ? lower[lower.length - 1] : floor;
}

/**
 * `a > b`, with enough slack that a scale which has been through a float
 * round trip does not read as a rung above itself and step nowhere.
 */
function above(a: number, b: number): boolean {
  return a > b + 1e-9 * Math.max(1, Math.abs(b));
}
