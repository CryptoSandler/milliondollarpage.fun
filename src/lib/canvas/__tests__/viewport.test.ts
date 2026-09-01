import { describe, expect, it } from "vitest";
import {
  BOARD_FRAME_PX,
  BOARD_INSET,
  type Chrome,
  type Size,
  TAP_SLOP_PX,
  backingStoreSize,
  boardToScreen,
  canPan,
  clampToBoard,
  clampToFit,
  fitScale,
  fittedBoardSize,
  freeRegion,
  initialViewport,
  isTap,
  nextZoomScale,
  panBy,
  screenToBoard,
  zoomAffordance,
  zoomLadder,
  zoomToScale,
} from "../viewport";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../../board/geometry";

const SCREEN = { width: 800, height: 600 };
/**
 * A small board for the arithmetic that does not care how big the real one is
 * — and deliberately NOT square, so a function that used one axis where it
 * meant the other has somewhere to show itself.
 */
const BOARD = { width: 250, height: 200 };
const CENTRED = { centreX: 100, centreY: 100, scale: 2 };

/**
 * The real wall, taken from the module that defines it rather than restated,
 * so these tests cannot go on describing a board the product no longer has.
 * Every number below is worked out by hand from 1250 × 800.
 */
const WALL = { width: BOARD_WIDTH, height: BOARD_HEIGHT };

