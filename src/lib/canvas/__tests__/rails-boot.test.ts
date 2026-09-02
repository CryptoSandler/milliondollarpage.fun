import { describe, expect, it } from "vitest";
import { RAILS_BOOT } from "../rails-boot";
import {
  BAR_TOP_PX,
  BOARD_INSET,
  SIDE_RAIL_MAX,
  SIDE_RAIL_MIN,
  TAPE_H_PX,
  railLayout,
  sideRailWidth,
} from "../viewport";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../../board/geometry";

const BOARD = { width: BOARD_WIDTH, height: BOARD_HEIGHT };

/**
 * The layout is decided twice — once in `sideRailWidth`, which the tests and
 * the guards read, and once in six lines of inline JavaScript that run before
 * the first paint, because a boot script cannot import a module. This is what
 * stops those two from drifting.
 *
 * It runs the REAL string, not a copy of it: `new Function` with the four
 * globals the script names as its parameters, so the script's own arithmetic is
 * what answers, and a fake document element records what it stamped.
 */
function boot(
  width: number,
  height: number,
  search = "",
): { rails: string; railW: string } {
  const attributes = new Map<string, string>();
  const properties = new Map<string, string>();
  const documentElement = {
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    style: { setProperty: (name: string, value: string) => void properties.set(name, value) },
  };

  new Function(
    "document",
    "location",
    "innerWidth",
    "innerHeight",
    "addEventListener",
    RAILS_BOOT,
  )({ documentElement }, { search }, width, height, () => {});

  return {
    rails: attributes.get("data-rails") ?? "",
    railW: properties.get("--rail-w") ?? "",
  };
}

describe("the boot script and railLayout", () => {
  /**
   * Every viewport in DESIGN.md's table, plus both thresholds and a phone. The
   * steps through them are what matter: the function and the script have to
   * change their minds at the same pixel, not merely agree in the middle of a
   * range.
   */
  const SWEEP: [number, number][] = [
    [390, 844],
    [1280, 800],
    [1440, 900],
    [1600, 900],
    [1920, 1080],
    [2024, 1080],
    [2400, 1440],
    [2495, 1484],
    [2540, 1440],
    [2560, 1440],
    [2600, 1440],
    [3440, 1440],
    [3840, 2160],
    [5120, 1440],
    [800, 1280],
  ];

  it("agree at every viewport, including across both thresholds", () => {
    for (const [width, height] of SWEEP) {
      const expected = railLayout({ width, height }, BOARD);
      const stamped = boot(width, height);
      expect(stamped.rails, `data-rails at ${width}×${height}`).toBe(expected.kind);
      expect(stamped.railW, `--rail-w at ${width}×${height}`).toBe(`${expected.width}px`);
    }
  });

  it("agree at every pixel across both thresholds at 1080 tall", () => {
    /*
      The full rails begin at 1984×1080 — a gap of 180.4px — which an earlier
      version of this test found by assuming 1080 was out of their reach and
      failing. Both crossings are inside this range.
    */
    for (let width = 1400; width <= 2100; width += 1) {
      const expected = railLayout({ width, height: 1080 }, BOARD);
      const stamped = boot(width, 1080);
      expect(stamped.rails, `data-rails at ${width}×1080`).toBe(expected.kind);
      expect(stamped.railW, `--rail-w at ${width}×1080`).toBe(`${expected.width}px`);
    }
  });

  it("stamps nothing wider than the ceiling, however wide the window", () => {
    expect(boot(7680, 1440).railW).toBe(`${SIDE_RAIL_MAX}px`);
  });

  it("never stamps a rail narrower than the floor", () => {
    for (let width = 1200; width <= 3600; width += 7) {
      const { rails, railW } = boot(width, 1440);
      const w = Number(railW.replace("px", ""));
      if (rails === "off") expect(w, `${width}×1440`).toBe(0);
      else expect(w, `${width}×1440`).toBeGreaterThanOrEqual(SIDE_RAIL_MIN);
    }
  });

  /**
   * The switch the negative fit guard drives. Without it there is no way to ask
   * one window for both layouts.
   */
  it("forces every rail off for ?rails=off, at viewports that would have them", () => {
    expect(boot(3440, 1440).rails).toBe("full");
    expect(boot(3440, 1440, "?rails=off").rails).toBe("off");
    expect(boot(3440, 1440, "?capture=1&rails=off").railW).toBe("0px");
    expect(boot(1920, 1080, "?rails=off").rails).toBe("off");
  });
});

describe("sideRailWidth", () => {
  /**
   * THE GUARANTEE, AS ARITHMETIC. The browser asserts it too — see the negative
   * fit guard in `purchase-e2e.test.ts` — but the reason it holds is here: the
   * rail is sized from the gap a HEIGHT-LIMITED board leaves, so the board is
   * still fitted by height with the rails there and it is fitted to more height
   * than before, because the settled register has left the bottom of the
   * window. A board fitted to more height is wider.
   */
  it("never leaves the board smaller than it would be without rails", () => {
    // The chrome each layout puts above and below the board, in the same terms
    // BoardView measures: the header and the inset either way, and the settled
    // strip only in the layout that still has it along the bottom.
    const STRIP = 26;

    for (let width = 1000; width <= 6000; width += 13) {
      for (const height of [800, 900, 1080, 1200, 1440, 1600, 2160]) {
        const rail = sideRailWidth({ width, height }, BOARD);
        // No rails is not a comparison — it is the layout on the left of it.
        if (rail === 0) continue;

        const withoutW = width - 2 * BOARD_INSET;
        const withoutH = height - BAR_TOP_PX - STRIP - 2 * BOARD_INSET;
        const without = Math.min(withoutW / BOARD_WIDTH, withoutH / BOARD_HEIGHT);

        const withW = width - 2 * rail - 2 * BOARD_INSET;
        const withH = height - BAR_TOP_PX - 2 * BOARD_INSET;
        const withRails = Math.min(withW / BOARD_WIDTH, withH / BOARD_HEIGHT);

        expect(
          withRails,
          `the board at ${width}×${height} fits at ${withRails} with a ${rail}px rail ` +
            `and at ${without} without one`,
        ).toBeGreaterThanOrEqual(without);
      }
    }
  });

  it("gives a portrait window no rails at all", () => {
    expect(sideRailWidth({ width: 390, height: 844 }, BOARD)).toBe(0);
    expect(sideRailWidth({ width: 800, height: 1280 }, BOARD)).toBe(0);
  });
});

