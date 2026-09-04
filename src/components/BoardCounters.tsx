"use client";

import { useEffect, useRef, useState } from "react";
import { TOTAL_PIXELS } from "../lib/board/geometry";
import type { BoardStats } from "../lib/board/blocks";

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
export default function BoardCounters({ stats }: { stats: BoardStats }) {
  // Still `left`, because the FLASH is about a drop: what a reader sees move is
  // the sold figure going up, and the thing worth flashing is the same event.
  const left = TOTAL_PIXELS - stats.pixelsSold;

  /*
    THE SUPPRESSION IS GONE WITH THE LINE IT AVOIDED.

    This used to hide the count above `sm` on an untouched board, because the
    offer line beside it already opened with the same million. The offer line
    has left the bar, so there is nothing to say the number twice with, and the
    count is simply always here — which is what it should have been all along.
  */

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
    <div className="flex min-w-0 items-center overflow-hidden whitespace-nowrap text-[13px] text-body">
      {/*
        THE OFFER LINE HAS LEFT THIS BAR. It was the widest thing in a header
        that is now one 34px line, and the norm is that the wall takes almost
        the whole screen while everything else is a small contribution. It is
        not lost: it is the wordmark's own tooltip and the first paragraph of
        `/faq`, both of which a reader reaches deliberately.

        It also carried the last irreducible drift between the two themes — 20
        pixels of prose set in two different body faces. Removing it for a
        layout reason happens to close that too.
      */}
      <p className={`pixels-left ${ticked ? "pixels-left--ticked" : ""}`}>
        {/*
          WHAT IS SOLD, NOT WHAT IS LEFT — and this reverses a rule DESIGN.md
          argued for. That rule said the headline counts what REMAINS, because a
          nearly-full board tells a buyer how much chance they have left. The
          owner reversed it on 2026-09-03: a wall on its first day says
          `1,000,000 pixels left`, which is the same sentence as `nothing has
          happened here`, and the number that makes somebody buy is the one that
          is moving. Sold is the number that moves.

          THE TOTAL RIDES BESIDE IT, SMALL, so the figure is never a bare count
          without its denominator — `191,847 pixels sold` alone says nothing
          about how full the wall is. The share went entirely: `of 1,000,000`
          already says it, and a percentage beside a fraction is the same fact
          claimed twice.
        */}
        <span className="pixels-left__n">{stats.pixelsSold.toLocaleString("en-US")}</span>
        <span className="pixels-left__u">pixels sold</span>
        <span className="pixels-left__of">of {TOTAL_PIXELS.toLocaleString("en-US")}</span>
      </p>
    </div>
  );
}
