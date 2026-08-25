import { describe, expect, it } from "vitest";
import type { LiveBlock } from "../blocks";
import {
  PRESETS,
  describeSelection,
  selectionFromDrag,
  selectionFromPreset,
} from "../selection";

const DOLLAR = 1_000_000;

function sold(x: number, y: number, w: number, h: number, id = "sold-1"): LiveBlock {
  return { id, x, y, w, h, status: "minted", caption: null, link: null };
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
});
