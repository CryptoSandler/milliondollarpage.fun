"use client";

import { useEffect, useRef, useState } from "react";
import { FINAL_STRETCH_MS, holdAlert } from "../lib/board/hold-alerts";

/**
 * A countdown to `expiresAt`, meant to sit inside the control it gates (the
 * dialog's price strip, beside the amount) rather than float as its own widget.
 *
 * The redraw interval adapts to how close the deadline is: 500ms above one
 * minute remaining, 100ms below it. A thirty-minute hold does not need a
 * per-frame timer for twenty-nine of those minutes, and the last minute is
 * where a buyer actually watches the clock.
 *
 * Under two minutes it turns danger-coloured. That is the moment the number
 * stops being background information and starts being a deadline — and it is
 * also the moment the clock starts SAYING so, to anyone who cannot see it
 * change colour. What it says and how rarely is `hold-alerts.ts`; both halves
 * read the same `FINAL_STRETCH_MS`, so the colour and the voice can never
 * disagree about when the final stretch began.
 */

export default function HoldTimer({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(() => Date.parse(expiresAt) - Date.now());
  /** What the live region is currently holding, spoken at most four times. */
  const [said, setSaid] = useState("");
  // A ref rather than state: the tick reads it and writes it in the same
  // breath, and a render in between would let the same mark be announced twice.
  const spokenMark = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      const remaining = Date.parse(expiresAt) - Date.now();
      if (cancelled) return;
      setRemainingMs(remaining);
      const due = holdAlert(remaining, spokenMark.current);
      if (due) {
        spokenMark.current = due.mark;
        setSaid(due.message);
      }
      if (remaining <= 0) {
        onExpired();
        return;
      }
      timeoutId = setTimeout(tick, remaining > 60_000 ? 500 : 100);
    }

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [expiresAt, onExpired]);

  return (
    <>
      <span className={`tabular ${remainingMs < FINAL_STRETCH_MS ? "text-danger" : ""}`}>
        {formatRemaining(remainingMs)}
      </span>
      {/*
       * POLITE, and spoken four times rather than eighteen hundred.
       *
       * The visible number changes ten times a second in the last minute. A
       * live region wired to it would be a metronome, and a countdown that
       * announces every second is worse than one that never announces at all.
       * Assertive would be worse still: a buyer typing a caption would be cut
       * off mid-word by a deadline that has not arrived yet. What HAS arrived
       * — the hold gone, the pixels back on the board — is announced by
       * PurchaseDialog, and that one interrupts.
       */}
      <span className="sr-only" role="status">
        {said}
      </span>
    </>
  );
}

/**
 * Minutes and seconds, because a hold is thirty minutes long and "00:29:41"
 * spends two digits saying "not hours". An hour-plus hold, if one ever
 * exists, grows the hours field back.
 */
function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}
