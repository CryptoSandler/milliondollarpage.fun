import { describe, expect, it } from "vitest";
import type { LiveBlock } from "../blocks";
import {
  PRESETS,
  describeSelection,
  presetSelectionForMove,
  selectionFromDrag,
  selectionFromPreset,
} from "../selection";

const DOLLAR = 1_000_000;

function sold(x: number, y: number, w: number, h: number, id = "sold-1"): LiveBlock {
  return { id, x, y, w, h, status: "minted", caption: null, link: null, hasImage: false };
}

describe("PRESETS", () => {
  it("offers the four sizes the home page advertises", () => {
    expect(PRESETS.map((p) => p.size)).toEqual([10, 20, 50, 100]);
  });

  it("labels each one by its dimensions", () => {
    expect(PRESETS.map((p) => p.label)).toEqual(["10×10", "20×20", "50×50", "100×100"]);
  });
});

describe("describeSelection", () => {
  it("prices an empty rectangle and calls it buyable", () => {
    const selection = describeSelection({ x: 0, y: 0, w: 20, h: 20 }, [], DOLLAR);
    expect(selection.pixels).toBe(400);
    expect(selection.totalBaseUnits).toBe(400_000_000);
    expect(selection.collidesWith).toEqual([]);
    expect(selection.buyable).toBe(true);
  });

  it("names every block the selection overlaps, so the canvas can mask them", () => {
    const blocks = [sold(0, 0, 10, 10, "a"), sold(10, 0, 10, 10, "b"), sold(500, 500, 10, 10, "c")];
    const selection = describeSelection({ x: 0, y: 0, w: 20, h: 20 }, blocks, DOLLAR);
    expect(selection.collidesWith.sort()).toEqual(["a", "b"]);
    expect(selection.buyable).toBe(false);
  });

  it("does not collide with a block it merely touches", () => {
    const selection = describeSelection({ x: 0, y: 0, w: 10, h: 10 }, [sold(10, 0, 10, 10)], DOLLAR);
    expect(selection.collidesWith).toEqual([]);
    expect(selection.buyable).toBe(true);
  });

  it("is unbuyable when the rectangle itself is invalid, collision or not", () => {
    expect(describeSelection({ x: 5, y: 0, w: 10, h: 10 }, [], DOLLAR).buyable).toBe(false);
    expect(describeSelection({ x: 0, y: 0, w: 0, h: 10 }, [], DOLLAR).buyable).toBe(false);
  });

  it("still reports the price of an unbuyable selection, so the panel can show it", () => {
    const selection = describeSelection({ x: 0, y: 0, w: 20, h: 20 }, [sold(0, 0, 10, 10)], DOLLAR);
    expect(selection.totalBaseUnits).toBe(400_000_000);
    expect(selection.buyable).toBe(false);
  });

  it("uses the price it is given rather than assuming a dollar", () => {
    const selection = describeSelection({ x: 0, y: 0, w: 10, h: 10 }, [], 2_500_000);
    expect(selection.totalBaseUnits).toBe(250_000_000);
  });
});

describe("selectionFromDrag", () => {
  it("snaps the drag before doing anything else", () => {
    const selection = selectionFromDrag({ x: 3, y: 3 }, { x: 11, y: 11 }, [], DOLLAR);
    expect(selection.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    expect(selection.pixels).toBe(400);
  });

  it("finds collisions against the snapped rectangle, not the raw drag", () => {
    // The drag never enters the sold block, but the snapped rectangle does.
    const selection = selectionFromDrag({ x: 0, y: 0 }, { x: 5, y: 5 }, [sold(0, 0, 10, 10)], DOLLAR);
    expect(selection.buyable).toBe(false);
  });
});

describe("selectionFromPreset", () => {
  it("places the preset under the pointer", () => {
    const selection = selectionFromPreset({ x: 34, y: 56 }, 100, [], DOLLAR);
    expect(selection.rect).toEqual({ x: 30, y: 50, w: 100, h: 100 });
  });

  it("keeps a preset whole near the edge", () => {
    const selection = selectionFromPreset({ x: 995, y: 995 }, 100, [], DOLLAR);
    expect(selection.rect).toEqual({ x: 900, y: 900, w: 100, h: 100 });
    expect(selection.pixels).toBe(10_000);
  });

  // The click path. A preset needs no drag: one click on a cell buys the
  // rectangle anchored there, aligned to the 10-pixel grid, whatever pixel of
  // that cell was actually under the pointer.
  it("anchors a click anywhere inside a cell to that cell, on the grid", () => {
    for (const at of [{ x: 260, y: 490 }, { x: 264, y: 497 }, { x: 269, y: 499 }]) {
      expect(selectionFromPreset(at, 10, [], DOLLAR).rect).toEqual({ x: 260, y: 490, w: 10, h: 10 });
    }
  });

  it("prices what the click placed, so Buy can be pressed straight after it", () => {
    const selection = selectionFromPreset({ x: 264, y: 497 }, 20, [], DOLLAR);
    expect(selection.pixels).toBe(400);
    expect(selection.totalBaseUnits).toBe(400_000_000);
    expect(selection.buyable).toBe(true);
  });
});

describe("presetSelectionForMove — what a click places stays placed", () => {
  it("previews under the pointer while the preset has not been put down", () => {
    const preview = presetSelectionForMove({ x: 34, y: 56 }, 100, false, [], DOLLAR);
    expect(preview?.rect).toEqual({ x: 30, y: 50, w: 100, h: 100 });
  });

  it("leaves the selection alone once a click has placed it", () => {
    // The bug this closes: the click published a rectangle and the very next
    // mouse move picked it back up and carried it away, so a preset could
    // never be placed at all.
    expect(presetSelectionForMove({ x: 900, y: 900 }, 100, true, [], DOLLAR)).toBeNull();
  });

  it("never previews for Freehand, which is the one shape that needs a drag", () => {
    expect(presetSelectionForMove({ x: 34, y: 56 }, null, false, [], DOLLAR)).toBeNull();
    expect(presetSelectionForMove({ x: 34, y: 56 }, null, true, [], DOLLAR)).toBeNull();
  });

  it("previews exactly what a click at the same point would place", () => {
    const at = { x: 264, y: 497 };
    expect(presetSelectionForMove(at, 20, false, [], DOLLAR)?.rect).toEqual(
      selectionFromPreset(at, 20, [], DOLLAR).rect,
    );
  });

  it("carries the collisions the preview would have, so the board can paint them red", () => {
    const preview = presetSelectionForMove({ x: 5, y: 5 }, 20, false, [sold(0, 0, 10, 10, "a")], DOLLAR);
    expect(preview?.collidesWith).toEqual(["a"]);
    expect(preview?.buyable).toBe(false);
  });
});
