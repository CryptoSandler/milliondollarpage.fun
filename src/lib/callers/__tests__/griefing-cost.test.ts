import { describe, expect, it } from "vitest";
import { BOARD_HEIGHT, BOARD_WIDTH, TOTAL_PIXELS } from "../../board/geometry";
import { holdMinutes } from "../../board/hold-clock";
import { RESERVATION_LIMITS } from "../limits";

/**
 * What it costs to hold this board hostage, computed from the limits that are
 * actually enforced.
 *
 * WHY THIS IS A TEST AND NOT A PARAGRAPH. The cost of griefing was measured
 * once before, in `.superpowers/sdd/batch-4/content-report.md` §6, and written
 * down as prose: 67 IP addresses for 100% of the remaining inventory at 100
 * sales. A number in a report is a number that rots the first time somebody
 * tunes a constant, and nobody finds out. This file recomputes it from
 * `RESERVATION_LIMITS` and `holdMinutes` on every run and fails if the answer
 * drifts below a floor.
 *
 * THE METHOD IS THE EARLIER ONE, UNCHANGED, so the two numbers are comparable
 * rather than two different calculations:
 *
 *   - A caller is one IP address (`hashIp` over the normalised address).
 *   - A hold is free. Nothing is signed, deposited or forfeited.
 *   - With N sales on the board the free region is no longer one rectangle. A
 *     region punctured by N rectangular holes is covered by at most 2N+1
 *     axis-aligned rectangles (vertical slab decomposition), so an attacker
 *     needs that many holds to cover all of it.
 *   - Each caller supplies `liveHoldsPerCaller` rectangles at once.
 *
 * WHAT THIS BATCH ADDED TO THE METHOD. Before, that was the whole calculation:
 * a rectangle could be any size, so rectangles were the only thing being
 * rationed. Now a caller is also rationed by AREA — instantaneously by
 * `heldPixelsPerCaller`, and over time by `pixelMinutesPerWindow`. So the
 * attacker needs enough callers to satisfy BOTH bounds, and the second one now
 * dominates. Pixel-minutes divided by the window is pixels held continuously,
 * which is what makes the sustained figure the honest one: a caller who bursts
 * to the ceiling has to go quiet afterwards, and the rectangle reopens.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: read the database. This is arithmetic over
 * the constants, and the constants being ENFORCED is a separate question,
 * guarded against real rows in `./limits.test.ts` and
 * `../../board/__tests__/reserve.test.ts`.
 */

/** Pixels one caller can keep off the board indefinitely, on average. */
const sustainedPixelsPerCaller =
  RESERVATION_LIMITS.pixelMinutesPerWindow / RESERVATION_LIMITS.windowMinutes;

/** Pixels one caller can have off the board at a single instant. */
const burstPixelsPerCaller = RESERVATION_LIMITS.heldPixelsPerCaller;

/**
 * Callers needed to keep a region of `pixels` unbuyable, continuously, when N
 * sales already puncture it.
 *
 * The larger of the two bounds, because an attacker short on either one is an
 * attacker who cannot cover the region.
 */
function callersToHold(pixels: number, sales: number): number {
  const rectangleBound = Math.ceil((2 * sales + 1) / RESERVATION_LIMITS.liveHoldsPerCaller);
  const areaBound = Math.ceil(pixels / sustainedPixelsPerCaller);
  return Math.max(rectangleBound, areaBound);
}

/**
 * The comparison case, spelled out so the before and after are the same
 * question: 100 sales, each a modest 10 x 10, so essentially the whole wall is
 * still on sale — which is the situation the 67 was quoted for.
 */
const SALES = 100;
const SALE_PIXELS = 100;
const FREE_PIXELS = TOTAL_PIXELS - SALES * SALE_PIXELS;

/** The most desirable region on any board of this shape, and its list price. */
const CENTRE = { w: 400, h: 300 };
const CENTRE_PIXELS = CENTRE.w * CENTRE.h;