describe("railLayout", () => {
  /**
   * RAILS COME IN PAIRS OR THEY DO NOT COME, and the kinds do not overlap: one
   * gap decides, and it decides once. A viewport that got `full` must not also
   * look like `tools` to anybody reading the width.
   */
  it("gives each viewport exactly one kind", () => {
    for (const [width, height] of [
      [3440, 1440],
      [3840, 2160],
      [5120, 1440],
    ] as const) {
      expect(railLayout({ width, height }, BOARD).kind, `${width}×${height}`).toBe("full");
      expect(sideRailWidth({ width, height }, BOARD), `${width}×${height}`).toBeGreaterThan(0);
    }
  });

  /**
   * The door this pair was chosen to open, and the one it deliberately does
   * not: 1920 and the owner's own 2495×1484 get the overlay off the wall, 1440
   * and 1280 cannot.
   */
  /**
   * A RAIL ONLY EXISTS WHERE IT CAN BE READ, which is the owner's correction
   * after looking at a 120px one in production. None of the four viewports this
   * design is looked at on reaches 200px of gap; the ultrawides and the 4K
   * panels do. That is a narrower door than the one before it, deliberately.
   */
  it("reaches no ordinary desktop, and reaches the wide ones", () => {
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
      [1920, 1080],
      [2495, 1484],
      [2560, 1440],
      [390, 844],
    ] as const) {
      expect(railLayout({ width, height }, BOARD).kind, `${width}×${height}`).toBe("off");
    }
    for (const [width, height] of [
      [3440, 1440],
      [3840, 2160],
      [2560, 1080],
      [5120, 1440],
    ] as const) {
      expect(railLayout({ width, height }, BOARD).kind, `${width}×${height}`).toBe("full");
    }
  });

  /**
   * THE BOARD DOES NOT PAY FOR EITHER PAIR, and this is the arithmetic rather
   * than the hope. Both rails are sized from the letterbox a board fitted under
   * the header alone already leaves, so the board is still fitted by height
   * with them there — and to MORE height than the layout without them, because
   * the settled register has left the bottom of the window.
   */
  it("leaves the board at least the size it had without rails, at every viewport", () => {
    for (let width = 1000; width <= 6000; width += 13) {
      for (const height of [800, 900, 1080, 1200, 1440, 1484, 1600, 2160]) {
        const { kind, width: rail } = railLayout({ width, height }, BOARD);
        if (kind === "off") continue;

        // Without rails: the register is along the bottom.
        const withoutH = height - BAR_TOP_PX - TAPE_H_PX - 2 * BOARD_INSET;
        const without = Math.min(
          (width - 2 * BOARD_INSET) / BOARD_WIDTH,
          withoutH / BOARD_HEIGHT,
        );
        // With them: the header alone, and a rail on each side.
        const withRails = Math.min(
          (width - 2 * rail - 2 * BOARD_INSET) / BOARD_WIDTH,
          (height - BAR_TOP_PX - 2 * BOARD_INSET) / BOARD_HEIGHT,
        );
        expect(
          withRails,
          `the board at ${width}×${height} fits at ${withRails} with a ${rail}px ${kind} rail and ${without} without`,
        ).toBeGreaterThanOrEqual(without);
      }
    }
  });

  /**
   * AND THE BOARD IS CENTRED IN THE VIEWPORT, which is the complaint the pair
   * exists to answer: a rail on one side alone put the wall half a rail off the
   * middle of the window. Equal rails mean equal chrome, and equal chrome
   * around a centred fit is a centred board.
   */
  it("leaves the board centred in the window wherever there is a pair", () => {
    for (const [width, height] of [
      [3440, 1440],
      [3840, 2160],
      [5120, 1440],
    ] as const) {
      const { kind, width: rail } = railLayout({ width, height }, BOARD);
      expect(kind, `${width}×${height} should have a pair`).not.toBe("off");

      const left = rail + BOARD_INSET;
      const right = rail + BOARD_INSET;
      const free = width - left - right;
      const scale = Math.min(
        free / BOARD_WIDTH,
        (height - BAR_TOP_PX - 2 * BOARD_INSET) / BOARD_HEIGHT,
      );
      const boardW = BOARD_WIDTH * scale;
      const boardLeft = left + (free - boardW) / 2;
      const boardRight = width - (boardLeft + boardW);
      expect(
        boardLeft,
        `at ${width}×${height} the board sits ${boardLeft} from the left and ${boardRight} from the right`,
      ).toBeCloseTo(boardRight, 6);
    }
  });
});
