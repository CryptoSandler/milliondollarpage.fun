import { describe, expect, it } from "vitest";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  RULE_PIXELS,
  TOTAL_PIXELS,
  presetRect,
  rectContains,
  rectIsValid,
  rectPixels,
  rectsIntersect,
  snapRect,
} from "../geometry";

describe("board constants", () => {
  it("is 1250 by 800, which is exactly a million pixels", () => {
    expect(BOARD_WIDTH).toBe(1250);
    expect(BOARD_HEIGHT).toBe(800);
    expect(BOARD_WIDTH * BOARD_HEIGHT).toBe(1_000_000);
    expect(TOTAL_PIXELS).toBe(1_000_000);
  });

  it("keeps ten pixels as a ruling and not as a rule about rectangles", () => {
    expect(RULE_PIXELS).toBe(10);
    // The ruling is drawn on the paper; nothing has to line up with it. If
    // this ever fails, the grid has come back without anybody saying so.
    expect(rectIsValid({ x: 137, y: 41, w: 23, h: 7 })).toBe(true);
  });
});

describe("snapRect", () => {
  it("turns a single point into the single pixel under it", () => {
    expect(snapRect({ x: 3, y: 7 }, { x: 3, y: 7 })).toEqual({ x: 3, y: 7, w: 1, h: 1 });
  });

  it("floors a fractional pointer position into the pixel it is inside", () => {
    // A pointer sits at a fractional board coordinate at every scale below 1,
    // and the pixel it is inside is the one the buyer means.
    expect(snapRect({ x: 3.9, y: 7.2 }, { x: 3.1, y: 7.8 })).toEqual({ x: 3, y: 7, w: 1, h: 1 });
  });

  it("covers every pixel the drag touched, both ends included", () => {
    expect(snapRect({ x: 9, y: 9 }, { x: 11, y: 11 })).toEqual({ x: 9, y: 9, w: 3, h: 3 });
  });

  it("does not care which corner the drag started from", () => {
    const forward = snapRect({ x: 100, y: 100 }, { x: 249, y: 349 });
    const backward = snapRect({ x: 249, y: 349 }, { x: 100, y: 100 });
    expect(forward).toEqual(backward);
    expect(forward).toEqual({ x: 100, y: 100, w: 150, h: 250 });
  });

  it("clamps a drag that leaves the board, on each axis by that axis's size", () => {
    expect(snapRect({ x: 1245, y: 795 }, { x: 5000, y: -40 })).toEqual({
      x: 1245,
      y: 0,
      w: 5,
      h: 796,
    });
  });
});

describe("presetRect", () => {
  it("anchors the preset at the pixel under the pointer, with no grid to round to", () => {
    expect(presetRect({ x: 34, y: 56 }, 100)).toEqual({ x: 34, y: 56, w: 100, h: 100 });
  });

  it("slides a preset back onto the board rather than cropping it", () => {
    expect(presetRect({ x: 1200, y: 760 }, 100)).toEqual({ x: 1150, y: 700, w: 100, h: 100 });
  });

  it("slides each axis by its own edge, because the wall is not square", () => {
    // 1200 is past the right edge for a 100-wide preset and 10 is nowhere near
    // the bottom one. A single board size would have moved both.
    expect(presetRect({ x: 1200, y: 10 }, 100)).toEqual({ x: 1150, y: 10, w: 100, h: 100 });
  });
});

describe("rectPixels", () => {
  it("counts pixels, which is also what it counts dollars in", () => {
    expect(rectPixels({ x: 0, y: 0, w: 20, h: 20 })).toBe(400);
  });

  it("counts one for one pixel", () => {
    expect(rectPixels({ x: 137, y: 41, w: 1, h: 1 })).toBe(1);
  });
});

describe("rectsIntersect", () => {
  const base = { x: 100, y: 100, w: 100, h: 100 };

  it("is false for rectangles that only share an edge", () => {
    // This is the case a Postgres `box` column gets wrong, which is why the
    // schema uses two int4ranges. The rule has to be the same on both sides.
    expect(rectsIntersect(base, { x: 200, y: 100, w: 100, h: 100 })).toBe(false);
    expect(rectsIntersect(base, { x: 100, y: 200, w: 100, h: 100 })).toBe(false);
  });

  it("is false for rectangles that only share a corner", () => {
    expect(rectsIntersect(base, { x: 200, y: 200, w: 100, h: 100 })).toBe(false);
  });

  it("is false for two single pixels side by side, which is now a real sale", () => {
    // The half-open rule did not change when the unit did, and this is the
    // finest case it has to get right: pixel 4 and pixel 5 are neighbours,
    // not neighbours who overlap.
    expect(rectsIntersect({ x: 4, y: 0, w: 1, h: 1 }, { x: 5, y: 0, w: 1, h: 1 })).toBe(false);
    expect(rectsIntersect({ x: 4, y: 0, w: 1, h: 1 }, { x: 4, y: 0, w: 1, h: 1 })).toBe(true);
  });

  it("is true for a one-pixel overlap", () => {
    expect(rectsIntersect(base, { x: 199, y: 199, w: 100, h: 100 })).toBe(true);
  });

  it("is true when one rectangle contains the other", () => {
    expect(rectsIntersect(base, { x: 120, y: 120, w: 10, h: 10 })).toBe(true);
  });

  it("is symmetric", () => {
    const other = { x: 150, y: 150, w: 100, h: 100 };
    expect(rectsIntersect(base, other)).toBe(rectsIntersect(other, base));
  });
});

