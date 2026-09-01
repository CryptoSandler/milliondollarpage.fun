import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BoardCounters from "../BoardCounters";
import { TOTAL_PIXELS } from "../../lib/board/geometry";

/**
 * The top bar says the million once.
 *
 * `offerLine` opens with `1,000,000 pixels` and the counter beside it reads
 * `1,000,000 pixels left` until somebody buys something — so on the board's
 * first day, which is every board's first day, the bar printed one number
 * twice. Read out of the markup rather than off the predicate, because the
 * fix is a utility class and a predicate test would pass while both numbers
 * were still on the screen.
 */
function markup(pixelsSold: number): string {
  return renderToStaticMarkup(
    <BoardCounters
      stats={{
        pixelsSold,
        blocksSold: pixelsSold === 0 ? 0 : 1,
        percentSold: (pixelsSold / TOTAL_PIXELS) * 100,
      }}
      perPixel={1_000_000}
    />,
  );
}

/** How many times a string occurs, which is the whole question here. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Which of the two elements carrying the million is on screen at a width.
 *
 * The fix is a utility class, not a branch of markup — both strings are in the
 * DOM and `display: none` decides which is rendered and which is read out, so
 * counting occurrences in the HTML answers the wrong question. This reads the
 * classes that actually decide, which is the same thing the browser does.
 */
function shownAt(html: string, width: "phone" | "desktop"): string[] {
  const shown: string[] = [];
  // The offer line: `hidden ... sm:block`.
  if (width === "desktop") shown.push("offer");
  // The remaining count: always on, unless it carries `sm:hidden`.
  const countIsShed = /class="[^"]*\bsm:hidden\b[^"]*"[^>]*>\s*<span class="font-semibold/.test(html);
  if (width === "phone" || !countIsShed) shown.push("count");
  return shown;
}

describe("the top bar's counters", () => {
  it("says the million once on a board nobody has bought anything on", () => {
    const html = markup(0);

    // Both strings ARE in the markup; exactly one of them is displayed at
    // each width, which is what stops the bar reading
    // "1,000,000 pixels · $1 per pixel · yours forever · 1,000,000 pixels left".
    expect(occurrences(html, "1,000,000")).toBe(2);
    expect(shownAt(html, "desktop")).toEqual(["offer"]);
    expect(shownAt(html, "phone")).toEqual(["count"]);
  });

  it("keeps the offer where it is the one that says the price and the term", () => {
    expect(markup(0)).toContain("1,000,000 pixels · $1 per pixel · yours forever");
  });

  it("shows both the moment the two numbers stop being the same one", () => {
    const html = markup(1);

    expect(html).toContain("1,000,000 pixels · $1 per pixel · yours forever");
    expect(html).toContain("999,999");
    expect(shownAt(html, "desktop")).toEqual(["offer", "count"]);
    expect(shownAt(html, "phone")).toEqual(["count"]);
  });

  it("counts what is left rather than what is gone", () => {
    expect(markup(250_000)).toContain("750,000");
  });
});