describe("the wall these tests are about", () => {
  it("is 1250 by 800, which is what every expectation below is computed from", () => {
    expect(WALL).toEqual({ width: 1250, height: 800 });
  });
});

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
    const zoomed = zoomToScale(CENTRED, SCREEN, point, 4, { min: 1, max: 64 });
    const after = screenToBoard(zoomed, SCREEN, point);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(zoomed.scale).toBe(4);
  });

  it("refuses to zoom past its limits", () => {
    expect(zoomToScale(CENTRED, SCREEN, { x: 400, y: 300 }, 100, { min: 1, max: 8 }).scale).toBe(8);
    expect(zoomToScale(CENTRED, SCREEN, { x: 400, y: 300 }, 0.001, { min: 1, max: 8 }).scale).toBe(1);
  });

  it("pans in board units, so a drag moves the same board distance at any zoom", () => {
    expect(panBy({ ...CENTRED, scale: 2 }, 10, 0).centreX).toBe(110);
  });

  it("keeps the viewport centre on the board, each axis by its own size", () => {
    expect(clampToBoard({ centreX: -50, centreY: 900, scale: 4 }, BOARD)).toEqual({
      centreX: 0,
      centreY: 200,
      scale: 4,
    });
    // 250 across and 200 down: a centre pushed off the right edge stops at
    // 250, not at the height.
    expect(clampToBoard({ centreX: 9000, centreY: 9000, scale: 4 }, BOARD)).toEqual({
      centreX: 250,
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

describe("the whole board fits and a single pixel is reachable", () => {
  const screen = { width: 900, height: 900 };

  it("puts all million pixels on a square window, letterboxed rather than cropped", () => {
    // 900 of screen over 1250 of board is 0.72; over 800 it would be 1.125.
    // Width limits, so the board is 900 across and 576 down, with the slack
    // shared above and below.
    const fitted = { centreX: 625, centreY: 400, scale: 0.72 };
    expect(boardToScreen(fitted, screen, { x: 0, y: 0 })).toEqual({ x: 0, y: 162 });
    expect(boardToScreen(fitted, screen, { x: 1250, y: 800 })).toEqual({ x: 900, y: 738 });
  });

  it("reaches a single pixel by zooming, which is the smallest thing for sale", () => {
    // At 16 screen pixels per board pixel, the top rung of the ladder, one
    // pixel of somebody's artwork is a 16×16 square you can point at.
    const zoomed = { centreX: 137, centreY: 41, scale: 16 };
    const corner = boardToScreen(zoomed, screen, { x: 137, y: 41 });
    const next = boardToScreen(zoomed, screen, { x: 138, y: 42 });
    expect(next.x - corner.x).toBe(16);
    expect(next.y - corner.y).toBe(16);
  });

  it("keeps the point under the cursor still while zooming in", () => {
    const before = { centreX: 625, centreY: 400, scale: 0.72 };
    const cursor = { x: 200, y: 700 };
    const under = screenToBoard(before, screen, cursor);
    const after = zoomToScale(before, screen, cursor, 2.88, { min: 0.1, max: 40 });
    expect(screenToBoard(after, screen, cursor).x).toBeCloseTo(under.x, 9);
    expect(screenToBoard(after, screen, cursor).y).toBeCloseTo(under.y, 9);
  });
});

/**
 * CONTAIN, not cover.
 *
 * These replace the eight tests that asserted the old cover contract — the
 * board as wide as the window with its height panned. The owner reversed that
 * after living with it, so what is asserted here is the opposite and is a
 * deliberate change of contract rather than a regression: every corner of the
 * board is on screen at once, and nothing anywhere overflows.
 */
describe("initialViewport fits the whole board inside the free region", () => {
  const board = WALL;
  const corners = [
    { x: 0, y: 0 },
    { x: 1250, y: 0 },
    { x: 0, y: 800 },
    { x: 1250, y: 800 },
  ];

  /** Every corner of the board, on screen, inside the region the chrome leaves. */
  function expectWhollyVisible(screen: Size, chrome: Chrome) {
    const v = initialViewport(screen, chrome, board);
    const free = freeRegion(screen, chrome);
    for (const corner of corners) {
      const at = boardToScreen(v, screen, corner);
      expect(at.x).toBeGreaterThanOrEqual(free.x - 1e-6);
      expect(at.x).toBeLessThanOrEqual(free.x + free.width + 1e-6);
      expect(at.y).toBeGreaterThanOrEqual(free.y - 1e-6);
      expect(at.y).toBeLessThanOrEqual(free.y + free.height + 1e-6);
    }
  }

  it("puts all four corners inside the free region on a landscape window", () => {
    expectWhollyVisible({ width: 1400, height: 900 }, { top: 52, right: 0, bottom: 0, left: 420 });
  });

  it("puts all four corners inside the free region on a portrait window", () => {
    expectWhollyVisible({ width: 430, height: 932 }, { top: 48, right: 0, bottom: 92, left: 0 });
  });

  it("puts all four corners inside the free region on a lopsided chrome", () => {
    expectWhollyVisible({ width: 1200, height: 700 }, { top: 80, right: 30, bottom: 20, left: 300 });
  });

  it("scales by height when height is the limiting dimension", () => {
    // 1348 of free width over 1250 is 1.0784; 848 of free height over 800 is
    // 1.06. Height runs out first — and on the old square board this same
    // window was limited by height too, at a different number.
    const screen = { width: 1400, height: 900 };
    const chrome = { top: 52, right: 0, bottom: 0, left: 52 };
    const v = initialViewport(screen, chrome, board);

    expect(v.scale).toBeCloseTo(848 / 800, 10);
    expect(boardToScreen(v, screen, { x: 0, y: 0 }).y).toBeCloseTo(52, 6);
    expect(boardToScreen(v, screen, { x: 0, y: 800 }).y).toBeCloseTo(900, 6);
  });

  it("scales by width when width is the limiting dimension, which is portrait and phones", () => {
    const screen = { width: 390, height: 844 };
    const chrome = { top: 48, right: 0, bottom: 92, left: 0 };
    const v = initialViewport(screen, chrome, board);

    expect(v.scale).toBeCloseTo(390 / 1250, 10);
    expect(boardToScreen(v, screen, { x: 0, y: 0 }).x).toBeCloseTo(0, 6);
    expect(boardToScreen(v, screen, { x: 1250, y: 0 }).x).toBeCloseTo(390, 6);
  });

  it("keeps board pixels square: one board pixel is the same size across and down", () => {
    const screen = { width: 1337, height: 700 };
    const chrome = { top: 52, right: 0, bottom: 0, left: 337 };
    const v = initialViewport(screen, chrome, board);
    const topLeft = boardToScreen(v, screen, { x: 0, y: 0 });
    const bottomRight = boardToScreen(v, screen, { x: 100, y: 100 });

    expect(bottomRight.x - topLeft.x).toBeCloseTo(bottomRight.y - topLeft.y, 10);
    // WIDTH limits here, where the square board was limited by height: 1000 of
    // free width over 1250 is 0.8, and 648 of free height over 800 is 0.81.
    expect(bottomRight.x - topLeft.x).toBeCloseTo(100 * (1000 / 1250), 10);
  });

  it("centres the board in the free region rather than in the window", () => {
    // A 420px panel down the left means the board's middle sits 210px right of
    // the window's middle, not on it.
    const screen = { width: 1400, height: 900 };
    const chrome = { top: 52, right: 0, bottom: 0, left: 420 };
    const v = initialViewport(screen, chrome, board);
    const free = freeRegion(screen, chrome);
    const centre = boardToScreen(v, screen, { x: 625, y: 400 });

    expect(centre.x).toBeCloseTo(free.x + free.width / 2, 6);
    expect(centre.y).toBeCloseTo(free.y + free.height / 2, 6);
  });

  it("never returns a zero or negative scale, however cramped the viewport", () => {
    // A phone in landscape with the keyboard up can leave less height than the
    // chrome occupies. A non-positive scale divides by zero everywhere
    // downstream, so the fit scale has a floor and this is it.
    const v = initialViewport({ width: 320, height: 60 }, { top: 52, right: 0, bottom: 52, left: 0 }, board);
    expect(v.scale).toBeGreaterThan(0);
    expect(Number.isFinite(v.scale)).toBe(true);
    expect(Number.isFinite(v.centreX)).toBe(true);
    expect(Number.isFinite(v.centreY)).toBe(true);
  });

  it("survives a zero-sized screen before layout has run", () => {
    const v = initialViewport({ width: 0, height: 0 }, { top: 52, right: 0, bottom: 52, left: 0 }, board);
    expect(v.scale).toBeGreaterThan(0);
    expect(Number.isFinite(v.centreX)).toBe(true);
    expect(Number.isFinite(v.centreY)).toBe(true);
  });
});

/**
 * THE DOCUMENT NEVER SCROLLS, and that is arithmetic before it is CSS.
 *
 * `overflow: hidden` on the page is the belt; this is the braces. If the board
 * plus its chrome ever asked for more room than the viewport has, hiding the
 * overflow would be hiding artwork rather than hiding nothing.
 *
 * `chromeFor` mirrors the two layouts globals.css chooses between. The
 * stylesheet is the authority on which one applies; this is here so that the
 * numbers those layouts produce are checked against the fit maths rather than
 * assumed to agree with it.
 */
describe("the board plus its chrome never needs more room than the viewport has", () => {
  const board = WALL;
  /**
   * The measured width of the side panel — `--panel-w` in globals.css, and the
   * width its widest un-shrinkable control actually needs. Not a leftover any
   * more: a panel sized by what the board does not want is a panel that can
   * take width the board does want, which is how the board came to be fitted
   * by width with its own edge off the window.
   */
  const SIDE_PANEL = 288;

  // Mirrors BoardView's measurement, BOARD_INSET included: the margin and the
  // frame are part of the chrome, so the no-scroll arithmetic below has to be
  // done with them rather than around them.
  function chromeFor(screen: Size): Chrome {
    const barTop = screen.width <= 640 ? 48 : 52;
    // The side panel takes over at 640px and a 5:4 aspect — see the `side`
    // variant in globals.css.
    const side = screen.width >= 640 && screen.width * 4 >= screen.height * 5;
    if (!side) {
      const bar = screen.width <= 640 ? 92 : 88;
      return {
        top: barTop + BOARD_INSET,
        right: BOARD_INSET,
        bottom: bar + BOARD_INSET,
        left: BOARD_INSET,
      };
    }
    return {
      top: barTop + BOARD_INSET,
      right: BOARD_INSET,
      bottom: BOARD_INSET,
      left: Math.min(SIDE_PANEL, screen.width) + BOARD_INSET,
    };
  }

  const viewports: Array<[string, Size]> = [
    ["a laptop", { width: 1440, height: 900 }],
    ["a desktop", { width: 1920, height: 1080 }],
    ["an ultrawide", { width: 3440, height: 1440 }],
    ["extreme landscape", { width: 2560, height: 600 }],
    ["a phone in landscape", { width: 844, height: 390 }],
    ["a tablet in landscape", { width: 1024, height: 768 }],
    ["a square window", { width: 800, height: 800 }],
    ["a tablet in portrait", { width: 768, height: 1024 }],
    ["a phone in portrait", { width: 390, height: 844 }],
    ["a large phone in portrait", { width: 430, height: 932 }],
    ["extreme portrait", { width: 1000, height: 3000 }],
    ["a tiny window", { width: 320, height: 568 }],
    ["a tinier window", { width: 240, height: 320 }],
  ];

  for (const [name, screen] of viewports) {
    it(`fits on ${name} (${screen.width}×${screen.height}) with nothing to scroll`, () => {
      const chrome = chromeFor(screen);
      const free = freeRegion(screen, chrome);
      const fitted = fittedBoardSize(screen, chrome, board);

      // The chrome itself fits, so the free region is real rather than negative.
      expect(chrome.left + chrome.right).toBeLessThanOrEqual(screen.width);
      expect(chrome.top + chrome.bottom).toBeLessThanOrEqual(screen.height);
      expect(free.width).toBeGreaterThan(0);
      expect(free.height).toBeGreaterThan(0);

      // And the board fits in what is left, in BOTH axes. Nothing overflows,
      // so nothing scrolls.
      expect(fitted.width).toBeLessThanOrEqual(free.width + 1e-9);
      expect(fitted.height).toBeLessThanOrEqual(free.height + 1e-9);
      expect(fitted.width + chrome.left + chrome.right).toBeLessThanOrEqual(screen.width + 1e-9);
      expect(fitted.height + chrome.top + chrome.bottom).toBeLessThanOrEqual(screen.height + 1e-9);
    });
  }

  /*
   * The board used to sit flush against the edge it was fitted by — the bottom
   * of the window before the gap was added there, and then the left and right
   * of the free region, which the gap never reached. Flush is not a margin
   * that is merely tight: the board's own 2px frame is drawn OUTSIDE the
   * paper, so a board flush against the free region has its frame under the
   * side panel on one side and off the window on the other.
   *
   * So the strip is checked on all four sides, and it is checked against the
   * FRAME's outer edge rather than the paper's. The margin is chrome, so it
   * costs the board a little scale instead of costing the document its
   * no-scroll contract — which every viewport above still keeps.
   */
  it("leaves a strip of paper on all four sides of the board, frame included", () => {
    const margin = BOARD_INSET - BOARD_FRAME_PX;
    for (const [name, screen] of viewports) {
      const chrome = chromeFor(screen);
      const free = freeRegion(screen, chrome);
      const fitted = fittedBoardSize(screen, chrome, board);
      // The board is centred in the free region, so half the slack sits on
      // each side of it. What is on the other side of the inset is whatever
      // that edge's chrome is — the panel, a bar, or the window itself — so
      // the clearance from THAT is the inset plus the slack, less the frame
      // the inset is partly there to hold.
      // The board is centred in the free region, so the two sides of an axis
      // get the same clearance and there are two numbers here, not four.
      const clearance = {
        "left and right": BOARD_INSET + (free.width - fitted.width) / 2 - BOARD_FRAME_PX,
        "top and bottom": BOARD_INSET + (free.height - fitted.height) / 2 - BOARD_FRAME_PX,
      };
      for (const [sides, gap] of Object.entries(clearance)) {
        expect(gap, `${sides} of the board on ${name}`).toBeGreaterThanOrEqual(margin - 1e-9);
      }
    }
  });

  it("keeps that strip at the 8 pixels the chrome budget leaves for it", () => {
    /*
      IT WAS 16–24 AND IS NOW 8, and the change is the layout norm rather than a
      slipped assertion. Twenty was chosen when the chrome around the board was
      a 52px bar and a 288px column, where eight would have looked mean and the
      page's 16px gutter was the natural reference.

      The layout runs on a vertical chrome budget of 60px now — a 34px header
      and a 26px rail — and against that a 20px inset top and bottom is 40px,
      two thirds of the entire budget spent on clear paper. Eight still reads as
      hung rather than cropped. The frame is added on top, so the number is
      clear paper rather than paper the border is drawn over.
    */
    expect(BOARD_INSET - BOARD_FRAME_PX).toBe(8);
    expect(BOARD_INSET).toBeGreaterThan(BOARD_FRAME_PX);
  });

  it("names the one exception: a viewport with no room for a board at all", () => {
    // Below the fit scale's floor the board is 12.5 by 8 and the free region
    // is nothing, so this is the single case where the arithmetic above cannot
    // hold. It is not a scrolling case — there is no room for a scrollbar
    // either — and the floor exists so that dividing by the scale downstream
    // does not produce Infinity.
    const screen = { width: 320, height: 40 };
    const chrome = { top: 52, right: 0, bottom: 52, left: 0 };
    expect(freeRegion(screen, chrome).height).toBe(0);
    expect(fitScale(screen, chrome, board)).toBeGreaterThan(0);
  });
});

describe("clampToFit keeps the whole board inside the free region", () => {
  const board = WALL;
  const screen = { width: 1000, height: 700 };
  const chrome: Chrome = { top: 50, right: 0, bottom: 100, left: 0 };
  // 1000 of free width over 1250 is 0.8; 550 of free height over 800 is
  // 0.6875, and that is the one that runs out first.
  const base = fitScale(screen, chrome, board);
  const at = (centreY: number, centreX = 625, scale = base) => ({ centreX, centreY, scale });

  it("fits by the axis that runs out first", () => {
    expect(base).toBeCloseTo(550 / 800, 10);
  });

  it("pins the board to the middle of the free region at the base rung", () => {
    const free = freeRegion(screen, chrome);
    for (const wanted of [-9000, 0, 400, 9000]) {
      const clamped = clampToFit(at(wanted), screen, chrome, board);
      const centre = boardToScreen(clamped, screen, { x: 625, y: 400 });
      expect(centre.y).toBeCloseTo(free.y + free.height / 2, 6);
    }
  });

  it("stops an upward pan at the board's top edge once zoomed in", () => {
    const clamped = clampToFit(at(-400, 625, 2), screen, chrome, board);
    expect(boardToScreen(clamped, screen, { x: 0, y: 0 }).y).toBeCloseTo(chrome.top, 6);
  });

  it("stops a downward pan at the board's bottom edge once zoomed in", () => {
    const clamped = clampToFit(at(9000, 625, 2), screen, chrome, board);
    expect(boardToScreen(clamped, screen, { x: 0, y: 800 }).y).toBeCloseTo(
      screen.height - chrome.bottom,
      6,
    );
  });

  it("allows horizontal panning once zoomed in, up to the board's edges", () => {
    const zoomed = clampToFit(at(400, 0, 4), screen, chrome, board);
    // At 4x, half a 1000px free width is 125 board pixels, so the left edge of
    // the board is as far left as the view can go.
    expect(zoomed.centreX).toBeCloseTo(125, 6);
    expect(boardToScreen(zoomed, screen, { x: 0, y: 0 }).x).toBeCloseTo(0, 6);
  });

  it("respects a side panel: the board never slides under it", () => {
    const wide = { width: 1400, height: 900 };
    const side: Chrome = { top: 52, right: 0, bottom: 0, left: 420 };
    const clamped = clampToFit({ centreX: -500, centreY: 500, scale: 2 }, wide, side, board);
    expect(boardToScreen(clamped, wide, { x: 0, y: 0 }).x).toBeCloseTo(side.left, 6);
  });

  it("centres an axis the board is still smaller than, rather than inverting the range", () => {
    // Zoomed past fit vertically but not horizontally: 800 board pixels down
    // at 0.7 is 560, taller than the 550 of free height, while 1250 across is
    // 875, narrower than the 1000 of free width.
    const clamped = clampToFit(at(400, 0, 0.7), screen, chrome, board);
    const centre = boardToScreen(clamped, screen, { x: 625, y: 400 });
    expect(centre.x).toBeCloseTo(screen.width / 2, 6);
  });
});

/**
 * Panning is a thing you earn by zooming in. At the base rung the whole board
 * is on screen, so there is nothing to pan and neither a drag nor a wheel is
 * allowed to move it — which is also why "zoom 1" in this project means the
 * rung where the board fits, not one screen pixel per board pixel.
 */
describe("canPan", () => {
  // 0.784 is what a 1400×900 window with a 420px panel fits this wall at, and
  // 1.26 is a 1920×1080 desktop's. Both are worked out below in zoomLadder.
  it("refuses at the base rung", () => {
    expect(canPan(0.784, 0.784)).toBe(false);
    expect(canPan(1.26, 1.26)).toBe(false);
  });

  it("refuses below the base rung, which a resize can briefly produce", () => {
    expect(canPan(0.5, 0.784)).toBe(false);
  });

  it("allows it on every rung above", () => {
    expect(canPan(1, 0.784)).toBe(true);
    expect(canPan(2, 1.26)).toBe(true);
    expect(canPan(16, 0.312)).toBe(true);
  });

  it("is not fooled by a float round trip into offering a pan of nothing", () => {
    const drifted = 0.784 * (2 / 0.784) * (0.784 / 2);
    expect(canPan(drifted, 0.784)).toBe(false);
  });
});

/**
 * A canvas element has no intrinsic size: CSS gives it a box, and the backing
 * store is a separate number. Getting that number wrong is what makes a board
 * of small bitmaps look soft on a retina screen — the browser stretches half
 * the pixels it should have allocated across the whole box.
 */
describe("backingStoreSize allocates real device pixels", () => {
  it("is exactly double the CSS size in both dimensions at a ratio of 2", () => {
    expect(backingStoreSize({ width: 1440, height: 900 }, 2)).toEqual({ width: 2880, height: 1800 });
  });

  it("matches the CSS size at a ratio of 1", () => {
    expect(backingStoreSize({ width: 1440, height: 900 }, 1)).toEqual({ width: 1440, height: 900 });
  });

  it("triples it at a ratio of 3", () => {
    expect(backingStoreSize({ width: 390, height: 844 }, 3)).toEqual({ width: 1170, height: 2532 });
  });

  it("rounds a fractional ratio to whole pixels rather than letting the browser truncate", () => {
    // 1.5 is what Windows display scaling reports constantly.
    expect(backingStoreSize({ width: 1281, height: 721 }, 1.5)).toEqual({ width: 1922, height: 1082 });
    // 2.75 is a real Android ratio; 1080.75 must not become 1080.
    expect(backingStoreSize({ width: 393, height: 851 }, 2.75)).toEqual({ width: 1081, height: 2340 });
  });

  it("falls back to 1 rather than allocating nothing when the ratio is missing", () => {
    expect(backingStoreSize({ width: 800, height: 600 }, 0)).toEqual({ width: 800, height: 600 });
  });
});

/**
 * The zoom ladder. Its whole reason to exist is that a board pixel should
 * cover a whole number of screen pixels, so a buyer's bitmap reads as squares
 * rather than as a smear — with the one rung that cannot be an integer, the
 * fit scale, at the bottom because the whole board must always be on screen.
 */
describe("zoomLadder", () => {
  it("puts the fit scale at the bottom and only the powers of two above it", () => {
    // A 1400×900 window with 52px of bar and a 420px panel leaves 980 × 848,
    // and 980 over 1250 is 0.784 — width limits, where the square board's
    // height did.
    const fit = fitScale({ width: 1400, height: 900 }, { top: 52, right: 0, bottom: 0, left: 420 }, WALL);
    expect(fit).toBeCloseTo(0.784, 10);
    expect(zoomLadder(fit, 16)).toEqual([fit, 1, 2, 4, 8, 16]);
  });

  it("skips 1 entirely once the fit scale is above it", () => {
    expect(zoomLadder(1.4, 16)).toEqual([1.4, 2, 4, 8, 16]);
  });

  it("never lists a rung above maxZoom", () => {
    expect(zoomLadder(1.44, 8)).toEqual([1.44, 2, 4, 8]);
  });

  it("drops an integer rung that is only equal to the fit scale, not above it", () => {
    // A free region 1600 tall fits an 800-pixel board at exactly 2. Offering 2
    // twice would waste a wheel notch on a step that goes nowhere.
    expect(zoomLadder(2, 16)).toEqual([2, 4, 8, 16]);
  });
});

describe("nextZoomScale steps the ladder", () => {
  // The fit scale of a landscape window with a side panel, and of a portrait
  // phone: the floor of the ladder in each case.
  const FIT_WIDE = 1.44;
  const FIT_PHONE = 0.9;
  const MAX = 16;

  it("steps up from the fit scale to the first integer rung above it, not to 1", () => {
    expect(nextZoomScale(FIT_WIDE, "in", FIT_WIDE, MAX)).toBe(2);
  });

  it("steps up to 1 first when the fit scale is below 1", () => {
    expect(nextZoomScale(FIT_PHONE, "in", FIT_PHONE, MAX)).toBe(1);
  });

  it("doubles on every further step up", () => {
    let scale = nextZoomScale(FIT_WIDE, "in", FIT_WIDE, MAX);
    const climbed = [scale];
    for (let i = 0; i < 4; i += 1) {
      scale = nextZoomScale(scale, "in", FIT_WIDE, MAX);
      climbed.push(scale);
    }
    expect(climbed).toEqual([2, 4, 8, 16, 16]);
  });

  it("steps down from the lowest integer rung onto the fit scale exactly", () => {
    expect(nextZoomScale(2, "out", FIT_WIDE, MAX)).toBe(FIT_WIDE);
    expect(nextZoomScale(1, "out", FIT_PHONE, MAX)).toBe(FIT_PHONE);
  });

  it("stays on the fit scale when stepping down from it", () => {
    // The floor of the ladder is now the scale at which the whole board is
    // visible. There is nothing below it worth offering.
    expect(nextZoomScale(FIT_WIDE, "out", FIT_WIDE, MAX)).toBe(FIT_WIDE);
    expect(nextZoomScale(FIT_PHONE, "out", FIT_PHONE, MAX)).toBe(FIT_PHONE);
  });

  it("halves on the way back down and lands on the fit scale, never past it", () => {
    let scale = 16;
    const dropped = [];
    for (let i = 0; i < 6; i += 1) {
      scale = nextZoomScale(scale, "out", FIT_WIDE, MAX);
      dropped.push(scale);
    }
    expect(dropped).toEqual([8, 4, 2, FIT_WIDE, FIT_WIDE, FIT_WIDE]);
  });

  it("never returns a scale below the fit scale, from any start in either direction", () => {
    for (const fit of [0.32, 0.9, 1, 1.44, 2.5, 3.84]) {
      for (const start of [0.001, fit / 2, fit, 1, 3, 7.5, 16, 1000]) {
        for (const direction of ["in", "out"] as const) {
          expect(nextZoomScale(start, direction, fit, 16)).toBeGreaterThanOrEqual(fit);
        }
      }
    }
  });

  it("never exceeds maxZoom", () => {
    for (const start of [0.5, 1.44, 8, 16, 40]) {
      expect(nextZoomScale(start, "in", 1.44, 16)).toBeLessThanOrEqual(16);
      expect(nextZoomScale(start, "out", 1.44, 16)).toBeLessThanOrEqual(16);
    }
  });

  it("steps from the nearest rung when a resize has left the scale off the ladder", () => {
    // The fit scale was 1.44, the window changed shape, and clampToFit left
    // the scale at an in-between value. The next notch is still a rung, not
    // 1.15 × mush.
    expect(nextZoomScale(3.1, "in", 1.44, 16)).toBe(4);
    expect(nextZoomScale(3.1, "out", 1.44, 16)).toBe(2);
  });

  it("survives the float round trip a previous step leaves behind", () => {
    // 1.44 * (2 / 1.44) does not come back as exactly 2. A step down from
    // there must still be the fit scale, not a no-op that lands on 2 again.
    const drifted = 1.44 * (2 / 1.44);
    expect(nextZoomScale(drifted, "out", 1.44, 16)).toBe(1.44);
    expect(nextZoomScale(drifted, "in", 1.44, 16)).toBe(4);
  });
});

describe("zoomAffordance tells the buttons which end of the ladder they are on", () => {
  const FIT = 0.784;
  const MAX = 16;

  it("offers a step in but not out at the bottom rung", () => {
    expect(zoomAffordance(FIT, FIT, MAX)).toEqual({ canZoomIn: true, canZoomOut: false });
  });

  it("offers a step out but not in at the top rung", () => {
    expect(zoomAffordance(MAX, FIT, MAX)).toEqual({ canZoomIn: false, canZoomOut: true });
  });

  it("offers both on every rung in between", () => {
    for (const scale of [1, 2, 4, 8]) {
      expect(zoomAffordance(scale, FIT, MAX)).toEqual({ canZoomIn: true, canZoomOut: true });
    }
  });

  it("agrees with nextZoomScale: a disabled button is exactly one that would not move", () => {
    // Rungs only. Below fit — where a resize can briefly leave the scale —
    // stepping "out" actually moves the scale UP to the floor, so the two
    // deliberately part company there and the minus button stays off.
    for (const fit of [0.312, 0.784, 1.26, 3.84]) {
      for (const scale of [fit, ...[1, 2, 4, 8, 16].filter((rung) => rung > fit)]) {
        const said = zoomAffordance(scale, fit, MAX);
        expect(said.canZoomIn).toBe(nextZoomScale(scale, "in", fit, MAX) !== scale);
        expect(said.canZoomOut).toBe(nextZoomScale(scale, "out", fit, MAX) !== scale);
      }
    }
  });

  it("says the same thing about zooming out that canPan says about panning", () => {
    // The bottom rung is fit: there is nothing below it to zoom to and
    // nowhere for a drag to go. One predicate, said twice, never drifting.
    for (const fit of [0.784, 1.26]) {
      for (const scale of [fit, fit * (2 / fit), 1, 2, 16]) {
        expect(zoomAffordance(scale, fit, 16).canZoomOut).toBe(canPan(scale, fit));
      }
    }
  });

  it("never offers a step in above a fit scale that has swallowed the whole ladder", () => {
    // A fit scale above maxZoom is the one case where the ladder is a single
    // rung: fit itself. Neither button does anything there.
    expect(zoomAffordance(20, 20, 16)).toEqual({ canZoomIn: false, canZoomOut: false });
  });
});
