import { describe, expect, it } from "vitest";
import { FINAL_STRETCH_MS, HOLD_ALERT_MARKS_MS, holdAlert } from "../hold-alerts";

describe("hold alert marks", () => {
  it("starts the final stretch where the clock already turns danger-coloured", () => {
    expect(FINAL_STRETCH_MS).toBe(120_000);
    expect(HOLD_ALERT_MARKS_MS[0]).toBe(FINAL_STRETCH_MS);
  });

  it("speaks four times in two minutes and no more", () => {
    expect([...HOLD_ALERT_MARKS_MS]).toEqual([120_000, 60_000, 30_000, 10_000]);
  });
});

describe("holdAlert", () => {
  it("says nothing for the twenty-eight minutes nobody is watching the clock", () => {
    expect(holdAlert(29 * 60_000, null)).toBeNull();
    expect(holdAlert(FINAL_STRETCH_MS + 1, null)).toBeNull();
  });

  it("opens the final stretch on the two-minute mark", () => {
    expect(holdAlert(FINAL_STRETCH_MS, null)).toEqual({
      mark: FINAL_STRETCH_MS,
      message: "Two minutes left before these pixels go back on the board.",
    });
  });

  it("says the mark just crossed, not the largest one still ahead", () => {
    expect(holdAlert(25_000, null)?.mark).toBe(30_000);
  });

  it("stays silent for every tick between two marks", () => {
    expect(holdAlert(119_000, FINAL_STRETCH_MS)).toBeNull();
    expect(holdAlert(61_000, FINAL_STRETCH_MS)).toBeNull();
  });

  it("speaks again at the next mark down", () => {
    expect(holdAlert(60_000, FINAL_STRETCH_MS)?.message).toBe(
      "One minute left before these pixels go back on the board.",
    );
    expect(holdAlert(29_500, 60_000)?.message).toBe(
      "Thirty seconds left before these pixels go back on the board.",
    );
    expect(holdAlert(9_900, 30_000)?.message).toBe(
      "Ten seconds left before these pixels go back on the board.",
    );
  });

  it("skips the deadlines a backgrounded tab slept through rather than reading the list", () => {
    expect(holdAlert(8_000, FINAL_STRETCH_MS)?.mark).toBe(10_000);
  });

  it("never repeats a mark it has already spoken", () => {
    expect(holdAlert(9_000, 10_000)).toBeNull();
    expect(holdAlert(1, 10_000)).toBeNull();
  });

  it("goes quiet at zero, because what is needed then is not a countdown", () => {
    expect(holdAlert(0, 30_000)).toBeNull();
    expect(holdAlert(-5_000, null)).toBeNull();
  });
});
