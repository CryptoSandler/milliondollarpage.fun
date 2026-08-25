import { describe, expect, it } from "vitest";
import {
  BLOCK_PIXELS,
  BOARD_PIXELS,
  TOTAL_PIXELS,
  presetRect,
  rectIsValid,
  rectPixels,
  rectsIntersect,
  snapRect,
} from "../geometry";

describe("board constants", () => {
  it("is a million pixels of ten-pixel blocks", () => {
    expect(BOARD_PIXELS).toBe(1000);
    expect(BLOCK_PIXELS).toBe(10);
    expect(TOTAL_PIXELS).toBe(1_000_000);
  });
});

describe("snapRect", () => {
  it("turns a single point into one 10x10 block", () => {
    expect(snapRect({ x: 3, y: 7 }, { x: 3, y: 7 })).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });

  it("snaps outward so a drag always covers every cell it touched", () => {
    expect(snapRect({ x: 9, y: 9 }, { x: 11, y: 11 })).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });

  it("does not care which corner the drag started from", () => {
    const forward = snapRect({ x: 100, y: 100 }, { x: 249, y: 349 });
    const backward = snapRect({ x: 249, y: 349 }, { x: 100, y: 100 });
    expect(forward).toEqual(backward);
    expect(forward).toEqual({ x: 100, y: 100, w: 150, h: 250 });
  });

  it("clamps a drag that leaves the board", () => {
    expect(snapRect({ x: 995, y: 995 }, { x: 5000, y: -40 })).toEqual({
      x: 990,
      y: 0,
      w: 10,
      h: 1000,
    });
  });
});

describe("presetRect", () => {
  it("anchors the preset at the block under the pointer", () => {
    expect(presetRect({ x: 34, y: 56 }, 100)).toEqual({ x: 30, y: 50, w: 100, h: 100 });
  });

  it("slides a preset back onto the board rather than cropping it", () => {
    expect(presetRect({ x: 980, y: 980 }, 100)).toEqual({ x: 900, y: 900, w: 100, h: 100 });
  });
});

describe("rectPixels", () => {
  it("counts pixels, not blocks", () => {
    expect(rectPixels({ x: 0, y: 0, w: 20, h: 20 })).toBe(400);
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

  it("is true for a one-block overlap", () => {
    expect(rectsIntersect(base, { x: 190, y: 190, w: 100, h: 100 })).toBe(true);
  });

  it("is true when one rectangle contains the other", () => {
    expect(rectsIntersect(base, { x: 120, y: 120, w: 10, h: 10 })).toBe(true);
  });

  it("is symmetric", () => {
    const other = { x: 150, y: 150, w: 100, h: 100 };
    expect(rectsIntersect(base, other)).toBe(rectsIntersect(other, base));
  });
});

describe("rectIsValid", () => {
  it("accepts the minimum block", () => {
    expect(rectIsValid({ x: 0, y: 0, w: 10, h: 10 })).toBe(true);
  });

  it("rejects anything smaller than a block", () => {
    expect(rectIsValid({ x: 0, y: 0, w: 10, h: 0 })).toBe(false);
    expect(rectIsValid({ x: 0, y: 0, w: 5, h: 10 })).toBe(false);
  });

  it("rejects anything off the grid", () => {
    expect(rectIsValid({ x: 5, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it("rejects anything that leaves the board", () => {
    expect(rectIsValid({ x: 990, y: 0, w: 20, h: 10 })).toBe(false);
    expect(rectIsValid({ x: -10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});
