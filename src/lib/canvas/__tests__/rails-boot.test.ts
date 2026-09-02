import { describe, expect, it } from "vitest";
import { RAILS_BOOT } from "../rails-boot";
import {
  BAR_TOP_PX,
  BOARD_INSET,
  SIDE_RAIL_MAX,
  SIDE_RAIL_MIN,
  TAPE_H_PX,
  TOOLS_RAIL_MAX,
  TOOLS_RAIL_MIN,
  sideRailWidth,
  toolsRailWidth,
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
): { rails: string; railW: string; tools: string; toolsW: string } {
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
    tools: attributes.get("data-tools") ?? "",
    toolsW: properties.get("--tools-w") ?? "",
  };
}

describe("the boot script and sideRailWidth", () => {
  /**
   * Every viewport in DESIGN.md's table, plus the two edges of the clamp and a
   * phone. The step through the threshold is the part that matters: the
   * function and the script have to change their minds at the same pixel, not
   * merely agree in the middle of each range.
   */
  const SWEEP: [number, number][] = [
    [390, 844],
    [1280, 800],
    [1440, 900],
    [1920, 1080],
    [2400, 1440],
    [2540, 1440],
    [2560, 1440],
    [2600, 1440],
    [3440, 1440],
    [3840, 2160],
    [5120, 1440],
    [800, 1280],
  ];

  it("agree at every viewport, including across the threshold", () => {
    for (const [width, height] of SWEEP) {
      const expected = sideRailWidth({ width, height }, BOARD);
      const tools = toolsRailWidth({ width, height }, BOARD);
      const stamped = boot(width, height);
      expect(stamped.railW, `--rail-w at ${width}×${height}`).toBe(`${expected}px`);
      expect(stamped.rails, `data-rails at ${width}×${height}`).toBe(expected > 0 ? "on" : "off");
      expect(stamped.toolsW, `--tools-w at ${width}×${height}`).toBe(`${tools}px`);
      expect(stamped.tools, `data-tools at ${width}×${height}`).toBe(tools > 0 ? "on" : "off");
    }
  });

  it("agree at every pixel of width across the threshold at 1440 tall", () => {
    // The width the rails begin at, hunted rather than asserted: what this
    // checks is that there is exactly ONE crossing and both implementations
    // make it in the same place.
    for (let width = 2400; width <= 2700; width += 1) {
      expect(boot(width, 1440).railW, `--rail-w at ${width}×1440`).toBe(
        `${sideRailWidth({ width, height: 1440 }, BOARD)}px`,
      );
    }
  });

  it("agree at every pixel across the TOOLS threshold at 1080 tall", () => {
    /*
      Two thresholds now, and the second has its own crossing. The range stops
      at 1983 because the FULL rails begin at 1984×1080 — a gap of 180.4px —
      which this test found by failing when it assumed 1080 was out of their
      reach entirely. 1920 is comfortably inside the tools rail's range and
      outside the full rails', which is the case the option was chosen for.
    */
    for (let width = 1400; width <= 1983; width += 1) {
      const stamped = boot(width, 1080);
      expect(stamped.toolsW, `--tools-w at ${width}×1080`).toBe(
        `${toolsRailWidth({ width, height: 1080 }, BOARD)}px`,
      );
      expect(stamped.railW, `--rail-w at ${width}×1080`).toBe("0px");
    }

    // And the handover: one pixel wider, the full rails take it and the tools
    // rail stands down rather than both claiming the same controls.
    expect(boot(1984, 1080).rails).toBe("on");
    expect(boot(1984, 1080).tools).toBe("off");
  });

  it("stamps nothing wider than the ceiling, however wide the window", () => {
    expect(boot(7680, 1440).railW).toBe(`${SIDE_RAIL_MAX}px`);
  });

  it("never stamps a rail narrower than the floor", () => {
    for (let width = 1200; width <= 3000; width += 7) {
      const rail = Number(boot(width, 1440).railW.replace("px", ""));
      expect(rail === 0 || rail >= SIDE_RAIL_MIN, `${width}×1440 stamped ${rail}px`).toBe(true);
    }
  });

  /**
   * The switch the negative fit guard drives. Without it there is no way to ask
   * one window for both layouts, and "the board never narrows because of the
   * rail" is a comparison between two viewports rather than between two
   * layouts of one.
   */
  it("forces both rails off for ?rails=off, at viewports that would have them", () => {
    expect(boot(3440, 1440).rails).toBe("on");
    expect(boot(3440, 1440, "?rails=off").rails).toBe("off");
    expect(boot(3440, 1440, "?capture=1&rails=off").railW).toBe("0px");
    // And the tools rail, which is the one 1920 has.
    expect(boot(1920, 1080).tools).toBe("on");
    expect(boot(1920, 1080, "?rails=off").tools).toBe("off");
    expect(boot(1920, 1080, "?rails=off").toolsW).toBe("0px");
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

describe("toolsRailWidth", () => {
  /**
   * The two rails never both claim the chrome. Where the full rails fit they
   * carry these same controls, so a tools rail there would be a second column
   * holding what the first one already holds.
   */
  it("stands down wherever the full rails fit", () => {
    for (const [width, height] of [
      [2560, 1440],
      [3440, 1440],
      [3840, 2160],
      [5120, 1440],
    ] as const) {
      expect(sideRailWidth({ width, height }, BOARD), `${width}×${height}`).toBeGreaterThan(0);
      expect(toolsRailWidth({ width, height }, BOARD), `${width}×${height}`).toBe(0);
    }
  });

  /**
   * The door this option was chosen to open, and the one it deliberately does
   * not: 1920 gets the overlay off the wall, 1440 and 1280 cannot.
   */
  it("reaches 1920 and does not reach 1440 or 1280", () => {
    expect(toolsRailWidth({ width: 1920, height: 1080 }, BOARD)).toBe(TOOLS_RAIL_MAX);
    expect(toolsRailWidth({ width: 1440, height: 900 }, BOARD)).toBe(0);
    expect(toolsRailWidth({ width: 1280, height: 800 }, BOARD)).toBe(0);
    expect(toolsRailWidth({ width: 390, height: 844 }, BOARD)).toBe(0);
  });

  it("never stands narrower than its floor or wider than its ceiling", () => {
    for (let width = 1000; width <= 3000; width += 3) {
      for (const height of [800, 900, 1080, 1200]) {
        const w = toolsRailWidth({ width, height }, BOARD);
        expect(
          w === 0 || (w >= TOOLS_RAIL_MIN && w <= TOOLS_RAIL_MAX),
          `${width}×${height} gave a ${w}px tools rail`,
        ).toBe(true);
      }
    }
  });

  /**
   * THE BOARD DOES NOT PAY FOR IT, and this is the arithmetic rather than the
   * hope: the rail is sized from the letterbox a board fitted UNDER THE SAME
   * CHROME already leaves, so the board is not refitted at all. Its scale with
   * the rail is its scale without one, exactly.
   */
  it("leaves the board the size it already was", () => {
    for (let width = 1400; width <= 2600; width += 11) {
      for (const height of [900, 1080, 1200]) {
        const rail = toolsRailWidth({ width, height }, BOARD);
        if (rail === 0) continue;

        const freeH = height - BAR_TOP_PX - TAPE_H_PX - 2 * BOARD_INSET;
        const without = Math.min((width - 2 * BOARD_INSET) / BOARD_WIDTH, freeH / BOARD_HEIGHT);
        const withRail = Math.min(
          (width - 2 * rail - 2 * BOARD_INSET) / BOARD_WIDTH,
          freeH / BOARD_HEIGHT,
        );
        expect(
          withRail,
          `the board at ${width}×${height} fits at ${withRail} with a ${rail}px tools rail and ${without} without`,
        ).toBeCloseTo(without, 10);
      }
    }
  });
});
