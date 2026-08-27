import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClientTakedown } from "../../lib/board/admin-client";
import TakedownList, { type Pending, type PurgeDraft } from "../TakedownList";

/**
 * Guards on the console's markup, read out of the markup.
 *
 * WHY IT RENDERS RATHER THAN ASSERTING ON A HELPER: every rule this file
 * pins — a button that cannot be pressed, a region that carries the outcome,
 * a purged row that offers nothing — is a fact about the HTML an operator
 * receives. A test on the function behind it would pass while the attribute
 * that enforces it was missing, which is the failure this exists to catch.
 *
 * `react-dom/server` and no more: this suite runs in Vitest's `node`
 * environment (see `vitest.config.mts`) with no DOM and no testing library,
 * and `TakedownList` is a pure function of its props precisely so its states
 * can be rendered by handing it different ones.
 *
 * NOTHING HERE RECONSTRUCTS WHAT IT IS CHECKING. The confirmation phrase is
 * read back out of the field that offers it and fed in as the operator would
 * type it; no test writes `PURGE ` anywhere.
 */

const HIDDEN: ClientTakedown = {
  id: "11111111-1111-1111-1111-111111111111",
  x: 100,
  y: 200,
  w: 40,
  h: 25,
  hiddenAt: "2026-08-20T10:00:00.000Z",
  takedownReason: "reported, under review",
  purgedAt: null,
};

const PURGED: ClientTakedown = {
  id: "22222222-2222-2222-2222-222222222222",
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  hiddenAt: "2026-08-19T09:00:00.000Z",
  takedownReason: "legal order",
  purgedAt: "2026-08-19T09:05:00.000Z",
};

function render(overrides: {
  rows?: ClientTakedown[];
  pending?: Pending;
  purge?: PurgeDraft | null;
  done?: string;
  failed?: string;
}): string {
  return renderToStaticMarkup(
    <TakedownList
      label="admin"
      rows={overrides.rows ?? [HIDDEN]}
      pending={overrides.pending ?? null}
      purge={overrides.purge ?? null}
      done={overrides.done ?? ""}
      failed={overrides.failed ?? ""}
      onReload={() => {}}
      onSignOut={() => {}}
      onUnhide={() => {}}
      onPurgeDraft={() => {}}
      onPurge={() => {}}
    />,
  );
}

/** Every `<button …>` opening tag in the markup, attributes included. */
function buttons(markup: string): string[] {
  return markup.match(/<button[^>]*>/g) ?? [];
}

/** Every `<input …>` tag. */
function inputs(markup: string): string[] {
  return markup.match(/<input[^>]*>/g) ?? [];
}

/** The one button that submits the purge form. */
function purgeSubmit(markup: string): string {
  const tag = buttons(markup).find((button) => button.includes('type="submit"'));
  expect(tag, "the purge form should render a submit button").toBeDefined();
  return tag as string;
}

/** The chunk of markup belonging to one row, found by the id printed in it. */
function rowFor(markup: string, id: string): string {
  const chunk = markup.split("<li").find((part) => part.includes(id));
  expect(chunk, `no row rendered for ${id}`).toBeDefined();
  return chunk as string;
}

/** The text inside the element carrying this ARIA role. */
function liveRegion(markup: string, role: "status" | "alert"): string {
  const match = markup.match(new RegExp(`<p role="${role}"[^>]*>([^<]*)</p>`));
  expect(match, `no element with role="${role}"`).not.toBeNull();
  return (match as RegExpMatchArray)[1];
}

/**
 * The confirmation the purge field asks for, taken from the field itself.
 *
 * The reason field deliberately carries no placeholder, so there is exactly
 * one in the form and it is this one.
 */
function confirmationOffered(markup: string): string {
  const match = markup.match(/placeholder="([^"]+)"/);
  expect(match, "the confirmation field should offer the string it wants").not.toBeNull();
  return (match as RegExpMatchArray)[1];
}

