import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OnlineBanner from "../OnlineBanner";

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
