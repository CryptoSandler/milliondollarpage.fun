import type { BoardRect } from "./blocks";

/**
 * When the board should stop trusting the composite, and which rectangles it
 * should draw properly instead.
 *
 * WHO CALLS THIS. `src/components/BoardCanvas.tsx`, which asks `wantsDetail`
 * once per frame and `detailRects` when the answer is yes, then fetches and
 * draws those rectangles' own stored bitmaps over the wall.
 * `./__tests__/detail.test.ts` is the other caller. It is a module rather than
 * three lines inside the canvas because it is arithmetic about what is on
 * screen, and arithmetic about what is on screen is exactly the kind of thing
 * that is invisible when it is wrong and provable when it is written down.
 *
 * THE GAP IT CLOSES. The composite is one image pixel per WALL pixel — that is
 * what makes it one request for the whole board. But a purchase stores four
 * image pixels per wall pixel (`targetBox` in ./image-plan.ts), so above 1:1
 * the board has been enlarging an overview of detail it already holds, and the
 * buyer already paid for. Past the zoom where the graph ruling comes back —
 * one wall pixel to about eight screen pixels — the stored bitmaps are drawn
 * on top, and the request count stays small because at that zoom very little
 * of the board is on screen.
 *
 * The composite remains the overview and is never replaced: it is what a
 * fitted board is drawn from, it is what covers every rectangle this module
 * does not name, and it is what stays on screen while a detail bitmap is still
 * in flight.
 */

/**
 * The zoom at which stored bitmaps start being drawn: eight screen pixels per
 * wall pixel.
 *
 * The same number as the graph ruling's, and deliberately the same number
 * rather than a near neighbour of it. DESIGN.md's ruling appears "only above
 * the zoom where one wall pixel is about eight screen pixels", which is its
 * own statement of when a single wall pixel becomes something a person is
 * looking AT rather than looking past — and that is exactly the question this
 * threshold asks. BoardCanvas takes its `RULE_VISIBLE_SCALE` from here so the
 * two cannot drift.
 *
 * At 8, a stored image is being drawn at two screen pixels per stored pixel:
 * the first rung where the extra resolution is genuinely visible.
 */
export const DETAIL_MIN_SCALE = 8;

/**
 * How many rectangles may be drawn from their own bitmaps on one frame.
 *
 * A ceiling on requests, not on drawing. At the lowest detail rung the visible
 * board is about 156 × 100 wall pixels, which a wall of one-pixel purchases
 * could fill with fifteen thousand rectangles — and asking for fifteen
 * thousand bitmaps to sharpen a region the composite already draws correctly
 * enough would be the per-block fetching this project deleted, brought back at
 * the worst possible zoom.
 *
 * Twenty-four is what the eye is actually reading: the rectangles that cover
 * most of the view. Everything else keeps the composite's own pixels, which
 * are not wrong — they are simply the overview.
 */
export const DETAIL_MAX_RECTS = 24;

/** Whether this zoom is close enough for a stored bitmap to be worth fetching. */
export function wantsDetail(scale: number): boolean {
  return scale >= DETAIL_MIN_SCALE;
}

export type Screen = { width: number; height: number };

/**
 * The rectangles worth drawing from their own bitmaps, biggest share of the
 * view first.
 *
 * SOLD ONLY. A hold has no public bitmap — the image route serves `paid` and
 * `minted` alone — and drawing one would be drawing pixels nobody has paid
 * for. Holds keep the canvas's own treatment at every zoom.
 *
 * ORDERED BY HOW MUCH OF THE SCREEN THEY ACTUALLY COVER, so the cap spends
 * itself on what somebody is looking at. A rectangle one pixel inside the edge
 * of the viewport ranks below one filling the middle of it, which is the
 * ordering a person would pick by hand.
 *
 * `origin` is where wall pixel (0,0) lands on the screen, and `scale` is
 * screen pixels per wall pixel — the same two numbers the caller draws
 * everything else with, passed in rather than recomputed, so this can never
 * disagree with the frame it is describing.
 */
export function detailRects(
  rects: BoardRect[],
  origin: { x: number; y: number },
  scale: number,
  screen: Screen,
  limit = DETAIL_MAX_RECTS,
): BoardRect[] {
  const scored: { rect: BoardRect; visible: number }[] = [];

  for (const rect of rects) {
    if (rect.status === "reserved") continue;
    const visible =
      overlap(origin.x + rect.x * scale, rect.w * scale, screen.width) *
      overlap(origin.y + rect.y * scale, rect.h * scale, screen.height);
    if (visible <= 0) continue;
    scored.push({ rect, visible });
  }

  // Sorted by id after area so a tie between two equally visible rectangles
  // resolves the same way on every frame. Without it, two rectangles of the
  // same size either side of the cap could swap places between frames and
  // flicker against each other.
  scored.sort((a, b) => b.visible - a.visible || (a.rect.id < b.rect.id ? -1 : 1));
  return scored.slice(0, limit).map((entry) => entry.rect);
}

/** How much of a span, starting at `at` and `length` long, lands inside 0..`window`. */
function overlap(at: number, length: number, window: number): number {
  return Math.max(0, Math.min(at + length, window) - Math.max(at, 0));
}