describe("the purge confirmation", () => {
  const draft = (confirm: string): PurgeDraft => ({
    id: HIDDEN.id,
    reason: "court order 2026-114",
    confirm,
  });

  it("leaves the purge button unpressable until the exact string has been typed", () => {
    const empty = render({ purge: draft("") });
    const phrase = confirmationOffered(empty);

    expect(purgeSubmit(empty)).toContain("disabled");
    expect(purgeSubmit(render({ purge: draft(phrase.toLowerCase()) }))).toContain("disabled");
    expect(purgeSubmit(render({ purge: draft(` ${phrase}`) }))).toContain("disabled");
    expect(purgeSubmit(render({ purge: draft(phrase.slice(0, -1)) }))).toContain("disabled");

    // And the string the field asked for, typed back exactly, opens it.
    expect(purgeSubmit(render({ purge: draft(phrase) }))).not.toContain("disabled");
  });

  it("names the block it is about, so the string cannot match a different row", () => {
    const phrase = confirmationOffered(render({ purge: draft("") }));
    expect(phrase).toContain(HIDDEN.id);
    expect(phrase).not.toContain(PURGED.id);
  });

  it("still refuses with the right confirmation and no reason, which the row has to record", () => {
    const phrase = confirmationOffered(render({ purge: draft("") }));
    const noReason: PurgeDraft = { id: HIDDEN.id, reason: "   ", confirm: phrase };
    expect(purgeSubmit(render({ purge: noReason }))).toContain("disabled");
  });

  it("says once, and only once, that a purge cannot be undone", () => {
    const markup = render({ purge: draft("") });
    expect(markup.match(/cannot be undone/g)).toHaveLength(1);
  });
});

describe("while a request is in flight", () => {
  const inFlight: Pending = { action: "purge", id: HIDDEN.id };

  it("switches off every button and every field on the page", () => {
    const markup = render({
      rows: [HIDDEN, PURGED],
      purge: { id: HIDDEN.id, reason: "court order", confirm: "" },
      pending: inFlight,
    });

    expect(buttons(markup).length).toBeGreaterThan(0);
    for (const button of buttons(markup)) expect(button).toContain("disabled");
    for (const field of inputs(markup)) expect(field).toContain("disabled");
  });

  it("leaves them pressable when nothing is in flight, so the guard above is not vacuous", () => {
    const markup = render({
      rows: [HIDDEN, PURGED],
      purge: { id: HIDDEN.id, reason: "court order", confirm: "" },
      pending: null,
    });

    expect(buttons(markup).some((button) => !button.includes("disabled"))).toBe(true);
    expect(inputs(markup).every((field) => !field.includes("disabled"))).toBe(true);
  });

  it("says which button it is, on the button itself", () => {
    const markup = render({ rows: [HIDDEN], pending: { action: "unhide", id: HIDDEN.id } });
    expect(rowFor(markup, HIDDEN.id)).toContain("Unhiding");
  });
});

describe("the live regions", () => {
  it("hands a successful outcome to the polite one and leaves the assertive one empty", () => {
    const outcome = "Unhidden, and back on the board.";
    const markup = render({ done: outcome });

    expect(liveRegion(markup, "status")).toBe(outcome);
    expect(liveRegion(markup, "alert")).toBe("");
  });

  it("hands a refusal to the assertive one and leaves the polite one empty", () => {
    const refusal = "Nothing changed. That id names no sale.";
    const markup = render({ failed: refusal });

    expect(liveRegion(markup, "alert")).toBe(refusal);
    expect(liveRegion(markup, "status")).toBe("");
  });

  it("renders both regions before either has anything to say", () => {
    // A live region that arrives already carrying its text is one assistive
    // technology may never announce, so both are in the markup from the start.
    const markup = render({});
    expect(liveRegion(markup, "status")).toBe("");
    expect(liveRegion(markup, "alert")).toBe("");
  });
});

describe("a purged row", () => {
  const markup = render({ rows: [HIDDEN, PURGED] });

  it("offers nothing to press, because there is nothing left to put back", () => {
    expect(buttons(rowFor(markup, PURGED.id))).toHaveLength(0);
  });

  it("is still listed, with what was destroyed and when", () => {
    const row = rowFor(markup, PURGED.id);
    expect(row).toContain("Purged");
    expect(row).toContain(PURGED.takedownReason as string);
    expect(row).toContain(PURGED.purgedAt as string);
  });

  it("does not take the controls away from the row beside it", () => {
    const row = rowFor(markup, HIDDEN.id);
    expect(row).toContain("Unhide");
    expect(buttons(row).length).toBeGreaterThan(0);
  });
});

describe("with nothing taken down", () => {
  it("says so, and offers no row controls at all", () => {
    const markup = render({ rows: [] });
    expect(markup).toContain("Nothing is taken down");
    expect(markup).not.toContain("Unhide");
  });
});
