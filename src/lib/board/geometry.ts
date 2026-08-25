/**
 * The board's shape, and every rule about what counts as a rectangle on it.
 *
 * Pure on purpose. Snapping and intersection are the two places where an
 * off-by-one is invisible in the browser and expensive in the database, so
 * they are unit tested rather than eyeballed against a canvas.
 *
 * One rule matters more than the rest: rectangles are HALF-OPEN. A block at
 * x=0 with w=10 covers pixels 0..9 and does not touch pixel 10. Postgres
 * enforces the same thing with int4range, and the two definitions must never
 * drift apart — if they do, the browser and the database disagree about
 * whether two neighbouring blocks collide.
 */

export const BOARD_PIXELS = 1000;
export const BLOCK_PIXELS = 10;
export const TOTAL_PIXELS = BOARD_PIXELS * BOARD_PIXELS;

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

function clampToBoard(value: number): number {
  return Math.min(BOARD_PIXELS - 1, Math.max(0, Math.floor(value)));
}

function blockStart(pixel: number): number {
  return Math.floor(pixel / BLOCK_PIXELS) * BLOCK_PIXELS;
}

/**
 * The smallest grid-aligned rectangle covering both points.
 *
 * Snaps OUTWARD: a drag that clips one pixel of a block selects the whole
 * block. Anything else would let a buyer pay for a rectangle that does not
 * contain what they dragged over.
 */
export function snapRect(a: Point, b: Point): Rect {
  const ax = clampToBoard(a.x);
  const ay = clampToBoard(a.y);
  const bx = clampToBoard(b.x);
  const by = clampToBoard(b.y);

  const x = blockStart(Math.min(ax, bx));
  const y = blockStart(Math.min(ay, by));
  const right = blockStart(Math.max(ax, bx)) + BLOCK_PIXELS;
  const bottom = blockStart(Math.max(ay, by)) + BLOCK_PIXELS;

  return { x, y, w: right - x, h: bottom - y };
}

/**
 * A fixed-size preset anchored at the block under the pointer.
 *
 * Near an edge the preset SLIDES back onto the board rather than shrinking:
 * a 100×100 preset always buys 10,000 pixels, or the buyer would silently pay
 * for a different rectangle than the one the button named.
 */
export function presetRect(at: Point, size: number): Rect {
  const maxStart = BOARD_PIXELS - size;
  const x = Math.min(maxStart, blockStart(clampToBoard(at.x)));
  const y = Math.min(maxStart, blockStart(clampToBoard(at.y)));
  return { x: Math.max(0, x), y: Math.max(0, y), w: size, h: size };
}

export function rectPixels(rect: Rect): number {
  return rect.w * rect.h;
}

/** Half-open intersection: sharing an edge or a corner is not overlapping. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectIsValid(rect: Rect): boolean {
  const { x, y, w, h } = rect;
  if (w < BLOCK_PIXELS || h < BLOCK_PIXELS) return false;
  if (x % BLOCK_PIXELS !== 0 || y % BLOCK_PIXELS !== 0) return false;
  if (w % BLOCK_PIXELS !== 0 || h % BLOCK_PIXELS !== 0) return false;
  if (x < 0 || y < 0) return false;
  return x + w <= BOARD_PIXELS && y + h <= BOARD_PIXELS;
}