describe("rectContains", () => {
  const rect = { x: 100, y: 100, w: 100, h: 100 };

  it("is true for a point inside", () => {
    expect(rectContains(rect, { x: 150, y: 150 })).toBe(true);
  });

  it("is true on the left/top edge", () => {
    expect(rectContains(rect, { x: 100, y: 150 })).toBe(true);
    expect(rectContains(rect, { x: 150, y: 100 })).toBe(true);
  });

  it("is false on the right/bottom edge", () => {
    expect(rectContains(rect, { x: 200, y: 150 })).toBe(false);
    expect(rectContains(rect, { x: 150, y: 200 })).toBe(false);
  });

  it("is false for a point entirely outside", () => {
    expect(rectContains(rect, { x: 0, y: 0 })).toBe(false);
  });
});

describe("rectIsValid", () => {
  it("accepts a single pixel, anywhere on the wall", () => {
    expect(rectIsValid({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    // The very last pixel, which the half-open rule puts at 1249, 799.
    expect(rectIsValid({ x: BOARD_WIDTH - 1, y: BOARD_HEIGHT - 1, w: 1, h: 1 })).toBe(true);
  });

  it("accepts the whole wall, which is the million", () => {
    const everything = { x: 0, y: 0, w: BOARD_WIDTH, h: BOARD_HEIGHT };
    expect(rectIsValid(everything)).toBe(true);
    expect(rectPixels(everything)).toBe(1_000_000);
  });

  it("accepts a rectangle that lines up with nothing at all", () => {
    // Every one of these would have been refused by the old grid rule.
    expect(rectIsValid({ x: 1, y: 1, w: 1, h: 1 })).toBe(true);
    expect(rectIsValid({ x: 137, y: 41, w: 23, h: 7 })).toBe(true);
    expect(rectIsValid({ x: 999, y: 799, w: 3, h: 1 })).toBe(true);
  });

  it("rejects a rectangle with no area", () => {
    expect(rectIsValid({ x: 0, y: 0, w: 1, h: 0 })).toBe(false);
    expect(rectIsValid({ x: 0, y: 0, w: 0, h: 1 })).toBe(false);
    expect(rectIsValid({ x: 0, y: 0, w: -1, h: 1 })).toBe(false);
  });

  it("rejects a rectangle that is not made of whole pixels", () => {
    // `x`, `y`, `w` and `h` are integer columns and Postgres ROUNDS into them
    // rather than refusing, so a fractional rectangle would be quoted at one
    // size and stored at another. The old grid check caught this by accident;
    // nothing else does.
    expect(rectIsValid({ x: 0.5, y: 0, w: 1, h: 1 })).toBe(false);
    expect(rectIsValid({ x: 0, y: 0, w: 1.5, h: 1 })).toBe(false);
    expect(rectIsValid({ x: 0, y: Number.NaN, w: 1, h: 1 })).toBe(false);
    expect(rectIsValid({ x: 0, y: 0, w: Number.POSITIVE_INFINITY, h: 1 })).toBe(false);
  });

  it("rejects anything that leaves the board, on either axis", () => {
    expect(rectIsValid({ x: BOARD_WIDTH - 10, y: 0, w: 20, h: 1 })).toBe(false);
    expect(rectIsValid({ x: 0, y: BOARD_HEIGHT - 10, w: 1, h: 20 })).toBe(false);
    // 900 is comfortably inside a 1250-wide wall and off the bottom of an
    // 800-tall one. A square board could not tell these two apart.
    expect(rectIsValid({ x: 900, y: 0, w: 100, h: 100 })).toBe(true);
    expect(rectIsValid({ x: 0, y: 900, w: 100, h: 100 })).toBe(false);
    expect(rectIsValid({ x: -1, y: 0, w: 1, h: 1 })).toBe(false);
  });
});
