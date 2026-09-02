import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PurchaseTape, { sinceLabel } from "../PurchaseTape";
import type { TapeRow } from "../../lib/board/tape";

const AS_OF = "2026-09-01T12:00:00.000Z";

function row(overrides: Partial<TapeRow> = {}): TapeRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    x: 120,
    y: 340,
    w: 50,
    h: 20,
    pixels: 1_000,
    totalBaseUnits: 1_000_000_000,
    signature: "5Kq2…7Rp1",
    paidAt: "2026-09-01T11:56:00.000Z",
    ...overrides,
  };
}

describe("sinceLabel", () => {
  it("calls the last few seconds 'just now' rather than counting them", () => {
    expect(sinceLabel(0)).toBe("just now");
    expect(sinceLabel(4_999)).toBe("just now");
  });

  /**
   * A server and a browser a second apart would otherwise produce a purchase
   * that settled in −1 seconds, which is the kind of thing a register cannot
   * print and stay a register.
   */
  it("refuses to count backwards when the two clocks disagree", () => {
    expect(sinceLabel(-30_000)).toBe("just now");
  });

  it("counts seconds, then minutes, then hours, then days", () => {
    expect(sinceLabel(12_000)).toBe("12s ago");
    expect(sinceLabel(59_000)).toBe("59s ago");
    expect(sinceLabel(60_000)).toBe("1m ago");
    expect(sinceLabel(59 * 60_000)).toBe("59m ago");
    expect(sinceLabel(60 * 60_000)).toBe("1h ago");
    expect(sinceLabel(23 * 60 * 60_000)).toBe("23h ago");
    expect(sinceLabel(24 * 60 * 60_000)).toBe("1d ago");
  });
});

describe("the settled-purchase rail", () => {
  it("renders the same ages the server did, from the moment the payload was built", () => {
    // 11:56 against an `asOf` of 12:00 is four minutes, and the first client
    // render has to agree with this one or hydration warns.
    expect(renderToStaticMarkup(<PurchaseTape rows={[row()]} asOf={AS_OF} />)).toContain("4m ago");
  });

  it("carries the size, the area, the coordinates, the amount and the proof", () => {
    const html = renderToStaticMarkup(<PurchaseTape rows={[row()]} asOf={AS_OF} />);

    expect(html).toContain("50 × 20");
    expect(html).toContain("1,000 pixels at (120, 340)");
    expect(html).toContain("$1,000");
    expect(html).toContain("5Kq2…7Rp1");
  });

  it("says one pixel in the singular, like everything else that counts pixels", () => {
    const html = renderToStaticMarkup(
      <PurchaseTape
        rows={[row({ w: 1, h: 1, pixels: 1, totalBaseUnits: 1_000_000 })]}
        asOf={AS_OF}
      />,
    );

    expect(html).toContain("1 pixel at (120, 340)");
    expect(html).not.toContain("1 pixels");
  });

  /**
   * DESIGN.md's voice section: "Never say who holds a rectangle. When, yes.
   * Who, never." The rail is the surface most likely to be asked for a name,
   * so the rule is asserted here rather than assumed from the row's type.
   */
  it("names nobody", () => {
    const html = renderToStaticMarkup(
      <PurchaseTape rows={[row(), row({ id: "b", x: 0, y: 0 })]} asOf={AS_OF} />,
    );

    expect(html.toLowerCase()).not.toContain("wallet");
    expect(html.toLowerCase()).not.toContain("buyer");
    expect(html.toLowerCase()).not.toContain("owner");
    expect(html).not.toContain("by ");
  });

  it("says a sale is unsigned rather than leaving a blank where a proof goes", () => {
    const html = renderToStaticMarkup(
      <PurchaseTape rows={[row({ signature: null })]} asOf={AS_OF} />,
    );

    expect(html).toContain("unsigned");
  });

  it("says an empty rail is empty in one short line, and nothing more", () => {
    const html = renderToStaticMarkup(<PurchaseTape rows={[]} asOf={AS_OF} />);

    /*
      THREE WORDS. It was two sentences — the second explaining how the register
      works — which is a paragraph in a 26px strip and a five-line wrapped block
      in a column, which is what the owner saw at 2495. What the empty state has
      to say is that the register is empty; how it works is a thing to read once
      and not a thing to read while waiting.
    */
    expect(html).toContain("Nothing sold yet");
    expect(html).not.toContain("Every purchase that does appears here");
    // The rail's second line is still its tooltip, which is where a sentence
    // that long belongs and where it has room.
    expect(html).toContain("The first one lands here");
  });

  it("is reachable and named, because it is a region that scrolls", () => {
    const html = renderToStaticMarkup(<PurchaseTape rows={[row()]} asOf={AS_OF} />);

    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="The most recent settled purchases, newest first"');
  });
});
