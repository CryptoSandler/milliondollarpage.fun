"use client";

import { useEffect, useRef, useState } from "react";
import { TOTAL_PIXELS } from "../lib/board/geometry";
import type { BoardStats } from "../lib/board/blocks";
import { formatPercentSold, offerLine } from "../lib/board/pricing";

/**
 * The offer, and how much of it is left.
 *
 * THE LINE IS THE PRODUCT, said in the wall's own words and nowhere else's:
 * a million pixels, a dollar each, yours forever. Every clause of it has
 * something under it — the million is `TOTAL_PIXELS`, which is the board's own
 * two dimensions multiplied; the dollar is the settings row the checkout
 * charges from; "yours forever" is the sentence `SECURITY.md` opens with and
 * the trigger and the CHECK that hold it up. What it does not say is anything
 * about money raised, a total, or an ending, because none of those is a
 * promise this project has made.
 *
 * WHAT IS LEFT, NOT WHAT IS GONE. The headline number counts pixels remaining.
 * A board that is nearly empty says so either way; a board that is nearly full
 * says the thing a buyer actually needs to know, which is how much chance they
 * have left. It is a plain count and it stays one all the way to zero — see
 * DESIGN.md's settled decisions for why the tail is not an auction.
 *
 * The top bar is one fixed row that never wraps, so this gives way from the
 * right as the window narrows: the share sold goes first, then the offer line
 * itself, then the word "pixels". The remaining count is the one that never
 * leaves.
 */
export default function BoardCounters({
  stats,
  perPixel,
}: {
  stats: BoardStats;
  perPixel: number;
}) {
  const left = TOTAL_PIXELS - stats.pixelsSold;

  /*
    THE MILLION IS SAID ONCE IN THIS BAR, NOT TWICE.

    `offerLine` opens with `1,000,000 pixels`, and on a board nobody has bought
    anything on yet the remaining count is the same million — so the row read
    `1,000,000 pixels · $1 per pixel · yours forever · 1,000,000 pixels left`,
    which says one number twice and reads as a bar that is not paying
    attention. It is exactly the state the wall spends its first day in.

    The count gives way, and only where the offer line is actually on screen
    to replace it: below `sm` the offer is hidden and the count is the only
    thing there is, so it stays. That is one utility class rather than a second
    branch of markup, and the moment a single pixel sells the two numbers stop
    being the same one and the count comes back at every width.
  */
  const sameNumberTwice = left === TOTAL_PIXELS;

  /*
    A COUNT THAT DROPS WHILE SOMEBODY IS LOOKING AT IT SHOULD SAY SO.

    The board refetches twice a minute, so this number changes under a reader
    who is still deciding — and "somebody just bought pixels while you were
    thinking about it" is the most persuasive true thing this page can say. It
    was happening silently.

    One 900ms flash of the accent, which is one of the five places the accent is
    permitted: this is money moving, in the most literal sense available. The
    class comes off when the flash ends so the next drop can put it back on —
    without that, a second change would find it already applied and not restart.

    `prefers-reduced-motion` removes the animation in the stylesheet. The NUMBER
    still changes, which is the information; only the flash is the flourish.
  */
  const [ticked, setTicked] = useState(false);
  const previous = useRef(left);

  useEffect(() => {
    const dropped = left < previous.current;
    previous.current = left;
    if (!dropped) return;

    setTicked(true);
    const done = setTimeout(() => setTicked(false), 900);
    return () => clearTimeout(done);
  }, [left]);

  return (
    <div className="flex min-w-0 items-center gap-x-3 overflow-hidden whitespace-nowrap text-[13px] text-body">
      {/* Below `sm` the wordmark and the count are all a phone has room for,
          and the line is what gives way. It is the offer, not the state of
          the board, and a buyer meets it again beside the Buy button. */}
      <p className="hidden truncate text-ink sm:block">{offerLine(perPixel)}</p>
      <span
        className={`hidden text-hairline-strong ${sameNumberTwice ? "" : "sm:inline"}`}
      >
        ·
      </span>
      <p
        className={`pixels-left truncate ${sameNumberTwice ? "sm:hidden" : ""} ${
          ticked ? "pixels-left--ticked" : ""
        }`}
      >
        <span className="pixels-left__n">{left.toLocaleString("en-US")}</span>
        <span className="pixels-left__u">pixels left</span>
      </p>
      <span
        className="tabular hidden shrink-0 rounded-full bg-canvas-deep px-2 py-0.5 text-[12px] font-bold text-ink-soft md:inline"
        title="Share of the board sold so far"
      >
        {formatPercentSold(stats.percentSold)} sold
      </span>
    </div>
  );
}
