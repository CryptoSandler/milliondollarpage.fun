/**
 * The board's shape, and every rule about what counts as a rectangle on it.
 *
 * Pure on purpose. Rounding and intersection are the two places where an
 * off-by-one is invisible in the browser and expensive in the database, so
 * they are unit tested rather than eyeballed against a canvas.
 *
 * One rule matters more than the rest: rectangles are HALF-OPEN. A block at
 * x=0 with w=1 covers pixel 0 and does not touch pixel 1. Postgres enforces
 * the same thing with int4range, and the two definitions must never drift
 * apart — if they do, the browser and the database disagree about whether two
 * neighbouring blocks collide.
 *
 * THE UNIT IS THE PIXEL. There is no grid to snap to and no minimum size: a
 * purchase is any free rectangle, exact to the pixel, priced at its area. The
 * 10-pixel block that used to be the unit is gone; what survives of it is the
 * ruling below, which is a thing the board is drawn with rather than a thing
 * it is sold in.
 */

/**
 * 1250 × 800, which is exactly 1,000,000 pixels.
 *
 * The million is the product and it is not negotiable; the shape is chosen to
 * sit in a landscape window without the dead margin a square board left beside
 * it. Two constants rather than one, because the wall is not square any more
 * and a single number used as both width and height is a bug waiting for the
 * first person who reads it.
 */
export const BOARD_WIDTH = 1250;
export const BOARD_HEIGHT = 800;
export const TOTAL_PIXELS = BOARD_WIDTH * BOARD_HEIGHT;

/**
 * The graph paper's fine ruling, in pixels. NOT a rule about what may be
 * bought.
 *
 * It used to be BLOCK_PIXELS, the unit of sale, and every rectangle had to be
 * a whole number of them. Now nothing is measured in it: a buyer may take one
 * pixel, or 137 by 41, and neither the browser nor the database cares where
 * the ruling falls. It stays because two callers still navigate by it — the
 * canvas draws a faint line every ten pixels and a stronger one every hundred,
 * and the keyboard cursor walks those same two tiers so that moving by key
 * follows the ruling an eye is already using.
 */
export const RULE_PIXELS = 10;

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** The pixel a board coordinate falls inside, clamped to the wall. */
function clampX(value: number): number {
  return Math.min(BOARD_WIDTH - 1, Math.max(0, Math.floor(value)));
}

function clampY(value: number): number {
  return Math.min(BOARD_HEIGHT - 1, Math.max(0, Math.floor(value)));
}

/**
 * The exact rectangle of pixels covered by a drag between two points.
 *
 * Still called snapRect, and it still snaps — to the PIXEL, not to a grid. A
 * pointer sits at a fractional board coordinate (2.7 board pixels at a fit
 * scale of 0.37), and the pixel it is inside is the one the buyer means, so
 * each end is floored to a whole pixel and both ends are included. A drag that
 * begins and ends inside the same pixel therefore buys that one pixel, for a
 * dollar, which is the whole model.
 *
 * Both ends INCLUSIVE, and then a half-open rectangle: from pixel 4 to pixel 7
 * is x=4, w=4. Anything else would let a buyer pay for a rectangle that does
 * not contain what they dragged over.
 */
export function snapRect(a: Point, b: Point): Rect {
  const ax = clampX(a.x);
  const bx = clampX(b.x);
  const ay = clampY(a.y);
  const by = clampY(b.y);

  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  return { x, y, w: Math.max(ax, bx) - x + 1, h: Math.max(ay, by) - y + 1 };
}

/**
 * A fixed-size preset anchored at the pixel under the pointer.
 *
 * Presets are a convenience — the sizes a buyer would otherwise have to drag
 * by hand — and no longer the unit of anything. Near an edge the preset SLIDES
 * back onto the board rather than shrinking: a 100×100 preset always buys
 * 10,000 pixels, or the buyer would silently pay for a different rectangle
 * than the one the button named.
 */
export function presetRect(at: Point, size: number): Rect {
  const x = Math.min(BOARD_WIDTH - size, clampX(at.x));
  const y = Math.min(BOARD_HEIGHT - size, clampY(at.y));
  return { x: Math.max(0, x), y: Math.max(0, y), w: size, h: size };
}

export function rectPixels(rect: Rect): number {
  return rect.w * rect.h;
}

/** Half-open intersection: sharing an edge or a corner is not overlapping. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Half-open containment: a point on the right or bottom edge is OUTSIDE. */
export function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.w &&
    point.y >= rect.y &&
    point.y < rect.y + rect.h
  );
}

/**
 * Whether a rectangle is one this board can sell.
 *
 * Three rules, where there used to be five. The grid is gone and the minimum
 * is one pixel, so what is left is: it is made of whole pixels, it has area,
 * and it is on the wall.
 *
 * The whole-pixel test is not tidiness. `x`, `y`, `w` and `h` are `integer`
 * columns, and Postgres ROUNDS a fractional value into one rather than
 * refusing it — so 137.5 would be quoted to the buyer, charged as 137.5, and
 * stored as 138. The old grid check happened to catch that (137.5 % 10 is not
 * 0); nothing else would, so it is stated outright here at the boundary the
 * request crosses.
 */
export function rectIsValid(rect: Rect): boolean {
  const { x, y, w, h } = rect;
  if (![x, y, w, h].every(Number.isSafeInteger)) return false;
  if (w < 1 || h < 1) return false;
  if (x < 0 || y < 0) return false;
  return x + w <= BOARD_WIDTH && y + h <= BOARD_HEIGHT;
}

/**
 * The one milestone this wall marks, in PIXELS.
 *
 * WHO READS THIS: `src/app/stats/page.tsx`, and nothing else — deliberately.
 * `DECISIONS.md`, "the moment this wall tells somebody about is the first 1,000
 * pixels": it is parity with the original, it is counted in pixels rather than
 * in dollars (the two are the same figure here, and pixels keep the sentence
 * about the wall rather than about the money), and it lives on the page
 * somebody opened to ask rather than beside the offer. A countdown next to the
 * Buy button would be the wall asking to be hurried.
 */
export const MILESTONE_PIXELS = 1_000;
