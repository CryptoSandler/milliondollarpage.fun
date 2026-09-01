"use client";

import { useEffect } from "react";
import { HEARTBEAT_MS } from "../lib/board/presence-window";

/**
 * "Nine online", and the heartbeat that makes it true.
 *
 * WHO CALLS THIS: `BoardView`, which renders it in the top bar and already
 * holds the count — the number arrives with the board's own payload, so this
 * component neither fetches it nor owns it. What it owns is the other half:
 * telling the server this browser is still here.
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
export default function OnlineBanner({ online }: { online: number }) {
  useEffect(() => {
    /*
      Fire once on mount, then on a timer.

      `keepalive` so a beat started as the tab closes still lands, and errors
      are swallowed on purpose: a heartbeat is the least important request this
      page makes, and a 429 from the per-minute ceiling is the expected answer
      when a tab is restored inside the same minute it was hidden in. Nothing
      on screen depends on it succeeding.
    */
    const beat = () => {
      void fetch("/api/presence", { method: "POST", keepalive: true }).catch(() => {});
    };

    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, []);

  if (online < 1) return null;

  return (
    <p
      className="tabular hidden shrink-0 items-center gap-1.5 text-[12.5px] text-body lg:flex"
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
