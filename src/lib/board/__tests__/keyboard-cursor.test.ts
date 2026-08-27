import { describe, expect, it } from "vitest";
import type { BlockDetails, BoardRect } from "../blocks";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../geometry";
import {
  CURSOR_LEAP_RULES,
  describeCursor,
  keyToCommand,
  nextCursor,
} from "../keyboard-cursor";
import { describeSelection } from "../selection";

const DOLLAR = 1_000_000;

function block(
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<BoardRect> = {},
): BoardRect {
  return { id: `${x}-${y}`, x, y, w, h, status: "minted", ...extra };
}

/**
 * The captions the board no longer ships in its payload.
 *
 * They arrive from `/api/blocks/{id}` when a pointer or the keyboard cursor
 * rests on a rectangle, so the mirror is handed a map rather than reading a
 * field. That is the whole of what the representation change moved through
 * this function, and it is why every assertion below passes one.
 */
function words(rect: BoardRect, caption: string | null): Map<string, BlockDetails> {
  return new Map([[rect.id, { ...rect, caption, link: null, fit: null }]]);
}

const NO_WORDS = new Map<string, BlockDetails>();

const NONE = { shiftKey: false, altKey: false };

describe("keyToCommand", () => {
  it("turns a bare arrow into a move of one fine rule", () => {
    expect(keyToCommand("ArrowRight", NONE)).toEqual({ kind: "move", dx: 1, dy: 0 });
    expect(keyToCommand("ArrowUp", NONE)).toEqual({ kind: "move", dx: 0, dy: -1 });
  });

  it("makes shift leap by the coarse rule, which is ten fine ones", () => {
    expect(keyToCommand("ArrowDown", { shiftKey: true, altKey: false })).toEqual({
      kind: "move",
      dx: 0,
      dy: CURSOR_LEAP_RULES,
    });
  });

  it("makes alt resize rather than move", () => {
    expect(keyToCommand("ArrowRight", { shiftKey: false, altKey: true })).toEqual({
      kind: "resize",
      dw: 1,
      dh: 0,
    });
    expect(keyToCommand("ArrowUp", { shiftKey: false, altKey: true })).toEqual({
      kind: "resize",
      dw: 0,
      dh: -1,
    });
  });

  it("lets the two modifiers combine into a ten-rule resize", () => {
    expect(keyToCommand("ArrowDown", { shiftKey: true, altKey: true })).toEqual({
      kind: "resize",
      dw: 0,
      dh: CURSOR_LEAP_RULES,
    });
  });

  it("claims no key it does not handle, so the rest reach the browser", () => {
    for (const key of ["Tab", "Enter", "Escape", "a", " ", "PageDown"]) {
      expect(keyToCommand(key, NONE)).toBeNull();
    }
  });
});

