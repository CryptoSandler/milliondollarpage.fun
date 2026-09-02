import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OnlineBanner, { shortCount } from "../OnlineBanner";

/**
 * The banner shows from one, and that was the decision worth pinning.
 *
 * The obvious implementation hides it until the number flatters, which turns a
 * count into a claim. This asserts the opposite: at one it renders, and it says
 * so plainly.
 */
describe("the online banner", () => {
  it("shows one person as one person", () => {
    const html = renderToStaticMarkup(<OnlineBanner online={1} />);

    expect(html).toContain(">1<");
    expect(html).toContain("online");
  });

  it("shows nothing only when there is nobody, which cannot happen while it is read", () => {
    expect(renderToStaticMarkup(<OnlineBanner online={0} />)).toBe("");
  });

  it("groups a crowd the way every other number on this board is grouped", () => {
    expect(renderToStaticMarkup(<OnlineBanner online={1_284} />)).toContain("1,284");
  });

  it("says how it was counted, where somebody can ask", () => {
    const html = renderToStaticMarkup(<OnlineBanner online={3} />);
    expect(html).toContain("Counted anonymously");
  });
});

/**
 * The cumulative half of the banner, shortened the way a reader reads it.
 *
 * A wall with 312 visits has a number worth printing exactly; one with 12,437
 * has a number nobody reads to the digit. The decimal is what makes the short
 * form look counted rather than rounded.
 */
describe("how a total is shortened", () => {
  it("prints small numbers exactly, and groups them", () => {
    expect(shortCount(0)).toBe("0");
    expect(shortCount(312)).toBe("312");
    expect(shortCount(999)).toBe("999");
    expect(shortCount(12)).toBe("12");
  });

  it("takes a decimal from a thousand up, and drops it past a hundred thousand", () => {
    expect(shortCount(1_000)).toBe("1.0k");
    expect(shortCount(1_240)).toBe("1.2k");
    expect(shortCount(12_437)).toBe("12.4k");
    expect(shortCount(99_900)).toBe("99.9k");
    expect(shortCount(124_000)).toBe("124k");
  });

  it("goes to millions rather than printing four figures of thousands", () => {
    expect(shortCount(1_400_000)).toBe("1.4m");
  });

  it("shows the total beside the count of who is here, and hides it at zero", () => {
    const withViews = renderToStaticMarkup(<OnlineBanner online={3} views={12_437} />);
    expect(withViews).toContain("12.4k");
    expect(withViews).toContain("views");

    // A counter reading "0 views" beside "1 online" is the page contradicting
    // itself in the same row.
    expect(renderToStaticMarkup(<OnlineBanner online={1} views={0} />)).not.toContain("views");
    expect(renderToStaticMarkup(<OnlineBanner online={1} />)).not.toContain("views");
  });
});
