import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPECTED_MIGRATION } from "../../../lib/schema-version";
import { GET } from "../status/route";

/**
 * The status route, checked for what it says AND for what it must not.
 *
 * The second half is the reason this file exists. A status endpoint is the
 * classic place a deployment publishes its own configuration by accident, and
 * the two values within reach here are a treasury address and a node URL with a
 * provider key in it. So every case below reads the WHOLE body and requires
 * neither to be anywhere in it, rather than checking the fields it expected.
 */
const TREASURY = "0x1111111111111111111111111111111111111111";
const NODE = "https://robinhood-mainnet.example/A-PROVIDER-KEY";

beforeEach(() => {
  vi.stubEnv("ROBINHOOD_TREASURY_ADDRESS", "");
  vi.stubEnv("ROBINHOOD_PAYMENTS", "");
  vi.stubEnv("ROBINHOOD_RPC_URL", NODE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function body(): Promise<{ raw: string; parsed: Record<string, never> }> {
  const response = GET();
  expect(response.headers.get("cache-control")).toBe("no-store");
  const raw = await response.text();
  return { raw, parsed: JSON.parse(raw) };
}

describe("GET /api/status", () => {
  it("says the Robinhood rail is off and has no treasury, which is today", async () => {
    const { parsed } = await body();
    expect(parsed).toMatchObject({
      rails: {
        robinhood: { enabled: false, treasury: false, state: "off by flag, no treasury" },
        solana: { enabled: false, state: "off, not built" },
      },
      schema: EXPECTED_MIGRATION,
    });
  });

  it("distinguishes off-with-a-treasury from off-without-one", async () => {
    vi.stubEnv("ROBINHOOD_TREASURY_ADDRESS", TREASURY);
    const { parsed } = await body();
    expect(parsed).toMatchObject({
      rails: { robinhood: { enabled: false, treasury: true, state: "off by flag" } },
    });
  });

  it("says the rail is on when it is on", async () => {
    vi.stubEnv("ROBINHOOD_TREASURY_ADDRESS", TREASURY);
    vi.stubEnv("ROBINHOOD_PAYMENTS", "true");
    const { parsed } = await body();
    expect(parsed).toMatchObject({
      rails: { robinhood: { enabled: true, treasury: true, state: "on" } },
    });
  });

  /**
   * THE LEAK TEST, over every configuration this route can be in — because a
   * value that only appears in the "on" branch is exactly the one a test of the
   * "off" branch would miss.
   */
  it("never prints the treasury address or the node's URL, in any state", async () => {
    for (const [flag, address] of [
      ["", ""],
      ["", TREASURY],
      ["true", TREASURY],
    ]) {
      vi.stubEnv("ROBINHOOD_PAYMENTS", flag);
      vi.stubEnv("ROBINHOOD_TREASURY_ADDRESS", address);
      const { raw } = await body();
      expect(raw, `flag=${flag}`).not.toContain(TREASURY);
      expect(raw, `flag=${flag}`).not.toContain("A-PROVIDER-KEY");
      expect(raw, `flag=${flag}`).not.toContain("robinhood-mainnet.example");
    }
  });
});