describe("nextCursor", () => {
  it("puts the cursor down on one fine rule at the origin when there is none", () => {
    expect(nextCursor(null, { kind: "move", dx: -1, dy: -1 }, null)).toEqual({
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    });
  });

  it("puts a preset down at its own size", () => {
    expect(nextCursor(null, { kind: "move", dx: 1, dy: 0 }, 100)).toEqual({
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    });
  });

  it("moves by whole rules and nothing else", () => {
    const rect = { x: 200, y: 400, w: 20, h: 20 };
    expect(nextCursor(rect, { kind: "move", dx: 1, dy: 0 }, null)).toEqual({
      x: 210,
      y: 400,
      w: 20,
      h: 20,
    });
    expect(nextCursor(rect, { kind: "move", dx: 0, dy: -CURSOR_LEAP_RULES }, null)).toEqual({
      x: 200,
      y: 300,
      w: 20,
      h: 20,
    });
  });

  it("refuses to walk off the board rather than shrinking against the edge", () => {
    const wide = { x: 0, y: 0, w: 100, h: 10 };
    expect(nextCursor(wide, { kind: "move", dx: -1, dy: 0 }, null)).toEqual(wide);
    expect(nextCursor(wide, { kind: "move", dx: 0, dy: -CURSOR_LEAP_RULES }, null)).toEqual(wide);
  });

  it("stops with its trailing edge on the board's, half-open", () => {
    const rect = { x: BOARD_WIDTH - 100, y: BOARD_HEIGHT - 100, w: 100, h: 100 };
    expect(nextCursor(rect, { kind: "move", dx: CURSOR_LEAP_RULES, dy: 0 }, null)).toEqual(rect);
    expect(nextCursor(rect, { kind: "move", dx: 0, dy: 1 }, null)).toEqual(rect);
  });

  it("grows and shrinks from the top-left anchor", () => {
    const rect = { x: 100, y: 100, w: 50, h: 50 };
    expect(nextCursor(rect, { kind: "resize", dw: 1, dh: 0 }, null)).toEqual({
      x: 100,
      y: 100,
      w: 60,
      h: 50,
    });
    expect(nextCursor(rect, { kind: "resize", dw: 0, dh: -1 }, null)).toEqual({
      x: 100,
      y: 100,
      w: 50,
      h: 40,
    });
  });

  /**
   * A pointer can now draw a rectangle finer than this and a keyboard cannot,
   * which is a gap this stage records rather than closes — see the module's
   * own header. What the floor must never be is zero: a rectangle with no area
   * is not a purchase, and the database refuses one.
   */
  it("never shrinks below the fine rule it walks by, and never to nothing", () => {
    const rect = { x: 500, y: 500, w: 10, h: 10 };
    expect(nextCursor(rect, { kind: "resize", dw: -CURSOR_LEAP_RULES, dh: -1 }, null)).toEqual(rect);
  });

  it("never grows past the board's trailing edge", () => {
    const rect = { x: BOARD_WIDTH - 100, y: BOARD_HEIGHT - 100, w: 100, h: 100 };
    expect(nextCursor(rect, { kind: "resize", dw: CURSOR_LEAP_RULES, dh: 1 }, null)).toEqual(rect);
  });

  it("leaves a preset the size the button named", () => {
    const rect = { x: 100, y: 100, w: 50, h: 50 };
    expect(nextCursor(rect, { kind: "resize", dw: 1, dh: 1 }, 50)).toEqual(rect);
  });

  it("slides a preset back onto the board instead of clipping it, exactly as a click does", () => {
    const rect = { x: BOARD_WIDTH - 100, y: 0, w: 100, h: 100 };
    expect(nextCursor(rect, { kind: "move", dx: CURSOR_LEAP_RULES, dy: 0 }, 100)).toEqual(rect);
  });

  /**
   * Not a grid rule any more — there is no grid — but a keyboard rule. The
   * cursor is walked by the ruling, so everything it produces sits on it, and
   * a rectangle that fell off the ruling would mean a step somewhere stopped
   * being a whole one.
   */
  it("keeps every rectangle the keyboard makes on the ruling it walks", () => {
    let rect = nextCursor(null, { kind: "move", dx: 1, dy: 1 }, null);
    for (const command of [
      { kind: "move", dx: 3, dy: CURSOR_LEAP_RULES } as const,
      { kind: "resize", dw: 7, dh: 2 } as const,
      { kind: "move", dx: -1, dy: 4 } as const,
      { kind: "resize", dw: -3, dh: CURSOR_LEAP_RULES } as const,
    ]) {
      rect = nextCursor(rect, command, null);
      expect(rect.x % 10).toBe(0);
      expect(rect.y % 10).toBe(0);
      expect(rect.w % 10).toBe(0);
      expect(rect.h % 10).toBe(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(BOARD_WIDTH);
      expect(rect.y + rect.h).toBeLessThanOrEqual(BOARD_HEIGHT);
    }
  });
});

describe("describeCursor", () => {
  it("says there is nothing yet, and still passes the hint along", () => {
    expect(describeCursor(null, [], NO_WORDS, "Pick a size to start.")).toBe(
      "Nothing selected. Pick a size to start.",
    );
  });

  it("states the rectangle, its pixels and its price", () => {
    const selection = describeSelection({ x: 240, y: 480, w: 20, h: 10 }, [], DOLLAR);
    expect(describeCursor(selection, [], NO_WORDS, "Holds these pixels for 30 minutes.")).toBe(
      "20 by 10 at 240, 480. 200 pixels, $200. Holds these pixels for 30 minutes.",
    );
  });

  it("names the sold rectangle under the cursor's own corner, caption and all", () => {
    const under = block(0, 0, 100, 100);
    const selection = describeSelection({ x: 0, y: 0, w: 10, h: 10 }, [under], DOLLAR);
    expect(
      describeCursor(selection, [under], words(under, "Top left corner"), "Already sold."),
    ).toContain("Under the cursor: a sold block called Top left corner.");
  });

  it("says a sold rectangle has no caption rather than saying nothing", () => {
    const under = block(500, 500, 10, 10);
    const selection = describeSelection({ x: 500, y: 500, w: 10, h: 10 }, [under], DOLLAR);
    expect(describeCursor(selection, [under], words(under, null), "Sold.")).toContain(
      "Under the cursor: a sold block with no caption.",
    );
  });

  /**
   * The words are fetched, so there is a moment before they arrive. What the
   * mirror must not do in that moment is claim the rectangle has no caption:
   * it says the true half — that a sale is under the cursor — and picks the
   * caption up when the fetch lands and this runs again.
   */
  it("still names a sold rectangle whose words have not arrived yet", () => {
    const under = block(500, 500, 10, 10);
    const selection = describeSelection({ x: 500, y: 500, w: 10, h: 10 }, [under], DOLLAR);
    const said = describeCursor(selection, [under], NO_WORDS, "Sold.");
    expect(said).toContain("Under the cursor: a sold block.");
    expect(said).not.toContain("no caption");
  });

  it("tells a hold apart from a sale", () => {
    const under = block(300, 300, 10, 10, { status: "reserved" });
    const selection = describeSelection({ x: 300, y: 300, w: 10, h: 10 }, [under], DOLLAR);
    expect(describeCursor(selection, [under], words(under, null), "On hold.")).toContain(
      "Under the cursor: a block on hold with no caption.",
    );
  });

  it("says nothing about a rectangle the cursor only overlaps but does not start on", () => {
    const other = block(510, 500, 10, 10);
    const selection = describeSelection({ x: 500, y: 500, w: 20, h: 10 }, [other], DOLLAR);
    expect(describeCursor(selection, [other], words(other, "Not this one"), "Blocked.")).toBe(
      "20 by 10 at 500, 500. 200 pixels, $200. Blocked.",
    );
  });
});
