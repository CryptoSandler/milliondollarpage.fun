import type { BlockDetails, BoardRect } from "./blocks";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  RULE_PIXELS,
  type Point,
  type Rect,
  presetRect,
  rectContains,
  snapRect,
} from "./geometry";
import { formatUsdc } from "./pricing";
import type { Selection } from "./selection";

/**
 * The board's keyboard cursor: which rectangle a key press moves it to, and
 * the sentence a screen reader is told about where it now is.
 *
 * Called by BoardCanvas (src/components/BoardCanvas.tsx), which owns the
 * canvas and its key handler but has no business deciding geometry: the board
 * is a `<canvas>`, so a keyboard user has no pointer to snap and no rectangle
 * to read, and both of those have to be produced rather than observed. Neither
 * half belongs in a component — an off-by-one in the first is invisible in the
 * browser and expensive in the database, and the second is the ONLY thing a
 * screen-reader user is ever told about a million pixels they cannot see.
 * Both are unit tested here instead of eyeballed against a canvas.
 *
 * THERE IS NO SECOND GEOMETRY HERE. Every rectangle this module returns comes
 * out of `snapRect` or `presetRect`, the same two functions the pointer path
 * uses, so the half-open rule and the slide-back-on-the-board behaviour near
 * an edge are inherited rather than restated. What this module adds is only
 * which two points to hand them.
 *
 * ponytail: the cursor walks the RULING — ten pixels a press, a hundred with
 * shift — which is what it did when ten pixels was also the smallest thing
 * anybody could buy. Rectangles are exact to the pixel now, so a pointer can
 * draw one this keyboard cannot: a 1×1 at (137, 41). Closing that needs a
 * third tier of step, and which key carries it is a decision about bindings
 * rather than about geometry, so it is left to whoever owns the selector
 * rather than invented here. Everything below is in pixels and would take the
 * finer step without restructuring.
 */

/** How many rules a plain arrow moves, and how many a shifted one does. */
export const CURSOR_STEP_RULES = 1;

/**
 * The shifted step, and it is not an arbitrary "faster".
 *
 * The board is ruled in two tiers: a faint rule every ten pixels and a stronger
 * one every hundred. A plain arrow walks the fine tier; a shifted arrow
 * walks the coarse one, so a keyboard cursor crosses the board the same way an
 * eye does — by the ruling that is already drawn for exactly that job.
 */
export const CURSOR_LEAP_RULES = 10;

export type CursorCommand =
  /** Translate the rectangle, in rules. */
  | { kind: "move"; dx: number; dy: number }
  /** Grow or shrink it from its top-left anchor, in rules. */
  | { kind: "resize"; dw: number; dh: number };

const ARROWS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * What an arrow key means, given the modifiers held with it.
 *
 * Alt resizes and Shift leaps, and those are the two the platform leaves free:
 * the browser binds nothing to a bare arrow inside a canvas, Shift-arrow is a
 * selection gesture everywhere it appears, and Alt-arrow is the only remaining
 * pair — its one conflict, Chrome's history navigation on Windows, is
 * cancellable and the caller cancels it.
 *
 * Returns null for every other key, which is what tells the caller to leave
 * the event alone rather than swallow it.
 */
export function keyToCommand(
  key: string,
  modifiers: { shiftKey: boolean; altKey: boolean },
): CursorCommand | null {
  const arrow = ARROWS[key];
  if (!arrow) return null;
  const step = modifiers.shiftKey ? CURSOR_LEAP_RULES : CURSOR_STEP_RULES;
  if (modifiers.altKey) return { kind: "resize", dw: arrow.x * step, dh: arrow.y * step };
  return { kind: "move", dx: arrow.x * step, dy: arrow.y * step };
}

/** The pixel the cursor appears on when it does not exist yet. */
const CURSOR_HOME: Point = { x: 0, y: 0 };

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Where the cursor goes for one command.
 *
 * `rect` is null before the cursor exists — the board takes focus without
 * selecting anything, so the first arrow press puts it down rather than
 * carrying an invisible one around — and the answer is then the home
 * rectangle whichever way the arrow pointed.
 *
 * `presetSize` is the size button currently held down in the panel. A preset
 * is a fixed rectangle by definition: it moves and it cannot be resized, and
 * `presetRect` is what slides it back onto the board near an edge rather than
 * letting it shrink into something the button did not name.
 */
