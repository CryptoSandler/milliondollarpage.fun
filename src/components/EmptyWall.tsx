"use client";

import { TOTAL_PIXELS } from "../lib/board/geometry";
import { formatUsdc } from "../lib/board/pricing";
import type { Chrome } from "../lib/canvas/viewport";

/**
 * What the board says on the day nobody has bought anything.
 *
 * WHO CALLS THIS: `BoardView`, which is the only thing that knows both that the
 * board is empty and where on the screen there is room to say so.
 *
 * It is positioned from `chrome` — the same measured box the board is fitted
 * into — rather than from the board's own rectangle. The board is centred in
 * that box and this is centred in it too, so the two agree without a second
 * source of truth: the fit maths has exactly one owner, and asking it for its
 * answer would mean lifting a value out of a canvas dataset into React state
 * for a note that is centred either way.
 *
 * ## Why the board says anything at all
 *
 * An empty wall is indistinguishable from a broken one. The cream register let
 * the sheet speak for itself, which worked because a ruled cream sheet reads as
 * *paper waiting to be used*; a near-black rectangle reads as *a thing that has
 * not loaded*. The register change is what made this necessary, and it is the
 * one screen where the interface is allowed to be the loudest thing on the
 * page, because there is nothing else on it.
 *
 * ## Why the call to action is not a button
 *
 * **The whole board is the control.** A button here would offer a second and
 * worse way to do the thing the wall is already asking for, and it would need
 * somewhere to put focus that is not the board — which is the one element the
 * keyboard walk is built around. So the line is text in a hairline box, marked
 * `aria-hidden` because it describes an interaction the board itself already
 * announces, and it does not take focus.
 *
 * ## What it must never say
 *
 * Anything about revenue. The million is the offer and this is the largest type
 * on the page saying it; "a million dollars" is arithmetic somebody else can do
 * and printing it would turn the offer into a forecast. The price per pixel
 * comes from the settings row the checkout charges from, so the sentence cannot
 * disagree with the till.
 */
export default function EmptyWall({ chrome, perPixel }: { chrome: Chrome; perPixel: number }) {
  return (
    <div
      className="empty-wall"
      style={{
        left: chrome.left,
        top: chrome.top,
        right: chrome.right,
        bottom: chrome.bottom,
      }}
    >
      {/*
        `role="status"` and not an alert: an empty board is a fact about the
        wall, not something that happened to the reader. It is announced once,
        politely, and never interrupts — DESIGN.md reserves assertive for a
        refusal that invalidates what somebody is doing.
      */}
      <div role="status" className="empty-wall__note">
        <p className="empty-wall__count">{TOTAL_PIXELS.toLocaleString("en-US")}</p>
        <p className="empty-wall__line">
          pixels. none taken yet. every one of them is for sale on its own, at{" "}
          {formatUsdc(perPixel)}, and the price is the same for the last one as for the first.
        </p>
        <p aria-hidden className="empty-wall__cta">
          drag anywhere to start
        </p>
      </div>
    </div>
  );
}
