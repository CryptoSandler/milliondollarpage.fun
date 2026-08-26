import { describe, expect, it } from "vitest";
import {
  TAP_SLOP_PX,
  boardToScreen,
  clampToBoard,
  clampToCover,
  initialViewport,
  isTap,
  panBy,
  screenToBoard,
  zoomAt,
} from "../viewport";

const SCREEN = { width: 800, height: 600 };
const BOARD = { width: 200, height: 200 };
const CENTRED = { centreX: 100, centreY: 100, scale: 2 };

describe("viewport", () => {
  it("puts the viewport centre at the middle of the screen", () => {
    expect(screenToBoard(CENTRED, SCREEN, { x: 400, y: 300 })).toEqual({ x: 100, y: 100 });
  });

  it("converts screen to board at the current scale", () => {
    // 40 screen pixels right of centre, at 2x, is 20 board pixels.
    expect(screenToBoard(CENTRED, SCREEN, { x: 440, y: 300 })).toEqual({ x: 120, y: 100 });
  });

  it("keeps the board point under the cursor fixed while zooming", () => {
    // This is the whole contract of zoom-to-cursor: whatever you point at is
    // still under the pointer afterwards.
    const point = { x: 600, y: 200 };
    const before = screenToBoard(CENTRED, SCREEN, point);
    const zoomed = zoomAt(CENTRED, SCREEN, point, 2, { min: 1, max: 64 });
    const after = screenToBoard(zoomed, SCREEN, point);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(zoomed.scale).toBe(4);
  });

  it("refuses to zoom past its limits", () => {
    expect(zoomAt(CENTRED, SCREEN, { x: 400, y: 300 }, 100, { min: 1, max: 8 }).scale).toBe(8);
    expect(zoomAt(CENTRED, SCREEN, { x: 400, y: 300 }, 0.001, { min: 1, max: 8 }).scale).toBe(1);
  });

  it("pans in board units, so a drag moves the same board distance at any zoom", () => {
    expect(panBy({ ...CENTRED, scale: 2 }, 10, 0).centreX).toBe(110);
  });

  it("keeps the viewport centre on the board", () => {
    expect(clampToBoard({ centreX: -50, centreY: 900, scale: 4 }, BOARD)).toEqual({
      centreX: 0,
      centreY: 200,
      scale: 4,
    });
  });

  it("treats a small movement as a tap and a large one as a drag", () => {
    // Without this, every pan on a phone ends in an accidental pixel.
    expect(isTap(0)).toBe(true);
    expect(isTap(TAP_SLOP_PX - 1)).toBe(true);
    expect(isTap(TAP_SLOP_PX + 1)).toBe(false);
  });
});

describe("the whole board fits and a single block is reachable", () => {
  const screen = { width: 900, height: 900 };

  it("shows all 1000 pixels at a scale that fits a laptop", () => {
    const fitted = { centreX: 500, centreY: 500, scale: 900 / 1000 };
    const topLeft = screenToBoard(fitted, screen, { x: 0, y: 0 });
    const bottomRight = screenToBoard(fitted, screen, { x: 900, y: 900 });
    expect(topLeft).toEqual({ x: 0, y: 0 });
    expect(bottomRight).toEqual({ x: 1000, y: 1000 });
  });

  it("keeps the point under the cursor still while zooming in", () => {
    const before = { centreX: 500, centreY: 500, scale: 0.9 };
    const cursor = { x: 200, y: 700 };
    const under = screenToBoard(before, screen, cursor);
    const after = zoomAt(before, screen, cursor, 4, { min: 0.1, max: 40 });
    expect(screenToBoard(after, screen, cursor).x).toBeCloseTo(under.x, 9);
    expect(screenToBoard(after, screen, cursor).y).toBeCloseTo(under.y, 9);
  });
});

/**
 * COVER, not contain. These tests replace the seven that asserted the old
 * "whole board visible between the bars" fit: the board is now scaled by width
 * alone and the overflow is panned, which is a deliberate change of contract
 * rather than a regression. What is asserted here is what the board must never
 * do — show cream down its sides, or stretch a pixel out of square.
 */