export function nextCursor(
  rect: Rect | null,
  command: CursorCommand,
  presetSize: number | null,
): Rect {
  if (rect === null) {
    // One fine rule square, not the single pixel `snapRect` would return for a
    // point: the cursor is walked by the ruling, so it starts the size of one.
    return presetSize === null
      ? snapRect(CURSOR_HOME, { x: RULE_PIXELS - 1, y: RULE_PIXELS - 1 })
      : presetRect(CURSOR_HOME, presetSize);
  }

  if (command.kind === "resize") {
    // A preset's whole point is that it is the size the button says. Refusing
    // here rather than quietly dropping back to freehand keeps the panel's
    // pressed button honest about what is selected.
    if (presetSize !== null) return rect;
    const w = clamp(rect.w + command.dw * RULE_PIXELS, RULE_PIXELS, BOARD_WIDTH - rect.x);
    const h = clamp(rect.h + command.dh * RULE_PIXELS, RULE_PIXELS, BOARD_HEIGHT - rect.y);
    return snapRect({ x: rect.x, y: rect.y }, { x: rect.x + w - 1, y: rect.y + h - 1 });
  }

  const at = {
    x: rect.x + command.dx * RULE_PIXELS,
    y: rect.y + command.dy * RULE_PIXELS,
  };
  if (presetSize !== null) return presetRect(at, presetSize);

  // The TOP-LEFT is clamped before the two corners go to `snapRect`, and that
  // ordering is the whole of it: `snapRect` clamps each point on its own, so a
  // 100-wide rectangle walked off the left edge would keep its right corner
  // and come back 99 wide. Clamping the translation instead moves the whole
  // rectangle or none of it.
  const x = clamp(at.x, 0, BOARD_WIDTH - rect.w);
  const y = clamp(at.y, 0, BOARD_HEIGHT - rect.h);
  return snapRect({ x, y }, { x: x + rect.w - 1, y: y + rect.h - 1 });
}

/**
 * The rectangle under the cursor's own top-left corner, or null.
 *
 * Exported because the canvas needs the same answer for a different reason:
 * it is what has to be FETCHED before the sentence below can name a caption.
 * One definition, so the rectangle whose words are requested is always the
 * rectangle the sentence then describes.
 */
export function rectUnderCursor(rect: Rect, rects: BoardRect[]): BoardRect | null {
  return rects.find((other) => rectContains(other, { x: rect.x, y: rect.y })) ?? null;
}

/**
 * What is under the cursor's own corner, said the way the hover card says it.
 *
 * A pointer gets that card for free; a keyboard cursor gets nothing, and the
 * captions, the links and the sold/held state of every rectangle on the board
 * would otherwise be reachable by mouse alone.
 *
 * THE CAPTION NOW ARRIVES SEPARATELY, and that is the one thing the
 * representation change moved through this function. The board payload used to
 * carry every block's words; it carries none, so the caption comes from
 * `details` — the same on-demand fetch the hover card uses, keyed by id. While
 * that fetch is in flight there is no entry, and the sentence says what it
 * knows rather than guessing: a sold rectangle whose words have not arrived is
 * still announced as a sold rectangle. The mirror waits for the cursor to
 * settle before it speaks, which is most of the time the fetch needs anyway.
 */
function beneath(rect: Rect, rects: BoardRect[], details: Map<string, BlockDetails>): string {
  const under = rectUnderCursor(rect, rects);
  if (!under) return "";
  const known = details.get(under.id);
  // A hold publishes no caption at all (see blocks.ts), so the branch that
  // names one is only ever reached by a sale. All three are written out
  // anyway, because a payload that starts carrying one must not start reading
  // wrong.
  const named = !known ? "" : known.caption ? ` called ${known.caption}` : " with no caption";
  return under.status === "reserved"
    ? `Under the cursor: a block on hold${named}. `
    : `Under the cursor: a sold block${named}. `;
}

/**
 * The cursor, in words.
 *
 * This is the live text mirror a `<canvas>` cannot provide for itself: nothing
 * inside a canvas is exposed to assistive technology, so where the cursor is,
 * how big it is, what it costs and what stands in its way exist only as
 * painted pixels until this sentence is written.
 *
 * `hint` is the very sentence already printed under the Buy button, passed
 * straight through rather than rewritten. Two wordings of "why can you not buy
 * this" would drift apart, and the one a screen reader hears would be the one
 * nobody was looking at when they did.
 *
 * `details` is the caption cache the hover card reads from, handed in rather
 * than fetched here so this stays pure and stays tested. The board's words
 * moved off the payload and onto a per-rectangle route when the wall became a
 * composite; the live region moved with them rather than losing the caption
 * it had only just been given.
 */
export function describeCursor(
  selection: Selection | null,
  rects: BoardRect[],
  details: Map<string, BlockDetails>,
  hint: string,
): string {
  if (!selection) return `Nothing selected. ${hint}`;
  const { rect } = selection;
  return (
    `${rect.w} by ${rect.h} at ${rect.x}, ${rect.y}. ` +
    `${selection.pixels.toLocaleString("en-US")} pixels, ${formatUsdc(selection.totalBaseUnits)}. ` +
    `${beneath(rect, rects, details)}${hint}`
  );
}
