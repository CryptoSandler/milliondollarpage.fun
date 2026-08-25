import type { LiveBlock } from "./blocks";
import {
  type Point,
  type Rect,
  presetRect,
  rectIsValid,
  rectPixels,
  rectsIntersect,
  snapRect,
} from "./geometry";
import { totalBaseUnits } from "./pricing";

/**
 * What the buyer has currently selected, and whether it can be bought.
 *
 * Pure, and it returns the IDs of the blocks it collides with rather than a
 * boolean, because the canvas paints those blocks red. "Why can't I select
 * here" is answered by the drawing, not by an error message — see
 * docs/references.md, where the same idea is taken from a competitor's
 * selector.
 *
 * `buyable` folds together two different refusals: the rectangle is malformed,
 * or the rectangle is taken. The panel does not care which; the canvas does.
 */

export const PRESETS = [
  { size: 10, label: "10×10" },
  { size: 20, label: "20×20" },
  { size: 50, label: "50×50" },
  { size: 100, label: "100×100" },
] as const;

export type Selection = {
  rect: Rect;
  pixels: number;
  totalBaseUnits: number;
  collidesWith: string[];
  buyable: boolean;
};

export function describeSelection(rect: Rect, blocks: LiveBlock[], perPixel: number): Selection {
  const collidesWith = blocks.filter((block) => rectsIntersect(rect, block)).map((block) => block.id);
  const pixels = rectPixels(rect);

  return {
    rect,
    pixels,
    totalBaseUnits: totalBaseUnits(pixels, perPixel),
    collidesWith,
    buyable: rectIsValid(rect) && collidesWith.length === 0,
  };
}

export function selectionFromDrag(
  from: Point,
  to: Point,
  blocks: LiveBlock[],
  perPixel: number,
): Selection {
  return describeSelection(snapRect(from, to), blocks, perPixel);
}

export function selectionFromPreset(
  at: Point,
  size: number,
  blocks: LiveBlock[],
  perPixel: number,
): Selection {
  return describeSelection(presetRect(at, size), blocks, perPixel);
}
