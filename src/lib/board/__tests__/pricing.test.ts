import { describe, expect, it } from "vitest";
import { TOTAL_PIXELS } from "../geometry";
import {
  formatPercentSold,
  formatUsdc,
  offerLine,
  pixelCount,
  totalBaseUnits,
  unitOfSale,
  USDC_DECIMALS,
} from "../pricing";

describe("totalBaseUnits", () => {
  it("multiplies in base units, never in dollars", () => {
    expect(USDC_DECIMALS).toBe(6);
    expect(totalBaseUnits(100, 1_000_000)).toBe(100_000_000);
  });

  it("costs nothing for nothing", () => {
    expect(totalBaseUnits(0, 1_000_000)).toBe(0);
  });

  it("handles a price that is not a whole dollar", () => {
    expect(totalBaseUnits(400, 2_500_000)).toBe(1_000_000_000);
  });
});

describe("formatUsdc", () => {
  it("drops the decimals on a whole number of dollars", () => {
    expect(formatUsdc(100_000_000)).toBe("$100");
  });

  it("groups thousands", () => {
    expect(formatUsdc(10_000_000_000)).toBe("$10,000");
  });

  it("shows cents when there are any", () => {
    expect(formatUsdc(1_250_000)).toBe("$1.25");
  });

  it("does not round a fraction of a cent away silently", () => {
    expect(formatUsdc(1_234_567)).toBe("$1.234567");
  });

  it("formats zero", () => {
    expect(formatUsdc(0)).toBe("$0");
  });
});

describe("formatPercentSold", () => {
  it("rounds to two decimals", () => {
    expect(formatPercentSold(10.81)).toBe("10.81%");
  });

  it("reads a board with nothing sold as a plain zero, not 0.00%", () => {
    expect(formatPercentSold(0)).toBe("0%");
  });

  it("rounds a half-cent down", () => {
    expect(formatPercentSold(10.8149)).toBe("10.81%");
  });

  it("rounds a half-cent up", () => {
    expect(formatPercentSold(10.8151)).toBe("10.82%");
  });

  it("drops the decimals at a whole number", () => {
    expect(formatPercentSold(100)).toBe("100%");
  });

  it("shows a tiny nonzero value in full", () => {
    expect(formatPercentSold(0.01)).toBe("0.01%");
  });

  it("floors a nonzero value too small for two decimals, rather than lying that it is zero", () => {
    expect(formatPercentSold(0.001)).toBe("<0.01%");
  });
});

describe("the unit of sale", () => {
  const DOLLAR = 1_000_000;

  it("says what a pixel costs, because the pixel is what is for sale", () => {
    expect(unitOfSale(DOLLAR)).toBe("$1 a pixel · any rectangle, from one pixel up");
  });

  it("follows the per-pixel price rather than restating a dollar", () => {
    expect(unitOfSale(2_500_000)).toContain("$2.50 a pixel");
    expect(unitOfSale(500_000)).toContain("$0.50 a pixel");
  });

  it("offers the single pixel it used to refuse to price", () => {
    // This assertion is the inverse of the one it replaces. The old sentence
    // was forbidden from saying "per pixel" beside a control, because a
    // control that offered one pixel would have been offering something that
    // could not be bought. It can be bought now, so the sentence has to say
    // so — and the price of one pixel is the price of one purchase.
    for (const perPixel of [DOLLAR, 2_500_000, 500_000]) {
      expect(totalBaseUnits(1, perPixel)).toBe(perPixel);
      expect(unitOfSale(perPixel)).toContain("from one pixel up");
    }
  });

  it("no longer names a block, a grid or a minimum, because there is none", () => {
    for (const perPixel of [DOLLAR, 2_500_000, 500_000]) {
      const said = unitOfSale(perPixel).toLowerCase();
      expect(said).not.toContain("block");
      expect(said).not.toContain("10×10");
      expect(said).not.toContain("minimum");
    }
  });
});

describe("the wall's own line", () => {
  const DOLLAR = 1_000_000;

  /**
   * The one string in this product that is quoted exactly, because it is the
   * product. A word moved here is a different offer.
   */
  it("is the offer, the price and the term, and nothing else", () => {
    expect(offerLine(DOLLAR)).toBe("1,000,000 pixels · $1 per pixel · yours forever");
  });

  it("counts the board rather than restating a million somebody typed", () => {
    expect(offerLine(DOLLAR)).toContain(TOTAL_PIXELS.toLocaleString("en-US"));
  });

  it("follows the per-pixel price, so the wall cannot disagree with the checkout", () => {
    expect(offerLine(2_500_000)).toContain("$2.50 per pixel");
    expect(offerLine(500_000)).toContain("$0.50 per pixel");
  });

  /**
   * NOTHING PROMISES REVENUE. Not a million dollars, not a total, not an
   * ending — and not an auction for whatever is left at the end, which is a
   * settled decision recorded in DESIGN.md. A million pixels at a dollar is
   * what is on offer; what it adds up to is arithmetic somebody else can do.
   */
  it("promises no money, no total and no ending", () => {
    for (const perPixel of [DOLLAR, 2_500_000, 500_000]) {
      const said = offerLine(perPixel).toLowerCase();
      for (const forbidden of ["million dollar", "raise", "raising", "total", "auction", "sold out"]) {
        expect(said, `the wall's line must not say "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });
});

/**
 * The noun agrees with the number.
 *
 * The bug this replaces was visible on the smallest purchase this wall sells
 * and on the screen that asks for money: "Paying claims these 1 pixels for
 * good". A wall whose whole offer is "every pixel is for sale on its own"
 * cannot get the singular of "pixel" wrong.
 */
describe("pixelCount", () => {
  it("says one pixel in the singular", () => {
    expect(pixelCount(1)).toBe("1 pixel");
  });

  it("says everything else in the plural", () => {
    expect(pixelCount(2)).toBe("2 pixels");
    expect(pixelCount(100)).toBe("100 pixels");
  });

  it("says nothing at all in the plural, which is what English does", () => {
    expect(pixelCount(0)).toBe("0 pixels");
  });

  it("groups thousands the way every other number on this board is grouped", () => {
    expect(pixelCount(2_500)).toBe("2,500 pixels");
    expect(pixelCount(TOTAL_PIXELS)).toBe("1,000,000 pixels");
  });
});
