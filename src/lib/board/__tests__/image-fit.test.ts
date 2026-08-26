import { describe, expect, it } from "vitest";
import { centredCrop, placeImage } from "../image-fit";

/**
 * The arithmetic that stopped the board squashing people's photographs.
 *
 * Every case below is stated as a RATIO or a symmetry rather than a pixel
 * count wherever it can be, because the property that matters is "the picture
 * keeps its shape and sits in the middle", not "these four numbers".
 */

const square = { x: 0, y: 0, width: 100, height: 100 };
const ratio = (r: { width: number; height: number }) => r.width / r.height;

describe("placeImage — contain", () => {
  it("letterboxes a wide source into a square block with equal bars", () => {
    const { source, dest } = placeImage({ width: 400, height: 300 }, square, "contain");

    // Nothing is cropped: contain draws the whole picture.
    expect(source).toEqual({ x: 0, y: 0, width: 400, height: 300 });

    // It fills the width and leaves the height short.
    expect(dest.width).toBe(100);
    expect(dest.height).toBe(75);

    // And the two bars are the same size, top and bottom.
    const top = dest.y - square.y;
    const bottom = square.y + square.height - (dest.y + dest.height);
    expect(top).toBeCloseTo(bottom, 10);
    expect(top).toBeCloseTo(12.5, 10);
    expect(dest.x).toBe(0);
  });

  it("preserves the source's aspect ratio exactly, which is the whole bug", () => {
    const { dest } = placeImage({ width: 400, height: 300 }, square, "contain");
    expect(ratio(dest)).toBeCloseTo(400 / 300, 10);
  });

  it("letterboxes a tall source the other way, with equal bars left and right", () => {
    const { dest } = placeImage({ width: 300, height: 400 }, square, "contain");
    expect(dest.height).toBe(100);
    expect(dest.width).toBe(75);
    expect(dest.x - square.x).toBeCloseTo(square.x + square.width - (dest.x + dest.width), 10);
    expect(dest.y).toBe(0);
  });

  it("carries the block's own position, so a caller does no arithmetic", () => {
    const { dest } = placeImage({ width: 400, height: 200 }, { x: 640, y: 300, width: 60, height: 60 }, "contain");
    expect(dest.x).toBe(640);
    expect(dest.y).toBeCloseTo(300 + 15, 10);
    expect(dest.width).toBe(60);
    expect(dest.height).toBe(30);
  });

  it("leaves a source that already matches the block untouched", () => {
    const { source, dest } = placeImage({ width: 40, height: 40 }, square, "contain");
    expect(source).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(dest).toEqual(square);
  });

  it("leaves a source matching a NON-square block untouched too", () => {
    const block = { x: 300, y: 120, width: 200, height: 50 };
    const { source, dest } = placeImage({ width: 800, height: 200 }, block, "contain");
    expect(source).toEqual({ x: 0, y: 0, width: 800, height: 200 });
    expect(dest).toEqual(block);
  });

  it("scales a 1×1 source up to the block without dividing by zero", () => {
    const { source, dest } = placeImage({ width: 1, height: 1 }, square, "contain");
    expect(source).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(dest).toEqual(square);
    expect(Number.isFinite(dest.width)).toBe(true);
  });

  it("treats an undecoded 0×0 image as one pixel rather than producing NaN", () => {
    const { dest } = placeImage({ width: 0, height: 0 }, square, "contain");
    for (const value of [dest.x, dest.y, dest.width, dest.height]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("placeImage — cover", () => {
  it("fills a square block from a wide source and crops symmetrically", () => {
    const { source, dest } = placeImage({ width: 400, height: 300 }, square, "cover");

    // The block is filled edge to edge: no bars, ever.
    expect(dest).toEqual(square);

    // The crop is the block's shape, centred: equal amounts off each side.
    expect(source.width).toBe(300);
    expect(source.height).toBe(300);
    expect(source.x).toBeCloseTo(50, 10);
    expect(source.y).toBe(0);
    expect(source.x).toBeCloseTo(400 - (source.x + source.width), 10);
  });

  it("crops a tall source top and bottom, equally", () => {
    const { source, dest } = placeImage({ width: 300, height: 400 }, square, "cover");
    expect(dest).toEqual(square);
    expect(source.y).toBeCloseTo(50, 10);
    expect(source.y).toBeCloseTo(400 - (source.y + source.height), 10);
    expect(source.x).toBe(0);
  });

  it("draws a source that already matches the block whole", () => {
    const { source, dest } = placeImage({ width: 40, height: 40 }, square, "cover");
    expect(source).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(dest).toEqual(square);
  });

  it("keeps the drawn ratio equal to the BLOCK's, which is what filling means", () => {
    const { source } = placeImage({ width: 900, height: 100 }, { x: 0, y: 0, width: 200, height: 50 }, "cover");
    expect(ratio(source)).toBeCloseTo(200 / 50, 10);
  });

  it("survives a 1×1 source", () => {
    const { source, dest } = placeImage({ width: 1, height: 1 }, square, "cover");
    expect(source).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(dest).toEqual(square);
  });
});

describe("centredCrop — shared with the encoder", () => {
  it("is a no-op on a source that already has the box's shape", () => {
    expect(centredCrop(200, 100, { width: 20, height: 10 })).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
  });

  it("never leaves the source", () => {
    for (const [w, h] of [
      [400, 300],
      [300, 400],
      [1, 1],
      [1000, 7],
    ]) {
      const crop = centredCrop(w, h, { width: 50, height: 50 });
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual(w + 1e-9);
      expect(crop.y + crop.height).toBeLessThanOrEqual(h + 1e-9);
    }
  });
});

/**
 * The board and the confirmation preview have to be the same picture, and the
 * preview is CSS. `object-fit` is specified in terms of a "concrete object
 * size": scale the source by the smaller ratio for contain and the larger for
 * cover, then centre it in the box. This reimplements that sentence from the
 * specification, independently of `placeImage`, and checks the two agree on
 * the rectangle a viewer actually sees.
 */
function cssObjectFit(
  source: { width: number; height: number },
  box: { width: number; height: number },
  fit: "contain" | "cover",
): { x: number; y: number; width: number; height: number } {
  const scales = [box.width / source.width, box.height / source.height];
  const scale = fit === "contain" ? Math.min(...scales) : Math.max(...scales);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

describe("the board draws what the confirmation preview showed", () => {
  const sources = [
    { width: 400, height: 300 },
    { width: 300, height: 400 },
    { width: 1600, height: 200 },
    { width: 37, height: 91 },
    { width: 64, height: 64 },
    { width: 1, height: 1 },
  ];
  const blocks = [
    { x: 0, y: 0, width: 100, height: 100 },
    { x: 640, y: 300, width: 200, height: 50 },
    { x: 12, y: 7, width: 40, height: 160 },
  ];

  for (const source of sources) {
    for (const block of blocks) {
      it(`agrees for ${source.width}×${source.height} in ${block.width}×${block.height}`, () => {
        // CONTAIN: the visible picture is the destination rectangle itself,
        // so the two can be compared directly.
        const contained = placeImage(source, block, "contain");
        const css = cssObjectFit(source, block, "contain");
        expect(contained.dest.x - block.x).toBeCloseTo(css.x, 8);
        expect(contained.dest.y - block.y).toBeCloseTo(css.y, 8);
        expect(contained.dest.width).toBeCloseTo(css.width, 8);
        expect(contained.dest.height).toBeCloseTo(css.height, 8);

        // COVER: CSS scales the whole source up and clips it to the box, so
        // what a viewer sees is the crop expressed back in source pixels.
        // Same numbers, said the other way round.
        const covered = placeImage(source, block, "cover");
        const cssCover = cssObjectFit(source, block, "cover");
        const scale = cssCover.width / source.width;
        expect(covered.source.width * scale).toBeCloseTo(block.width, 8);
        expect(covered.source.height * scale).toBeCloseTo(block.height, 8);
        expect(-cssCover.x / scale).toBeCloseTo(covered.source.x, 8);
        expect(-cssCover.y / scale).toBeCloseTo(covered.source.y, 8);
      });
    }
  }
});
