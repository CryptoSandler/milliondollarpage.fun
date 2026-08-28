import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import robots from "../robots";

/**
 * All three noindex locks, asserted together.
 *
 * WHY ONE TEST FOR THREE FILES. Each lock covers what the others miss —
 * robots.txt is advisory and pre-fetch, the meta tag governs a page already
 * fetched, the header covers responses with no `<head>`. Lifting the noindex is
 * meant to be a deliberate three-file change; the failure this guards is
 * lifting ONE of them and shipping a site that looks protected and is indexed.
 * A test per file would pass two-thirds of the way through that mistake.
 */
describe("the site is closed to crawlers until launch", () => {
  it("disallows everything in robots.txt", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("carries noindex in the root layout's metadata", () => {
    // Read as source, not imported. `layout.tsx` calls `next/font`'s loaders at
    // module scope, and those are build-time transforms that throw under a
    // plain node test runner. Asserting the source is weaker than asserting the
    // object, and it is what can actually be asserted without dragging the font
    // pipeline into this file — the string it looks for is exact.
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toMatch(/robots: \{ index: false, follow: false \}/);
  });

  it("sets X-Robots-Tag on every path", () => {
    // Read as source rather than imported: next.config.ts is ESM config Next
    // loads itself, and importing it here would drag the whole config loader
    // into a unit test to check one string.
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toMatch(/"X-Robots-Tag", value: "noindex, nofollow"/);
    expect(config).toMatch(/source: "\/:path\*"/);
  });
});
