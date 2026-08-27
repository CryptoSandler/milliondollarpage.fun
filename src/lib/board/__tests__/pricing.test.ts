import { describe, expect, it } from "vitest";
import {
  formatPercentSold,
  formatUsdc,
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
