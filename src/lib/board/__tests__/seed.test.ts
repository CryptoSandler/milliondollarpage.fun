import { describe, expect, it } from "vitest";
import { SEED_BLOCKS } from "../seed-data";
import { rectIsValid, rectsIntersect } from "../geometry";

describe("the seed blocks", () => {
  it("gives the board enough to look at", () => {
    expect(SEED_BLOCKS.length).toBeGreaterThanOrEqual(6);
  });

  it("are all valid rectangles, so the migration's checks cannot reject them", () => {
    for (const block of SEED_BLOCKS) {
      expect(rectIsValid(block), `${block.caption} is not a valid rectangle`).toBe(true);
    }
  });

  it("do not overlap each other, so the exclusion constraint cannot reject them", () => {
    for (let i = 0; i < SEED_BLOCKS.length; i++) {
      for (let j = i + 1; j < SEED_BLOCKS.length; j++) {
        const a = SEED_BLOCKS[i];
        const b = SEED_BLOCKS[j];
        expect(rectsIntersect(a, b), `${a.caption} overlaps ${b.caption}`).toBe(false);
      }
    }
  });

  it("include at least one pair that shares an edge, which must be legal", () => {
    const touching = SEED_BLOCKS.some((a) =>
      SEED_BLOCKS.some((b) => a !== b && a.x + a.w === b.x && a.y === b.y && a.h === b.h),
    );
    expect(touching).toBe(true);
  });

  it("have captions within the 32-character limit", () => {
    for (const block of SEED_BLOCKS) {
      expect(block.caption.length).toBeLessThanOrEqual(32);
    }
  });

  it("link somewhere over https", () => {
    for (const block of SEED_BLOCKS) {
      expect(block.link.startsWith("https://")).toBe(true);
    }
  });
});