describe("initialViewport covers the viewport width", () => {
  const board = { width: 1000, height: 1000 };

  it("renders the board exactly as wide as the viewport, with no margin either side", () => {
    const screen = { width: 1400, height: 900 };
    const v = initialViewport(screen, { top: 52, bottom: 88 }, board);

    expect(v.scale).toBeCloseTo(1400 / 1000, 10);
    expect(boardToScreen(v, screen, { x: 0, y: 0 }).x).toBeCloseTo(0, 6);
    expect(boardToScreen(v, screen, { x: 1000, y: 0 }).x).toBeCloseTo(screen.width, 6);
  });

  it("keeps board pixels square: one board pixel is the same size across and down", () => {
    const screen = { width: 1337, height: 700 };
    const v = initialViewport(screen, { top: 52, bottom: 88 }, board);
    const topLeft = boardToScreen(v, screen, { x: 0, y: 0 });
    const bottomRight = boardToScreen(v, screen, { x: 100, y: 100 });

    expect(bottomRight.x - topLeft.x).toBeCloseTo(bottomRight.y - topLeft.y, 10);
    expect(bottomRight.x - topLeft.x).toBeCloseTo(100 * (screen.width / 1000), 10);
  });

  it("anchors the board's top edge to the top of the free region and pans the overflow", () => {
    const screen = { width: 1400, height: 900 };
    const bars = { top: 52, bottom: 88 };
    const v = initialViewport(screen, bars, board);

    // Top-aligned, not centred: the buyer starts on the board's own top edge,
    // and everything below it is a scroll away.
    expect(boardToScreen(v, screen, { x: 0, y: 0 }).y).toBeCloseTo(bars.top, 6);
    // And it genuinely overflows: 1400px of board against 760px of free region.
    expect(boardToScreen(v, screen, { x: 0, y: 1000 }).y).toBeGreaterThan(screen.height - bars.bottom);
  });

  it("keeps that anchor when the two bars are different heights", () => {
    const screen = { width: 1400, height: 900 };
    const bars = { top: 80, bottom: 40 };
    const v = initialViewport(screen, bars, board);
    expect(boardToScreen(v, screen, { x: 0, y: 0 }).y).toBeCloseTo(bars.top, 6);
  });

  it("scales by width on a wide, short viewport instead of shrinking to fit the height", () => {
    // The old contract fitted this to (600 - 88) / 1000 and left 1.4k of cream
    // at the sides. Width wins now, and the height overflows.
    const screen = { width: 2000, height: 600 };
    const v = initialViewport(screen, { top: 44, bottom: 44 }, board);

    expect(v.scale).toBeCloseTo(2, 10);
    expect(boardToScreen(v, screen, { x: 1000, y: 0 }).x).toBeCloseTo(screen.width, 6);
  });

  it("still fills the width when the whole board fits between the bars, and centres it there", () => {
    // 800px of board inside 1460px of free region: nothing to pan, and still
    // not letterboxed — the width is exact, the slack is vertical.
    const screen = { width: 800, height: 1600 };
    const bars = { top: 52, bottom: 88 };
    const v = initialViewport(screen, bars, board);

    expect(boardToScreen(v, screen, { x: 0, y: 0 }).x).toBeCloseTo(0, 6);
    expect(boardToScreen(v, screen, { x: 1000, y: 0 }).x).toBeCloseTo(screen.width, 6);

    const centre = boardToScreen(v, screen, { x: 500, y: 500 });
    expect(centre.y).toBeCloseTo(bars.top + (screen.height - bars.top - bars.bottom) / 2, 6);
  });

  it("never returns a zero or negative scale, however cramped the viewport", () => {
    // A phone in landscape with the keyboard up can leave less height than the
    // bars occupy. A non-positive scale divides by zero everywhere downstream.
    const v = initialViewport({ width: 320, height: 60 }, { top: 52, bottom: 52 }, board);
    expect(v.scale).toBeGreaterThan(0);
    expect(Number.isFinite(v.scale)).toBe(true);
    expect(Number.isFinite(v.centreY)).toBe(true);
  });

  it("survives a zero-sized screen before layout has run", () => {
    const v = initialViewport({ width: 0, height: 0 }, { top: 52, bottom: 52 }, board);
    expect(v.scale).toBeGreaterThan(0);
    expect(Number.isFinite(v.centreX)).toBe(true);
    expect(Number.isFinite(v.centreY)).toBe(true);
  });
});

describe("clampToCover keeps the board covering the free region", () => {
  const board = { width: 1000, height: 1000 };
  const screen = { width: 1000, height: 700 };
  const bars = { top: 50, bottom: 100 };
  const at = (centreY: number, centreX = 500, scale = 1) => ({ centreX, centreY, scale });

  it("stops an upward pan at the board's top edge", () => {
    const clamped = clampToCover(at(-400), screen, bars, board);
    expect(boardToScreen(clamped, screen, { x: 0, y: 0 }).y).toBeCloseTo(bars.top, 6);
  });

  it("stops a downward pan at the board's bottom edge", () => {
    const clamped = clampToCover(at(9000), screen, bars, board);
    expect(boardToScreen(clamped, screen, { x: 0, y: 1000 }).y).toBeCloseTo(
      screen.height - bars.bottom,
      6,
    );
  });

  it("pins the board horizontally while it is exactly as wide as the viewport", () => {
    expect(clampToCover(at(500, 20), screen, bars, board).centreX).toBeCloseTo(500, 6);
  });

  it("allows horizontal panning once zoomed in past cover, up to the board's edges", () => {
    const zoomed = clampToCover(at(500, 0, 4), screen, bars, board);
    // At 4x, half a 1000px viewport is 125 board pixels, so the left edge of
    // the board is as far left as the view can go.
    expect(zoomed.centreX).toBeCloseTo(125, 6);
    expect(boardToScreen(zoomed, screen, { x: 0, y: 0 }).x).toBeCloseTo(0, 6);
  });

  it("centres a board too short to span the region rather than clamping to an inverted range", () => {
    const tall = { width: 400, height: 1600 };
    const clamped = clampToCover(at(0, 200, 0.4), tall, bars, board);
    const centre = boardToScreen(clamped, tall, { x: 500, y: 500 });
    expect(centre.y).toBeCloseTo(bars.top + (tall.height - bars.top - bars.bottom) / 2, 6);
  });
});
