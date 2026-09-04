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
  it("prints the million once, as the denominator and not as the headline", () => {
    const html = markup(0);

    // Once: `0 pixels sold of 1,000,000`. On an untouched board the old
    // headline WAS the million — `1,000,000 pixels left` — which is the same
    // sentence as "nothing has happened here". It is the denominator now.
    expect(occurrences(html, "1,000,000")).toBe(1);
    expect(html).toContain("pixels sold");
    expect(html).toContain("of 1,000,000");
  });

  it("is always on screen, at every width", () => {
    // The suppression this replaces was the only thing that ever hid it, and
    // it existed for a neighbour that is gone.
    expect(markup(0)).not.toContain("sm:hidden");
    expect(markup(1)).not.toContain("sm:hidden");
  });

  /*
    REVERSED 2026-09-03, and the old name of this test is kept in the comment so
    the change is findable: it was "counts what is left rather than what is
    gone", and it enforced DESIGN.md's rule that the headline counts pixels
    REMAINING — a nearly-full board tells a buyer how much chance they have
    left. The owner reversed it: a wall on its first day says `1,000,000 pixels
    left`, which is the same sentence as `nothing has happened here`, and the
    number that makes somebody buy is the one that moves.
  */
  it("counts what is gone, with the total beside it", () => {
    expect(markup(250_000)).toContain("250,000");
    expect(markup(250_000)).toContain("of 1,000,000");
    // And not the remainder, which is the number this used to print.
    expect(markup(250_000)).not.toContain("750,000");
  });
});
