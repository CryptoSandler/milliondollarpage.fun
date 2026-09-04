import { describe, expect, it } from "vitest";
import { notesFor, pictureBox } from "../ExactPreview";

/**
 * The numbers the preview prints, against the measurements they came from.
 *
 * Every threshold in `notesFor` is out of `docs/imagenes.md`, which put three
 * real flags through three real rectangles on the preview branch. A sentence
 * that drifted from the measurement behind it would be worse than no sentence
 * — it would be a warning nobody can check.
 */

const flag = { width: 480, height: 320 }; // 3:2, what a flag comes out as at 120×90

describe("how much of the picture reaches the wall", () => {
  it("fills the rectangle when the fit is cover", () => {
    expect(pictureBox(flag, { x: 0, y: 0, w: 31, h: 169 }, "cover")).toEqual({ width: 31, height: 169 });
  });

  /*
    THE MEASURED CASE. `docs/imagenes.md`: a 31×169 column carries 620 picture
    pixels out of 5,239 — 88% of what was bought is bars. The arithmetic here is
    what produced that number, so it is the number this asserts.
  */
  it("leaves most of an awkward rectangle empty when the fit is contain", () => {
    const box = pictureBox(flag, { x: 0, y: 0, w: 31, h: 169 }, "contain");
    expect(box).toEqual({ width: 31, height: 21 });
    expect(box.width * box.height).toBe(651);
    expect(Math.round((1 - 651 / (31 * 169)) * 100)).toBe(88);
  });

  it("and almost none of a rectangle the same shape as the picture", () => {
    const box = pictureBox(flag, { x: 0, y: 0, w: 120, h: 80 }, "contain");
    expect(box).toEqual({ width: 120, height: 80 });
  });

  it("never rounds a picture away to nothing", () => {
    // A 1×1 purchase is the smallest thing this wall sells and it still has a
    // picture: one pixel of one.
    expect(pictureBox(flag, { x: 0, y: 0, w: 1, h: 1 }, "contain")).toEqual({ width: 1, height: 1 });
  });
});

describe("what it says about it", () => {
  const rect = (w: number, h: number) => ({ x: 0, y: 0, w, h });

  it("always says the size first, in pixels a person can check", () => {
    const [first] = notesFor(flag, rect(120, 90), "cover");
    expect(first.tone).toBe("plain");
    expect(first.text).toContain("120 by 90");
    expect(first.text).toContain("10,800");
  });

  /*
    200 PICTURE PIXELS. Measured: at 187 a flag still says blue-white-blue and
    nothing else; at 60 two flags with the same stripes are the same picture.
  */
  it("warns below two hundred picture pixels, and not above", () => {
    const small = notesFor(flag, rect(6, 40), "contain");
    expect(small.some((n) => n.text.includes("only a colour or a bold shape"))).toBe(true);

    const big = notesFor(flag, rect(120, 90), "cover");
    expect(big.some((n) => n.text.includes("only a colour or a bold shape"))).toBe(false);
  });

  it("warns that words will not survive a short edge under forty", () => {
    expect(notesFor(flag, rect(17, 14), "cover").some((n) => n.text.includes("Words will not be readable"))).toBe(true);
    expect(notesFor(flag, rect(200, 140), "cover").some((n) => n.text.includes("Words will not be readable"))).toBe(false);
  });

  /*
    THE ONE THAT COSTS THE MOST AND IS THE EASIEST TO FIX, so it names the
    percentage and the crop rather than saying "consider cover".
  */
  it("names the share being wasted, and the shape to crop to", () => {
    const notes = notesFor(flag, rect(31, 169), "contain");
    const bars = notes.find((n) => n.text.includes("different shapes"));
    expect(bars).toBeDefined();
    expect(bars!.text).toContain("88%");
    expect(bars!.text).toContain("31:169");
  });

  it("says nothing about bars when the buyer has already chosen to crop", () => {
    expect(notesFor(flag, rect(31, 169), "cover").some((n) => n.text.includes("different shapes"))).toBe(false);
  });

  it("says nothing about bars when the shapes are close enough", () => {
    // Under two to one is not worth a sentence: the bars are a thin edge.
    expect(notesFor(flag, rect(120, 100), "contain").some((n) => n.text.includes("different shapes"))).toBe(false);
  });

  /**
   * NONE OF THEM REFUSES ANYTHING, and that is a property worth pinning: the
   * buyer chose the rectangle, and every sentence here is a measurement offered
   * before payment rather than a gate in front of it.
   */
  it("never tells anybody they cannot buy what they picked", () => {
    for (const r of [rect(1, 1), rect(6, 40), rect(173, 16), rect(1250, 800)]) {
      for (const fit of ["contain", "cover"] as const) {
        const text = notesFor(flag, r, fit).map((n) => n.text).join(" ").toLowerCase();
        expect(text).not.toContain("cannot buy");
        expect(text).not.toContain("too small");
        expect(text).not.toContain("not allowed");
      }
    }
  });
});
