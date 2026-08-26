import { describe, expect, it } from "vitest";
import {
  BLOCK_PIXEL_SCALE,
  MAX_INPUT_BYTES,
  STORED_MAX_BYTES,
  STORED_MAX_LONG_EDGE,
  TARGET_STORED_BYTES,
  encodeAttempts,
  plannedEncode,
  shouldSendUntouched,
  targetBox,
} from "../image-plan";

/**
 * The half of the upload that can be reasoned about without a browser: what
 * size the stored image should be, which part of the source survives, and in
 * what order the encoder should give things up.
 *
 * The canvas half (`image-encode.ts`) is deliberately thin, and what proves
 * IT works is a real 8 MB photograph driven through headless Chrome — not a
 * mock of a canvas, which would only assert that the mock was called.
 */

const block = (width: number, height = width) => ({ width, height });

describe("targetBox — four stored pixels per block pixel", () => {
  it("stores a 10×10 block at 40×40", () => {
    expect(targetBox(block(10))).toEqual({ width: 40, height: 40 });
  });

  it("stores a 100×100 block at 400×400", () => {
    expect(targetBox(block(100))).toEqual({ width: 400, height: 400 });
  });

  it("keeps a rectangle's shape", () => {
    expect(targetBox(block(30, 10))).toEqual({ width: 120, height: 40 });
  });

  it("caps the long edge at 1024, which only bites above a 256-pixel block", () => {
    expect(targetBox(block(256))).toEqual({ width: 1024, height: 1024 });
    expect(targetBox(block(500))).toEqual({ width: 1024, height: 1024 });
    expect(targetBox(block(1000))).toEqual({ width: 1024, height: 1024 });
  });

  it("caps a wide rectangle by its long edge and keeps the aspect ratio", () => {
    // 300×100 wants 1200×400; the long edge is held at 1024 and the short
    // edge follows it down rather than being squashed independently.
    const box = targetBox(block(300, 100));
    expect(box.width).toBe(STORED_MAX_LONG_EDGE);
    expect(box.height).toBe(Math.round(STORED_MAX_LONG_EDGE / 3));
  });

  it("scales by exactly four below the cap", () => {
    for (const size of [10, 20, 50, 200, 256]) {
      expect(targetBox(block(size)).width).toBe(size * BLOCK_PIXEL_SCALE);
    }
  });
});

describe("plannedEncode — contain", () => {
  it("keeps the whole photograph and gives the stored image the photograph's shape", () => {
    const plan = plannedEncode(4000, 3000, block(10), "contain");
    expect(plan.source).toEqual({ x: 0, y: 0, width: 4000, height: 3000 });
    expect(plan.target).toEqual({ width: 40, height: 30 });
    expect(plan.dest).toEqual({ x: 0, y: 0, width: 40, height: 30 });
  });

  it("fits by the limiting dimension, whichever it is", () => {
    expect(plannedEncode(1000, 4000, block(10), "contain").target).toEqual({ width: 10, height: 40 });
  });

  it("never enlarges a source smaller than the block wants", () => {
    const plan = plannedEncode(20, 20, block(100), "contain");
    expect(plan.target).toEqual({ width: 20, height: 20 });
  });

  it("stores nothing wider than the target box, for any source", () => {
    for (const [w, h] of [[8000, 100], [100, 8000], [5000, 5000], [1, 1]]) {
      const plan = plannedEncode(w, h, block(100), "contain");
      expect(plan.target.width).toBeLessThanOrEqual(400);
      expect(plan.target.height).toBeLessThanOrEqual(400);
    }
  });
});

