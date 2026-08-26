import { describe, expect, it } from "vitest";
import { tellRelease } from "../release-outcome";

/**
 * The regression these exist for: the dialog used to throw the release's
 * answer away and always say the same thing, so a buyer whose payment had
 * landed was told their purchase had been discarded.
 */

describe("tellRelease", () => {
  it("says the pixels are back on the board when the release succeeded", () => {
    const told = tellRelease({ ok: true });
    expect(told.holdEnded).toBe(true);
    expect(told.purchased).toBe(false);
    expect(told.notice).toContain("back on the board");
    expect(told.notice).toContain("Nothing was charged");
  });

  it("says the purchase went through on a 409, and never that anything was discarded", () => {
    const told = tellRelease({
      ok: false,
      status: 409,
      message: "These pixels are paid for and permanently yours, so there is no hold left to let go of.",
    });
    expect(told.purchased).toBe(true);
    // It is a sale now, so the board must stop drawing it as this buyer's hold.
    expect(told.holdEnded).toBe(true);
    expect(told.notice).toContain("did land");
    expect(told.notice).toContain("yours");
    // The abandonment wording is the whole bug: it must not say the pixels
    // went back, and it must say the buyer's words survived rather than that
    // they were discarded.
    expect(told.notice).not.toContain("back on the board for anyone to buy");
    expect(told.notice).toContain("nothing you wrote was thrown away");
    expect(told.notice).not.toContain("Nothing was charged");
  });

  it("says the hold may still be live for every other failure, and keeps it marked as the buyer's", () => {
    const failures = [
      { ok: false as const, status: 0, message: "Could not reach the server." },
      { ok: false as const, status: 0, message: "There is no wallet connected to this page yet." },
      { ok: false as const, status: 403, message: "That was not signed by the wallet that started it." },
      { ok: false as const, status: 404, message: "That order does not exist." },
      { ok: false as const, status: 500, message: "Something went wrong." },
    ];
    for (const failure of failures) {
      const told = tellRelease(failure);
      expect(told.holdEnded, String(failure.status)).toBe(false);
      expect(told.purchased, String(failure.status)).toBe(false);
      // The server's own sentence survives, then ours says what is still true.
      expect(told.notice).toContain(failure.message);
      expect(told.notice).toContain("thirty minutes");
      expect(told.notice).not.toContain("back on the board for anyone to buy");
    }
  });
});
