"use client";

import { type Ref, useEffect, useState } from "react";
import type { TapeRow } from "../lib/board/tape";
import { formatUsdc, pixelCount } from "../lib/board/pricing";

/**
 * The register of settled purchases, along the bottom of the wall.
 *
 * WHO CALLS THIS: `BoardView`, which owns the board's chrome and is the only
 * thing that can measure this rail and keep the board clear of it. It is a
 * component rather than markup inside `BoardView` because that file is already
 * the largest in the repository and this is a self-contained rail with its own
 * clock.
 *
 * ## What it is for
 *
 * A wall that is filling is the only evidence a buyer has that anybody else
 * believes in it, and until now the page said so with one percentage. This
 * says it with the purchases themselves: what was bought, how big, for how
 * much, how long ago, and — the part that makes it a register rather than a
 * boast — the settlement signature each one carries.
 *
 * ## Who is never named
 *
 * Nobody. DESIGN.md's voice section is exact about it: "Never say who holds a
 * rectangle. When, yes. Who, never." No address, no truncated address, no
 * avatar, no "somebody in Argentina". The signature is cut to eight characters
 * on the SERVER for the same reason — see `lib/board/tape.ts`, which explains
 * why a whole one would publish the payer.
 *
 * ## Why it moves, now that the document lets it
 *
 * It did not, and the reason it did not was that DESIGN.md allowed exactly one
 * continuous animation on this page and it was the marching ants. The register
 * change is what authorised the second, and the argument is in the document:
 * *the thing that moves fast IS the evidence*. A row cannot pass without its
 * signature, and nothing on this rail can ever be reversed — which is what
 * separates it from a casino's tape, where the point of the motion is that the
 * next spin can take it back.
 *
 * THE ROWS ARE RENDERED TWICE and the track translates by half its own width,
 * which is what makes the loop seamless. The second copy is `aria-hidden`: an
 * eye sees a continuous rail, a screen reader is read the purchases once.
 *
 * IT STOPS FOR ANYBODY READING IT. Hover or keyboard focus pauses the roll —
 * a register you cannot read is decoration — and `prefers-reduced-motion`
 * stops it outright and drops the duplicate copy with it, because a still
 * track showing everything twice reads as a bug rather than as a loop.
 *
 * ## Why it is not on a phone
 *
 * The bottom-bar layout has one row at a fixed height and DESIGN.md's shed
 * order takes the legend before anything else; a second rail there would take
 * the board's height on the screen with the least of it. `globals.css` shows
 * this rail only in the side-panel layout, and `/stats` carries the same rows
 * for anybody on a phone who wants them.
 */

/**
 * A settled purchase's age, in the register's own terse vocabulary.
 *
 * Exported for its test. Seconds up to a minute, minutes up to an hour, then
 * hours, then days — a tape row is read in a glance and "12s" is the glance.
 * Anything under five seconds, and anything the clock says is in the future,
 * reads "just now": a server and a browser disagreeing by a second must not
 * produce a purchase that settled in −1 seconds.
 *
 * ponytail: not `Intl.RelativeTimeFormat`, which spells the same intervals
 * "12 seconds ago" and is the upgrade the moment this copy is translated.
 */
export function sinceLabel(elapsedMs: number): string {
  if (elapsedMs < 5_000) return "just now";

  const seconds = Math.floor(elapsedMs / 1_000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

/** How often the ages tick over. A tape row's smallest unit is the second. */
const TICK_MS = 1_000;

export default function PurchaseTape({
  rows,
  asOf,
  ref,
}: {
  rows: TapeRow[];
  asOf: string;
  /**
   * `BoardView` measures this rail to keep the board clear of it, so it has to
   * be able to reach the element. React 19 passes `ref` as an ordinary prop to
   * a function component, so there is no `forwardRef` here to explain.
   */
  ref?: Ref<HTMLElement>;
}) {
  /*
    THE CLOCK STARTS AT THE SERVER'S AND THEN BECOMES THE BROWSER'S.

    A relative time rendered on the server and again on the client is the
    textbook hydration mismatch. `asOf` is the moment the server built this
    payload, so the first client render computes exactly the same ages the
    server did; the interval below then takes over and the numbers become the
    reader's own clock. Nothing flashes, and nothing has to be rendered blank
    until mount.
  */
  const [now, setNow] = useState(() => Date.parse(asOf));

  useEffect(() => {
    // No immediate catch-up call. The first tick is a second away, the ages it
    // corrects are already accurate to the second the payload was built, and a
    // setState in an effect body is a cascading render the linter is right to
    // refuse for a correction nobody can see.
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <aside
      ref={ref}
      className="board-tape"
      aria-label="Recently settled purchases"
    >
      <div className="board-tape__head">
        <p className="board-tape__live">
          {/* The pip is aria-hidden and the word carries the meaning: a pulsing
              dot is not information a screen reader can use, and LIVE is. */}
          <span aria-hidden className="board-tape__pip" />
          Live
        </p>
      </div>

      {/*
        A scrolling region is reachable by keyboard or it is a region some
        people cannot read: `tabindex` and a name are what make the arrow keys
        work here. The rail insets it by four pixels so the focus ring has
        somewhere to be drawn — DESIGN.md: "a focus ring is never clipped",
        and this is the same overflow that clipped the wallet's Connect button.
      */}
      <div
        tabIndex={0}
        role="group"
        aria-label="The most recent settled purchases, newest first"
        className="board-tape__scroller scrollbar-none"
      >
        {rows.length === 0 ? (
          <p className="self-center whitespace-nowrap px-1 text-[13px] text-body">
            Nothing has settled yet. Every purchase that does appears here, with
            the signature that settled it.
          </p>
        ) : (
          <div className="board-tape__track">
            {/* Two copies, so the roll has no seam. Only the first is read. */}
            {[false, true].map((duplicate) => (
              <ol
                key={String(duplicate)}
                aria-hidden={duplicate || undefined}
                className="flex h-full items-stretch"
              >
                {rows.map((row, at) => (
                  /*
                    THE NEWEST SALE IS MARKED, and only in the first copy. The
                    second copy exists so the roll has no seam and is
                    `aria-hidden`; marking a row there would put two "newest"
                    sales on a rail that has exactly one.
                  */
                  <li
                    key={row.id}
                    className={`board-tape__row${
                      at === 0 && !duplicate ? " board-tape__row--newest" : ""
                    }`}
                  >
                    <span className="board-tape__numbers">
                      <span className="board-tape__size">
                        {row.w} × {row.h}
                      </span>
                      <span className="board-tape__amount">
                        {formatUsdc(row.totalBaseUnits)}
                      </span>
                    </span>
                    <span className="board-tape__meta">
                      <span>
                        {pixelCount(row.pixels)} at ({row.x}, {row.y})
                      </span>
                      <span>{sinceLabel(now - Date.parse(row.paidAt))}</span>
                      {/*
                        The proof, and the only part of the row that is not a
                        fact about the rectangle. Eight of eighty-eight
                        characters: enough for the buyer holding the other
                        eighty to recognise their own purchase, and not enough
                        for anybody else to look it up and read the payer's
                        address off it.
                      */}
                      <span
                        title={
                          row.signature === null
                            ? "This purchase settled before signatures were recorded."
                            : "The first and last four characters of the signature that settled this purchase."
                        }
                      >
                        {row.signature ?? "unsigned"}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