describe("plannedEncode — cover", () => {
  it("crops the source to the block's shape, centred, and fills the box", () => {
    const plan = plannedEncode(4000, 3000, block(10), "cover");
    expect(plan.source).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
    expect(plan.target).toEqual({ width: 40, height: 40 });
    expect(plan.dest).toEqual({ x: 0, y: 0, width: 40, height: 40 });
  });

  it("crops the other axis when the source is tall", () => {
    const plan = plannedEncode(1000, 4000, block(10), "cover");
    expect(plan.source).toEqual({ x: 0, y: 1500, width: 1000, height: 1000 });
  });

  it("crops to a rectangle block's shape, not to a square", () => {
    const plan = plannedEncode(1000, 1000, block(30, 10), "cover");
    expect(plan.source.width / plan.source.height).toBeCloseTo(3, 10);
    expect(plan.target).toEqual({ width: 120, height: 40 });
  });

  it("never enlarges: a tiny source keeps the block's shape at its own resolution", () => {
    const plan = plannedEncode(20, 10, block(10), "cover");
    expect(plan.source).toEqual({ x: 5, y: 0, width: 10, height: 10 });
    expect(plan.target).toEqual({ width: 10, height: 10 });
  });
});

describe("encodeAttempts — quality first, resolution last", () => {
  it("starts at the full stored size and the best quality", () => {
    const [first] = encodeAttempts(block(100));
    expect(first).toEqual({ maxLongEdge: 400, quality: 0.85 });
  });

  it("steps quality down before it gives up a single pixel", () => {
    const attempts = encodeAttempts(block(100));
    const atFullSize = attempts.filter((a) => a.maxLongEdge === 400);
    expect(atFullSize.map((a) => a.quality)).toEqual([0.85, 0.7, 0.55]);
    expect(attempts.slice(0, 3)).toEqual(atFullSize);
  });

  it("then reduces the stored edge, never increasing it", () => {
    const edges = encodeAttempts(block(100)).map((a) => a.maxLongEdge);
    expect(edges[edges.length - 1]).toBeLessThan(edges[0]);
    for (let i = 1; i < edges.length; i += 1) expect(edges[i]).toBeLessThanOrEqual(edges[i - 1]);
  });

  it("never proposes an edge above the 1024 cap, even for the whole board", () => {
    for (const attempt of encodeAttempts(block(1000))) {
      expect(attempt.maxLongEdge).toBeLessThanOrEqual(STORED_MAX_LONG_EDGE);
    }
  });

  it("does not grind a tiny block through duplicate rungs", () => {
    // A 10×10 block stores 40×40; 0.35 of that rounds to 14, under the floor.
    const edges = new Set(encodeAttempts(block(10)).map((a) => a.maxLongEdge));
    expect(edges.size).toBe([...edges].length);
    expect(Math.min(...edges)).toBeGreaterThanOrEqual(16);
  });
});

describe("shouldSendUntouched", () => {
  it("leaves a GIF that already fits exactly as the buyer chose it", () => {
    expect(shouldSendUntouched("image/gif", 50_000, 200, 200)).toBe(true);
  });

  it("re-encodes a GIF that is too heavy or too big to store as it is", () => {
    expect(shouldSendUntouched("image/gif", TARGET_STORED_BYTES + 1, 200, 200)).toBe(false);
    expect(shouldSendUntouched("image/gif", 50_000, STORED_MAX_LONG_EDGE + 1, 200)).toBe(false);
  });

  it("re-encodes every other type, however small, so a block gets block-sized pixels", () => {
    expect(shouldSendUntouched("image/png", 1_000, 40, 40)).toBe(false);
    expect(shouldSendUntouched("image/jpeg", 1_000, 40, 40)).toBe(false);
    expect(shouldSendUntouched("image/webp", 1_000, 40, 40)).toBe(false);
  });
});

describe("the caps themselves", () => {
  it("aims comfortably under the stored cap, which is the security control", () => {
    expect(STORED_MAX_BYTES).toBe(102_400);
    expect(TARGET_STORED_BYTES).toBeLessThan(STORED_MAX_BYTES);
    expect(STORED_MAX_BYTES - TARGET_STORED_BYTES).toBeGreaterThanOrEqual(10_000);
  });

  it("accepts ten megabytes of input, which is the only weight rule a buyer meets", () => {
    expect(MAX_INPUT_BYTES).toBe(10 * 1024 * 1024);
  });
});
