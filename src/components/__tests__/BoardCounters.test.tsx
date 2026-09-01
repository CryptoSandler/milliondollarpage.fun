import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BoardCounters from "../BoardCounters";
import { TOTAL_PIXELS } from "../../lib/board/geometry";

/**
 * The count of what is left, in a header that is now one 34px line.
 *
 * WHAT THIS USED TO TEST is gone with the thing it tested. The offer line
 * opened with `1,000,000 pixels` and the counter beside it read
 * `1,000,000 pixels left`, so on an untouched board the bar said one number
 * twice — and the fix was to shed the count above the breakpoint where the
 * offer line was on screen to replace it.
 *
 * The offer line has left the bar entirely under the layout norm: the header
 * carries the wordmark, the count and the theme toggle, and the offer is the
 * wordmark's tooltip and the first paragraph of `/faq`. With nothing beside it
 * to duplicate, the count is simply always there, which is what the suppression
 * was working around rather than something it earned.
 */
function markup(pixelsSold: number): string {
  return renderToStaticMarkup(
    <BoardCounters
      stats={{
        pixelsSold,
        blocksSold: pixelsSold === 0 ? 0 : 1,
        percentSold: (pixelsSold / TOTAL_PIXELS) * 100,
      }}
    />,
  );
}

/** How many times a string occurs, which is the whole question here. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("the top bar's counters", () => {
  it("prints the million once, because nothing beside it says it any more", () => {
    const html = markup(0);

    expect(occurrences(html, "1,000,000")).toBe(1);
    expect(html).toContain("pixels left");
  });

  it("is always on screen, at every width", () => {
    // The suppression this replaces was the only thing that ever hid it, and
    // it existed for a neighbour that is gone.
    expect(markup(0)).not.toContain("sm:hidden");
    expect(markup(1)).not.toContain("sm:hidden");
  });

  it("counts what is left rather than what is gone", () => {
    expect(markup(250_000)).toContain("750,000");
  });
});
