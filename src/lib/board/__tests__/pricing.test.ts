import { describe, expect, it } from "vitest";
import {
  blockPriceBaseUnits,
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

  it("prices one block at a hundred dollars when a pixel is a dollar", () => {
    expect(blockPriceBaseUnits(DOLLAR)).toBe(100_000_000);
    expect(formatUsdc(blockPriceBaseUnits(DOLLAR))).toBe("$100");
  });

  it("follows the per-pixel price rather than restating a hundred", () => {
    expect(blockPriceBaseUnits(2_500_000)).toBe(250_000_000);
    expect(blockPriceBaseUnits(0)).toBe(0);
  });

  it("says the unit plainly, and says blocks rather than pixels", () => {
    expect(unitOfSale(DOLLAR)).toBe("Sold in 10×10 blocks · $100 each");
  });

  it("never offers a single pixel at a price", () => {
    // The one sentence the header and the panel both carry. "$1 per pixel"
    // beside a control reads as an offer, and a single pixel is not for sale.
    for (const perPixel of [DOLLAR, 2_500_000, 500_000]) {
      expect(unitOfSale(perPixel)).not.toContain("per pixel");
      expect(unitOfSale(perPixel)).toContain("10×10 blocks");
    }
  });
});
