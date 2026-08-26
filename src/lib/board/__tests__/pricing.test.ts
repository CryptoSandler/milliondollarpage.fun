import { describe, expect, it } from "vitest";
import { formatPercentSold, formatUsdc, totalBaseUnits, USDC_DECIMALS } from "../pricing";

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
