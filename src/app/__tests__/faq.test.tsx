import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FaqPage from "../faq/page";

/**
 * The two answers on this page that are promises about the future, and
 * therefore the two most likely to drift.
 *
 * Both are read out of the rendered markup rather than off the source, because
 * what matters is the sentence somebody actually reads before they spend money.
 */
const html = renderToStaticMarkup(<FaqPage />);

describe("what the FAQ says about transfer", () => {
  /**
   * `DECISIONS.md`: transfer is "not built, not promised, and not forbidden",
   * and the words "non-transferable" must not appear in copy. The arrival round
   * adds the reason it matters commercially: a sales conversation is exactly
   * where an open door gets closed by accident, in either direction.
   */
  it("says the question is undecided, in as many words", () => {
    expect(html).toContain("We have not decided, and we are not going to pretend either way");
    expect(html).toContain("you will not find us promising it");
    expect(html).toContain("you will not find us ruling it out");
  });

  it("never says transfer will not exist", () => {
    expect(html.toLowerCase()).not.toContain("non-transferable");
    expect(html.toLowerCase()).not.toContain("cannot be transferred");
    expect(html.toLowerCase()).not.toContain("never be transferred");
    expect(html.toLowerCase()).not.toContain("will never exist");
  });

  it("never promises it either", () => {
    expect(html.toLowerCase()).not.toContain("will be able to sell");
    expect(html.toLowerCase()).not.toContain("transfer is coming");
    expect(html.toLowerCase()).not.toContain("resell");
  });

  it("still tells somebody not to buy for that reason", () => {
    expect(html).toContain("If being able to move it later is the reason you are buying");
  });
});

describe("the launch cohort", () => {
  /**
   * The arrival round's verdict was PROCEED WITH DISCLOSURE: the seeding is
   * permanently discoverable from the settled register and the treasury
   * address, so the only version of it that fails badly is the silent one.
   */
  it("says the owner's projects bought rectangles, and on what terms", () => {
    expect(html).toContain("Did the owner buy pixels?");
    expect(html).toContain("at a dollar a pixel");
    expect(html).toContain("the same price on the same terms as everybody else");
  });

  it("does not dress it up as a milestone or mark it on the board", () => {
    expect(html).toContain("They are not marked on the board");
    // No "backed by", no "trusted by", no count presented as traction.
    expect(html.toLowerCase()).not.toContain("backed by");
    expect(html.toLowerCase()).not.toContain("trusted by");
  });

  it("says why it is disclosed rather than left to be found", () => {
    expect(html).toContain("should say so rather than let you find out");
  });
});