describe("the cost of holding this board hostage", () => {
  it("no longer lets one caller take the whole wall", () => {
    // The hole this batch closed, stated as arithmetic: a 1250 x 800 hold was
    // valid, and one caller could make it.
    expect(BOARD_WIDTH * BOARD_HEIGHT).toBe(TOTAL_PIXELS);
    expect(burstPixelsPerCaller).toBeLessThan(TOTAL_PIXELS);
    expect(
      burstPixelsPerCaller,
      "one visitor must not be able to hold more than a hundredth of the wall at once",
    ).toBeLessThanOrEqual(TOTAL_PIXELS / 100);
    expect(
      sustainedPixelsPerCaller,
      "and must not be able to keep that much off the board continuously",
    ).toBeLessThanOrEqual(TOTAL_PIXELS / 200);
  });

  it("costs at least 150 callers to hold every free pixel at 100 sales, against 67 before", () => {
    // 67 is the measured before-figure from batch 4, reproduced here by the
    // half of the method that has not changed — the rectangle bound, which is
    // what the old limits rationed and all they rationed.
    const before = Math.ceil((2 * SALES + 1) / RESERVATION_LIMITS.liveHoldsPerCaller);
    expect(before, "the batch-4 figure, recomputed").toBe(67);

    const after = callersToHold(FREE_PIXELS, SALES);
    expect(after).toBeGreaterThan(before);
    // The floor. 150 is chosen rather than the exact answer so that tuning a
    // constant a little does not fail this test for no reason, and tuning it
    // back towards the hole does. It is above twice the old figure, and above
    // the number of addresses a single cheap VPS account hands out — the point
    // at which the attack stops being a script and starts being a purchase
    // order.
    expect(
      after,
      "holding the whole free board must cost real address rotation",
    ).toBeGreaterThanOrEqual(150);
  });

  it("costs at least 20 callers to immobilise the centre, which used to cost one", () => {
    // 400 x 300 in the middle of the wall is $120,000 of inventory at list. One
    // caller with one hold covered it indefinitely, for nothing.
    //
    // Nought sales rather than SALES, because this is the same targeted case
    // batch 4 priced: an unsold centre, which is one rectangle and therefore
    // needs no decomposition at all. The whole cost is the area bound, which
    // is the bound that did not exist.
    expect(CENTRE_PIXELS).toBe(120_000);
    expect(callersToHold(CENTRE_PIXELS, 0)).toBeGreaterThanOrEqual(20);
  });

  it("reopens a hostage rectangle within ten minutes, however big it is", () => {
    // The duration half. A caller may burst to the ceiling, but the pixels go
    // back on the board quickly, so a would-be buyer's wait is bounded even
    // while an attacker is spending everything they have.
    expect(holdMinutes(burstPixelsPerCaller)).toBeLessThanOrEqual(10);
  });

  it("still lets a real buyer take a 100 by 100 rectangle and finish paying for it", () => {
    // The floors in the other direction, and they matter as much as the ones
    // above: a limit tightened until a $10,000 purchase cannot be made is not
    // a mitigation, it is the bug with better manners.
    expect(
      RESERVATION_LIMITS.heldPixelsPerCaller,
      "a 100 by 100 rectangle must still be holdable in one go",
    ).toBeGreaterThanOrEqual(100 * 100);
    expect(
      holdMinutes(100 * 100),
      "and there must be time to upload a picture and send a payment",
    ).toBeGreaterThanOrEqual(10);
    expect(
      RESERVATION_LIMITS.pixelMinutesPerWindow,
      "and an abandoned attempt at one must not lock the buyer out for the hour",
    ).toBeGreaterThanOrEqual(2 * 100 * 100 * holdMinutes(100 * 100));
  });

  it("keeps an ordinary purchase on the full clock", () => {
    // Nothing about this fix may shorten the hold on the rectangles almost
    // everybody actually buys.
    expect(holdMinutes(1)).toBe(30);
    expect(holdMinutes(50 * 50)).toBe(30);
  });
});
