"use client";

import { useEffect } from "react";
import { HEARTBEAT_MS } from "../lib/board/presence-window";

/**
 * "Nine online", and the heartbeat that makes it true.
 *
 * WHO CALLS THIS: `BoardView`, twice, and it already holds the count — the
 * number arrives with the board's own payload, so this component neither
 * fetches it nor owns it. What it owns is the other half: telling the server
 * this browser is still here.
 *
 * ## Why twice
 *
 * It is in the top bar in the layout without side rails and at the head of the
 * right rail in the layout with them, and those are two different parents, so
 * CSS cannot move it between them. Both copies are always in the DOM and
 * exactly one of them is ever `display: none`, which is what keeps a screen
 * reader from meeting the count twice: an undisplayed element is not exposed at
 * all. This is the pattern the counters and the Buy button's label already use
 * for the same reason, and it is safe HERE and not for a control — DESIGN.md
 * forbids a second Buy or a second Connect, because those can take focus and a
 * keyboard would walk both. A count cannot.
 *
 * `beat` is what stops the doubling that WOULD have mattered: exactly one copy
 * runs the heartbeat, so two rendered copies still tell the server about one
 * reader.
 *
 * ## From one, and that was a decision
 *
 * The obvious move is to hide the banner until the number is impressive, and it
 * is the wrong one twice over. It would make the banner a claim rather than a
 * count — a number that only ever appears when it flatters is not a
 * measurement — and the first person on a wall nobody has found yet is exactly
 * the person for whom "1 online" is honest and "nothing" is a lie. So it shows
 * from one, and at one it says so plainly rather than dressing it up.
 *
 * Zero is the only state it does not render, because zero cannot happen while
 * somebody is reading it: the reader is the one.
 *
 * ## Who is counted, and what is stored
 *
 * A salted one-way hash of an address, and a minute. No cookie, no session, no
 * path, no referrer, no user agent. See `migrations/013_presence.sql` — the
 * anonymity is a property of the columns, not a promise in a comment.
 */
export default function OnlineBanner({
  online,
  beat = true,
  className = "",
}: {
  online: number;
  /** Exactly one copy on the page sends it. See "Why twice" above. */
  beat?: boolean;
  /** Which of the two placements this copy is, so globals.css can hide it. */
  className?: string;
}) {
  useEffect(() => {
    if (!beat) return;
    /*
      Fire once on mount, then on a timer.

      `keepalive` so a beat started as the tab closes still lands, and errors
      are swallowed on purpose: a heartbeat is the least important request this
      page makes, and a 429 from the per-minute ceiling is the expected answer
      when a tab is restored inside the same minute it was hidden in. Nothing
      on screen depends on it succeeding.
    */
    const send = () => {
      void fetch("/api/presence", { method: "POST", keepalive: true }).catch(() => {});
    };

    send();
    const timer = setInterval(send, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [beat]);

  if (online < 1) return null;

  return (
    <p
      className={`online-banner tabular shrink-0 items-center gap-1.5 text-[12.5px] text-body ${className}`}
      title="Visitors who have been on the wall in the last two minutes. Counted anonymously."
    >
      <span aria-hidden className="size-1.5 rounded-full bg-ok" />
      <span className="font-semibold text-ink">{online.toLocaleString("en-US")}</span>
      {/* "online" does not inflect, so unlike every pixel count on this page
          there is nothing here to agree with the number. */}
      online
    </p>
  );
}
