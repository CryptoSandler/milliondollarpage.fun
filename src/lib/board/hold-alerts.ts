/**
 * What the hold clock says out loud, and how rarely it says it.
 *
 * Called by HoldTimer (src/components/HoldTimer.tsx), which already redraws
 * the countdown two to ten times a second. A live region wired straight to
 * that would speak a new number every tick and drown out everything else on
 * the screen — a clock that announces every second is worse than one that
 * never announces at all — so the decision about WHEN a countdown is worth
 * interrupting for is made here, where it can be tested, rather than in a
 * component where it would be a magic number in a render.
 *
 * The final stretch is the last two minutes, and that number is not new: it is
 * the threshold at which the countdown already turns danger-coloured, which is
 * the moment DESIGN.md's own comment calls "the number stops being background
 * information and starts being a deadline". Sighted and unsighted buyers are
 * told at the same instant because they are told by the same constant.
 */

/** Where a hold stops being background information and starts being a deadline. */
export const FINAL_STRETCH_MS = 120_000;

/**
 * The four moments worth speaking, largest first.
 *
 * Four in two minutes, spaced so each gap is roughly half the last: there is
 * time to finish a sentence after the first and time to do nothing but save
 * after the last. Anything denser is a metronome.
 */
export const HOLD_ALERT_MARKS_MS = [FINAL_STRETCH_MS, 60_000, 30_000, 10_000] as const;

const SAID: Record<number, string> = {
  [FINAL_STRETCH_MS]: "Two minutes left before these pixels go back on the board.",
  60_000: "One minute left before these pixels go back on the board.",
  30_000: "Thirty seconds left before these pixels go back on the board.",
  10_000: "Ten seconds left before these pixels go back on the board.",
};

export type HoldAlert = { mark: number; message: string };

/**
 * The next thing the clock should say, or null for the overwhelming majority
 * of ticks, which is most of them.
 *
 * `spokenMark` is the mark the caller last announced, so a tick that crosses
 * two marks at once — a tab that was backgrounded through both — says only the
 * later one rather than reading a list of deadlines that have already passed.
 *
 * At or below zero it says nothing: the hold is over, and what a buyer needs
 * then is the sentence about what happened to their purchase, not a countdown
 * reading zero. PurchaseDialog raises that one, and it interrupts.
 */
export function holdAlert(remainingMs: number, spokenMark: number | null): HoldAlert | null {
  if (remainingMs <= 0) return null;
  // Ascending, so the first match is the SMALLEST mark still ahead of the
  // clock — the one just crossed. Searching the list as written would answer
  // "two minutes left" with twenty-five seconds on it, because two minutes is
  // also, technically, ahead.
  const due = [...HOLD_ALERT_MARKS_MS]
    .reverse()
    .find((mark) => remainingMs <= mark && (spokenMark === null || mark < spokenMark));
  return due === undefined ? null : { mark: due, message: SAID[due] };
}
