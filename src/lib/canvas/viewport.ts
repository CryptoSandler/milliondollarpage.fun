/**
 * Zoom, pan, and the screen-to-board conversion, with no DOM in sight.
 *
 * Kept pure so the fiddly part — the part where a zoom drifts by half a pixel
 * and nobody can say why — is unit tested instead of eyeballed.
 *
 * This board is 1000x1000 pixels. It has to stay readable zoomed all the way
 * out to fit a laptop screen, and zoomable in far enough to pick out a single
 * 10-pixel block.
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

/** Zooms about a screen point, leaving whatever is under it exactly where it is. */
export function zoomAt(
  v: Viewport,
  screen: Size,
  point: Point,
  factor: number,
  limits: { min: number; max: number },
): Viewport {
  const scale = Math.min(limits.max, Math.max(limits.min, v.scale * factor));
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
