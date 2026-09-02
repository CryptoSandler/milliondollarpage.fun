"use client";

import { formatUsdc } from "../lib/board/pricing";

/**
 * The card that appears over a rectangle: its picture, its caption, its link,
 * its size, and one line saying what state it is in.
 *
 * WHO CALLS THIS. `src/components/BoardView.tsx`, which floats one beside the
 * pointer for whatever rectangle it is resting on; and
 * `src/components/ConfirmationStep.tsx`, which renders one at checkout so a
 * buyer sees the card their rectangle will have BEFORE they pay for it. Those
 * two are why this is a module rather than markup inside BoardView: the
 * checkout's whole promise is that the card it shows is the card the board
 * will show, and two copies of this markup would keep that promise exactly
 * until somebody edited one of them.
 *
 * IT SHOWS THE PICTURE, AND THE PICTURE IS PIXELATED WHEN THE PURCHASE IS
 * SMALL. That is not a rendering compromise, it is the product: a rectangle
 * stores four image pixels per pixel bought (see `targetBox` in
 * `../lib/board/image-plan.ts`), so a 1×1 stores 4×4, and 4×4 enlarged to
 * thumbnail size looks exactly like what it is. Smoothing it would show a
 * buyer a picture nobody stored. `image-rendering: pixelated` is what keeps
 * this card honest, and it is the same rule the board itself draws under.
 *
 * IT WRITES THE STATE SENTENCE ITSELF rather than taking one, because that
 * sentence is the one thing the two callers must not word differently. What it
 * never says is WHO holds a rectangle — only that it is held, and, for a hold
 * this browser started, that it is the reader's own.
 */

export type BlockCardState =
  | { kind: "sold" }
  | { kind: "held"; own: boolean }
  /** Nothing is bought yet: this is the checkout showing what the card will be. */
  | { kind: "preview" };

/** How long the thumbnail's longest edge is, in rem. */
const THUMB_REM = 2.75;

export default function BlockCard({
  id,
  imageSrc,
  caption,
  link,
  clicks,
  rect,
  perPixel,
  state,
}: {
  /** The rectangle's own id, which is what `/go/<id>` is built from. */
  id: string;
  /**
   * How many times this rectangle's link has been followed, or undefined where
   * the caller does not know yet — the checkout renders this card before there
   * is anything to have clicked.
   */
  clicks?: number;
  /**
   * Where the rectangle's own bitmap lives, or null when there is none to
   * show — a hold, which publishes nothing, or a block that has been taken
   * down. Null means no frame at all rather than an empty one.
   */
  imageSrc: string | null;
  /**
   * The buyer's caption, or null.
   *
   * Null covers three things on purpose — no caption was written, the words
   * have not been fetched yet, and a hold publishes none — because the card
   * has the same thing to say about all three: there is nothing to read here.
   */
  caption: string | null;
  link: string | null;
  rect: { x: number; y: number; w: number; h: number };
  /**
   * What a pixel costs, so the card can say what this rectangle cost.
   *
   * COMPUTED, NOT FETCHED. The price is the rectangle's area times this, and
   * both halves are already in the board payload — so the card gains a number
   * without gaining a request, and `/api/blocks/{id}` stays the words-only
   * endpoint it was designed as.
   */
  perPixel: number;
  state: BlockCardState;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2.5">
        {imageSrc && <span className="block-card-thumb shrink-0" style={thumbBox(rect, imageSrc)} />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[14.5px] font-bold text-ink">
            {caption ?? emptyCaption(state)}
          </p>
          {link && (
            /*
              THE LINK GOES THROUGH `/go/<id>`, WHICH IS WHAT MAKES IT COUNTABLE.
              What is SHOWN is still the buyer's own address — a reader has to be
              able to see where a link goes before following it, and a card that
              displayed our redirector would be hiding that. What is followed is
              the redirector, which reads the destination from the block rather
              than from anything in the URL. See `src/app/go/[id]/route.ts`.
            */
            <a
              href={`/go/${id}`}
              rel="noreferrer noopener nofollow"
              target="_blank"
              className="block truncate text-[12.5px] font-semibold text-primary-pressed underline-offset-2 hover:underline"
            >
              {link}
            </a>
          )}
          <p className="tabular mt-1 text-[11px] text-body">
            {rect.w} × {rect.h} at ({rect.x}, {rect.y}) ·{" "}
            {(rect.w * rect.h).toLocaleString("en-US")} px
            {clicks !== undefined && clicks > 0 && (
              <>
                {" · "}
                {/* The buyer's own number, and the only evidence this wall can
                    give that a rectangle was worth buying. Absent rather than
                    zero when nobody has clicked: a fresh purchase advertising
                    "0 clicks" is the wall talking a buyer out of it. */}
                {clicks.toLocaleString("en-US")} {clicks === 1 ? "click" : "clicks"}
              </>
            )}
          </p>
          {/*
            The price, in the accent. One of the five places it is allowed: a
            reader resting on a rectangle is weighing whether to move money, and
            this is the answer to the question they are asking.
          */}
          <p className="block-card-price mt-1">
            {formatUsdc(rect.w * rect.h * perPixel)}
          </p>
        </div>
      </div>
      <p className={`text-[11px] font-semibold ${mine(state) ? "text-primary-pressed" : "text-body"}`}>
        {stateLine(state)}
      </p>
    </div>
  );
}

/**
 * The thumbnail's box: the RECTANGLE's shape, never a square.
 *
 * The same reason `previewBox` in ConfirmationStep gives — a 200×50 purchase
 * shown in a square frame is a letterboxing the buyer is not going to get —
 * and here it also carries information: a wide card thumbnail is what a wide
 * rectangle looks like on the wall.
 *
 * A BACKGROUND RATHER THAN AN `<img>`, deliberately. The picture is decorative
 * — the caption and the state line carry everything this card says — and the
 * bytes are either an API route's or a data: URL, neither of which `next/image`
 * can optimize and both of which it would smooth. `image-rendering: pixelated`
 * reaches a background image exactly as it reaches an `<img>`, so nothing about
 * the honesty of the render depends on which element carries it.
 */
function thumbBox(
  rect: { w: number; h: number },
  imageSrc: string,
): { width: string; height: string; backgroundImage: string } {
  const longest = Math.max(rect.w, rect.h);
  return {
    width: `${(THUMB_REM * rect.w) / longest}rem`,
    height: `${(THUMB_REM * rect.h) / longest}rem`,
    backgroundImage: `url("${imageSrc}")`,
  };
}

/** What the headline says when there are no words to put there. */
function emptyCaption(state: BlockCardState): string {
  return state.kind === "held" ? "On hold" : "No caption";
}

function mine(state: BlockCardState): boolean {
  return state.kind === "held" && state.own;
}

/**
 * The one line about what this rectangle is, and the only place it is worded.
 *
 * The preview's line is written for somebody who has not paid yet, and says
 * the thing that becomes true the moment they do.
 */
function stateLine(state: BlockCardState): string {
  if (state.kind === "sold") return "Sold — not for sale";
  if (state.kind === "preview") return "This is the card the board will show once you have paid.";
  return state.own
    ? "Your hold. Select it and press Buy to carry on, or to let it go."
    : "On hold mid-purchase — not for sale right now";
}
