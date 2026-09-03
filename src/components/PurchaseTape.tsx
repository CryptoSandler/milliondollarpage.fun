"use client";

import type React from "react";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import type { TapeRow } from "../lib/board/tape";
import { blockImageUrl } from "../lib/board/block-image";
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
 * ## Where it lives, which is two places, and it ticks in both
 *
 * Along the bottom of the wall as a strip, and — on the viewports wide enough
 * for a pair of rails — as a COLUMN down the right. Same component, same rows,
 * same DOM: `globals.css` turns it on its side, keeps the seamless duplicate,
 * swaps `translateX` for `translateY`, and reveals a thumbnail per row.
 *
 * IT MOVES IN BOTH, and an earlier build of the column did not. The argument
 * for stillness was that a strip rolls because it is too narrow to hold its
 * rows and a column is not; the owner overruled it, and the reason is the one
 * this rail was built for in the first place — *the thing that moves fast IS
 * the evidence*. A register that has stopped is a list. It pauses for anybody
 * reading it, on hover and on focus, and `prefers-reduced-motion` stops it
 * outright and drops the duplicate with it.
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
  children,
  echo = false,
}: {
  rows: TapeRow[];
  asOf: string;
  /**
   * The second copy, drawn down the other side of the wall.
   *
   * IT IS THE SAME REGISTER SEEN TWICE, NOT TWO REGISTERS. The first copy is
   * the real one — named, focusable, in the accessibility tree — and this one
   * is `aria-hidden`, has no head and takes no tab stop. A second focusable
   * copy would be a second tab stop and a second region announcing the same
   * purchases, which is the mistake DESIGN.md already refuses for the wallet
   * control and for Buy.
   *
   * It also reverses the rows, and that is what makes the two sides read as one
   * loop rather than two lists: going down the left and then up the right, the
   * sequence continues instead of starting again.
   */
  echo?: boolean;
  /**
   * Whatever else belongs beside the LIVE label. The right rail puts the count
   * of who else is here there, because "this register is running" and "there
   * are four of you looking at it" are the same claim said twice — and because
   * they have to share one row, which means sharing one parent. Nothing is
   * passed in the horizontal rail or on `/stats`.
   */
  children?: ReactNode;
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

  /*
    ONE BELT, ONE ORDER. The echo used to render the list reversed, which was
    the right answer to a different design — two rolls made to look like a loop.
    They are one path now: the same list, drawn twice, with the right-hand
    column showing the slice of the belt that is one column-height further
    along. The reflection is in the stylesheet, not in the data.
  */
  const shown = rows;

  /*
    THE ROUTE'S LENGTH, MEASURED ON THE REAL COLUMN AND PUBLISHED FOR BOTH.

    The two columns are one route: down the left, up the right. What the right
    one has to show is the belt one ROUTE-LENGTH further along — a constant
    offset, which survives over time in a way a delay between two
    opposite-running animations cannot.

    IT IS THE SCROLLER'S HEIGHT, NOT THE COLUMN'S, and that distinction cost a
    guard: the left column carries the LIVE head and the right does not, so
    their columns are the same height and their scrollers are not. Measured with
    the column's height, the join came out 68.6 + 86.6 = 155.2 against an item
    180.7 tall — short by exactly the head. The stylesheet gives the echo's
    scroller this height so both routes are the same length.
  */
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (echo) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    function measure() {
      document.documentElement.style.setProperty("--tape-c", `${scroller!.clientHeight}px`);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [echo]);

  return (
    <aside
      ref={ref}
      aria-hidden={echo || undefined}
      className={echo ? "board-tape board-tape--echo" : "board-tape"}
      aria-label={echo ? undefined : "Recently settled purchases"}
      /*
        The rail's second line — "newest first · on chain" — was two lines of
        type in a 26px strip and the lower one was clipped at the bottom of the
        window. It is the rail's own tooltip now: the same words, somewhere with
        room for them.
      */
      title={
        rows.length === 0
          ? "Settled purchases. The first one lands here."
          : "Settled purchases, newest first, on chain."
      }
    >
      {!echo && (
      <div className="board-tape__head">
        <p className="board-tape__live">
          {/* The pip is aria-hidden and the word carries the meaning: a pulsing
              dot is not information a screen reader can use, and LIVE is. */}
          <span aria-hidden className="board-tape__pip" />
          Live
        </p>
        {children}
      </div>
      )}

      {/*
        A scrolling region is reachable by keyboard or it is a region some
        people cannot read: `tabindex` and a name are what make the arrow keys
        work here. The rail insets it by four pixels so the focus ring has
        somewhere to be drawn — DESIGN.md: "a focus ring is never clipped",
        and this is the same overflow that clipped the wallet's Connect button.
      */}
      <div
        ref={scrollerRef}
        tabIndex={echo ? undefined : 0}
        role={echo ? undefined : "group"}
        aria-label={echo ? undefined : "The most recent settled purchases, newest first"}
        className="board-tape__scroller scrollbar-none"
      >
        {rows.length === 0 ? (
          /*
            ONE SHORT LINE, NEVER PROSE. It was two sentences, which is a
            paragraph in a 26px strip and a wrapped block five lines deep in a
            column — the owner saw the second at 2495. What the empty state has
            to say is that the register is empty; what it used to say as well
            was how the register works, which is a thing to read once and not a
            thing to read while waiting.
          */
          <p className="board-tape__empty">Nothing sold yet</p>
        ) : (
          /*
            THE TICKER'S SPEED IS PER ROW, NOT PER RAIL. A column holding twenty
            rows and one holding three, translated over the same duration, are
            two different reading speeds — and the point of a register is that it
            can be read going past. The stylesheet spends 3.2s a row; this is the
            only thing it needs from here.
          */
          <div
            className="board-tape__track"
            style={
              {
                "--tape-rows": rows.length,
              } as React.CSSProperties
            }
          >
            {/* Two copies, so the roll has no seam. Only the first is read. */}
            {[false, true].map((duplicate) => (
              <ol
                key={String(duplicate)}
                aria-hidden={duplicate || undefined}
                className="flex h-full items-stretch"
              >
                {shown.map((row, at) => (
                  /*
                    THE NEWEST SALE IS MARKED, and only in the first copy. The
                    second copy exists so the roll has no seam and is
                    `aria-hidden`; marking a row there would put two "newest"
                    sales on a rail that has exactly one.
                  */
                  <li
                    key={row.id}
                    /*
                      The rectangle this row is about, for the guard that checks
                      the join: it has to find the SAME purchase in both columns
                      to add up what is visible of it at the bottom of each. It
                      is an id the payload already publishes, on an element that
                      already exists.
                    */
                    data-block={row.id}
                    className={`board-tape__row${
                      at === 0 && !duplicate ? " board-tape__row--newest" : ""
                    }`}
                  >
                    {/*
                      THE THUMBNAIL EXISTS ONLY IN THE VERTICAL RAIL, and it is
                      a background image on a span rather than an `<img>` for
                      exactly that reason: a display:none `<img>` is still
                      fetched, and a display:none background is not. So the
                      horizontal rail — every viewport without side rails, and
                      `/stats` — makes no extra request at all, and the vertical
                      one makes at most one per row. Each is cached for a year
                      by its own URL.

                      Decorative, and aria-hidden: the row already says the
                      size, the price and the age in words, and the picture is
                      somebody else's artwork rather than information about the
                      purchase.
                    */}
                    <span
                      aria-hidden
                      className="board-tape__thumb"
                      style={{ backgroundImage: `url(${blockImageUrl(row.id)})` }}
                    />

                    {/*
                      THE PARADE'S OWN ITEM: the artwork at the column's width.

                      It exists only where the register runs down the letterbox,
                      and it is a background for the same reason the thumbnail
                      beside it is — a `display: none` `<img>` is still fetched
                      and a `display: none` background is not, so the horizontal
                      strip and `/stats` make no request for it at all.

                      THE BOX IS THE RECTANGLE'S OWN SHAPE, never cropped and
                      never squared. The stylesheet sizes it from these two
                      numbers: the column's width is the cap, a height cap keeps
                      a tall rectangle from taking the whole column, and a small
                      one is scaled UP rather than left as a speck. The parade is
                      therefore a column of different shapes rather than a grid.

                      A RECTANGLE WITH NO BYTES GETS ITS TONE AND ITS SIZE, not
                      an empty frame: a one-pixel purchase has no picture to show
                      and a takedown has had its taken away, and both are true
                      things to say rather than gaps to hide.
                    */}
                    <span
                      className="board-tape__art"
                      style={
                        {
                          // The rectangle's own two numbers, handed to the
                          // stylesheet as plain numbers so it can both set the
                          // ratio and divide by it — see `.board-tape__art`.
                          "--art-w": row.w,
                          "--art-h": row.h,
                          "--art-src": `url(${blockImageUrl(row.id)})`,
                        } as React.CSSProperties
                      }
                    >
                      {/*
                        THE SIZE SITS UNDER THE PICTURE RATHER THAN BESIDE A
                        FLAG SAYING THERE IS NONE.

                        The board's payload may not carry a flag for that —
                        `board.test.ts` refuses one by name, and its words are
                        exact: "a flag saying it had a bitmap of its own to go
                        and fetch" belongs to the on-demand route now. So the
                        artwork is painted by an overlay in the stylesheet and
                        this label is UNDERNEATH it: a rectangle with bytes
                        covers it, and one without — a one-pixel purchase, a
                        takedown — leaves its own tone showing with its size
                        written across it. No flag, no second request, and
                        nothing in the payload that is not four numbers.
                      */}
                      <span className="board-tape__bare-size">
                        {row.w} × {row.h}
                      </span>
                    </span>

                    {/*
                      ONE SMALL LINE UNDER THE PICTURE, and the seed is not on
                      it: eight characters of signature are a proof a buyer
                      checks once, and they live on the rectangle's own page.
                      What a parade owes is what it is, what it cost and how
                      long ago.
                    */}
                    <span className="board-tape__line">
                      <span className="board-tape__line-size">
                        {row.w} × {row.h}
                      </span>
                      {" · "}
                      {formatUsdc(row.totalBaseUnits)}
                      {" · "}
                      {sinceLabel(now - Date.parse(row.paidAt))}
                    </span>

                    {/*
                      THE CAPTION IS NOT HERE, and that is the payload's rule
                      rather than an omission. `board.test.ts`: this response
                      "ships no content whatsoever", and a caption is content.
                      The hover pause is built and the words it would show are
                      one on-demand fetch away — the same `/api/blocks/<id>` the
                      hover card already uses — which is a batch of its own.
                    */}
                    <span className="board-tape__numbers">
                      <span className="board-tape__size">
                        {row.w} × {row.h}
                      </span>
                      <span className="board-tape__amount">
                        {formatUsdc(row.totalBaseUnits)}
                      </span>
                    </span>
                    <span className="board-tape__meta">
                      <span className="board-tape__where">
                        {pixelCount(row.pixels)} at ({row.x}, {row.y})
                      </span>
                      <span className="board-tape__age">
                        {sinceLabel(now - Date.parse(row.paidAt))}
                      </span>
                      {/*
                        The proof, and the only part of the row that is not a
                        fact about the rectangle. Eight of eighty-eight
                        characters: enough for the buyer holding the other
                        eighty to recognise their own purchase, and not enough
                        for anybody else to look it up and read the payer's
                        address off it.
                      */}
                      <span
                        className="board-tape__proof"
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
