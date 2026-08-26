import { describe, expect, it } from "vitest";
import { isAnimatedGif, willBecomeStill } from "../gif";
import { STORED_MAX_LONG_EDGE, TARGET_STORED_BYTES } from "../image-plan";

/**
 * Synthetic GIFs, byte by byte, because the question is about STRUCTURE and
 * nothing here needs a real picture to answer it. A frame's pixel data is one
 * empty sub-block: the walk steps over it by length and never decodes it.
 */
function gif({ frames, globalTable }: { frames: number; globalTable: boolean }): Uint8Array {
  const bytes: number[] = [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
    0x02, 0x00, 0x02, 0x00, // 2x2 logical screen
    globalTable ? 0x80 : 0x00, // packed: global colour table of 2 entries, or none
    0x00,
    0x00,
  ];
  if (globalTable) bytes.push(0, 0, 0, 255, 255, 255);

  for (let frame = 0; frame < frames; frame += 1) {
    // A graphic control extension before each frame, exactly as a real
    // animation carries: the walk has to step over these too.
    bytes.push(0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00);
    bytes.push(0x2c, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00); // image descriptor
    bytes.push(0x02); // LZW minimum code size
    bytes.push(0x01, 0x00, 0x00); // one sub-block, then the terminator
  }

  bytes.push(0x3b); // trailer
  return new Uint8Array(bytes);
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("isAnimatedGif", () => {
  it("says no to a GIF with one frame", () => {
    expect(isAnimatedGif(gif({ frames: 1, globalTable: true }))).toBe(false);
  });

  it("says yes to a GIF with two", () => {
    expect(isAnimatedGif(gif({ frames: 2, globalTable: true }))).toBe(true);
  });

  it("counts frames past a long animation without decoding any of them", () => {
    expect(isAnimatedGif(gif({ frames: 40, globalTable: true }))).toBe(true);
  });

  it("steps over a global colour table, or the absence of one", () => {
    expect(isAnimatedGif(gif({ frames: 2, globalTable: false }))).toBe(true);
    expect(isAnimatedGif(gif({ frames: 1, globalTable: false }))).toBe(false);
  });

  it("says no to anything that is not a GIF at all", () => {
    expect(isAnimatedGif(PNG)).toBe(false);
    expect(isAnimatedGif(new Uint8Array(0))).toBe(false);
  });

  it("says no rather than guessing when the file stops halfway through", () => {
    const truncated = gif({ frames: 3, globalTable: true }).slice(0, 20);
    expect(isAnimatedGif(truncated)).toBe(false);
  });

  it("stops at a byte that is none of the three block kinds, instead of hunting", () => {
    // 13 bytes of header and screen descriptor, then 6 of global colour
    // table: index 19 is where the first block byte should be.
    const corrupt = gif({ frames: 3, globalTable: true });
    corrupt[19] = 0x77;
    expect(isAnimatedGif(corrupt)).toBe(false);
  });
});

describe("willBecomeStill — warn only when frames are actually lost", () => {
  const animated = gif({ frames: 3, globalTable: true });
  const still = gif({ frames: 1, globalTable: true });

  it("warns about an animation too heavy to store as it is", () => {
    expect(willBecomeStill(animated, "image/gif", TARGET_STORED_BYTES + 1, 40, 40)).toBe(true);
  });

  it("warns about an animation too large on a side to store as it is", () => {
    expect(willBecomeStill(animated, "image/gif", 1000, STORED_MAX_LONG_EDGE + 1, 40)).toBe(true);
  });

  it("says nothing about an animation that already fits and keeps every frame", () => {
    expect(willBecomeStill(animated, "image/gif", 1000, 40, 40)).toBe(false);
  });

  it("says nothing about a GIF that never moved, however it is stored", () => {
    expect(willBecomeStill(still, "image/gif", TARGET_STORED_BYTES + 1, 40, 40)).toBe(false);
    expect(willBecomeStill(still, "image/gif", 1000, 40, 40)).toBe(false);
  });

  it("says nothing about a photograph, which is re-encoded but loses nothing that moved", () => {
    expect(willBecomeStill(PNG, "image/png", 9_000_000, 4000, 3000)).toBe(false);
  });
});
