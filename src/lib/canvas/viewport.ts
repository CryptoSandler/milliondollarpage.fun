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
 * The view the board opens on: the whole thing visible, centred in the space
 * the bars leave rather than in the viewport.
 *
 * The bars float over the canvas, so the canvas is the full viewport and the
 * board has to be placed inside a smaller region. `boardToScreen` maps the
 * board's centre to the screen's centre, so landing it in the free region's
 * centre means offsetting centreY by half the difference between the bars.
 *
 * The clamp on scale is not decoration: a viewport shorter than its own bars
 * yields a non-positive scale, and every screen-to-board conversion downstream
 * divides by it.
 */
const MIN_INITIAL_SCALE = 0.01;

export function initialViewport(screen: Size, bars: { top: number; bottom: number }, board: Size): Viewport {
  const usableHeight = Math.max(1, screen.height - bars.top - bars.bottom);
  const usableWidth = Math.max(1, screen.width);
  const scale = Math.max(
    MIN_INITIAL_SCALE,
    Math.min(usableWidth / board.width, usableHeight / board.height),
  );
  return {
    scale,
    centreX: board.width / 2,
    centreY: board.height / 2 - (bars.top - bars.bottom) / (2 * scale),
  };
}
