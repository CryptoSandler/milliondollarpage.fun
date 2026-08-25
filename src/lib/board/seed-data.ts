/**
 * Demo blocks, for development only.
 *
 * These exist so a local board has something on it: without sold blocks there
 * is no collision to see, and the red overlay is half of what this batch is
 * for. The rectangles deliberately include a touching pair, because "two
 * blocks may share an edge" is the rule most likely to be broken by accident.
 * One is exactly 10x10, the smallest legal block. Together they total
 * 108,100 pixels, which is why the board's counters read
 * "108,100 / 1,000,000 pixels sold", "10.8100% complete", "7 blocks" once
 * they are seeded.
 *
 * This lives in `src/` rather than in the seed script itself so that a test
 * can import SEED_BLOCKS without importing a `.mts` entry point across a
 * module boundary, and without connecting to a database.
 */

export const SEED_BLOCKS = [
  { x: 0, y: 0, w: 100, h: 100, caption: "Top left corner", link: "https://example.com/1" },
  { x: 100, y: 0, w: 100, h: 100, caption: "Right beside it", link: "https://example.com/2" },
  { x: 300, y: 120, w: 200, h: 50, caption: "A wide banner", link: "https://example.com/3" },
  { x: 640, y: 300, w: 60, h: 60, caption: "A small square", link: "https://example.com/4" },
  { x: 200, y: 400, w: 10, h: 10, caption: "The minimum block", link: "https://example.com/5" },
  { x: 800, y: 700, w: 200, h: 300, caption: "Bottom right", link: "https://example.com/6" },
  { x: 450, y: 600, w: 120, h: 120, caption: "Middle of nowhere", link: "https://example.com/7" },
] as const;
