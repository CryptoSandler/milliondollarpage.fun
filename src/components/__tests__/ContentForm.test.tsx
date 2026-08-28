import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FitChoice } from "../ContentForm";

/**
 * The fit control, read out of the markup a buyer is actually handed.
 *
 * WHY IT RENDERS RATHER THAN ASSERTING ON THE PREDICATE: `canHonourContain`
 * has its own tests in `src/lib/board/__tests__/image-fit.test.ts`, and they
 * would all pass while the radio it is supposed to remove was still on the
 * screen and still submittable. What is checked here is the control, not the
 * arithmetic behind it.
 *
 * `react-dom/server` and no more: this suite runs in Vitest's `node`
 * environment (see `vitest.config.mts`) with no DOM and no testing library,
 * and `FitChoice` is a pure function of its props precisely so both of its
 * states can be rendered by handing it different ones.
 */
describe("FitChoice", () => {
  it("offers both fits, unchanged, where the rectangle can draw the bars", () => {
    const html = renderToStaticMarkup(
      <FitChoice rect={{ w: 200, h: 50 }} fit="contain" canFitInside onChange={() => {}} />,
    );

    // Two radios, both labels, and the same words as before: above the
    // threshold nothing about this control changes.
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain("Fit inside");
    expect(html).toContain("may leave space");
    expect(html).toContain("Fill completely");
    expect(html).toContain("may crop edges");
  });

  it("offers no choice at all where they cannot, and says which fit it is", () => {
    const html = renderToStaticMarkup(
      <FitChoice rect={{ w: 1, h: 1 }} fit="cover" canFitInside={false} onChange={() => {}} />,
    );

    // Nothing to press: the option that cannot be honoured is not offered at
    // all, rather than offered and then refused.
    expect(html).not.toContain("radio");
    expect(html).not.toContain("Fit inside");

    // And what will be on the wall is said in plain words, with the
    // rectangle's own size in them.
    expect(html).toContain("Fills the rectangle completely.");
    expect(html).toContain("1 × 1");
  });
});
