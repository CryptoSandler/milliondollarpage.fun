"use client";

import { useEffect, useState } from "react";

/**
 * A countdown to `expiresAt`, meant to sit inside the control it gates (a
 * submit button, a confirm button) rather than float as its own widget.
 *
 * The redraw interval adapts to how close the deadline is: 500ms above one
 * minute remaining, 100ms below it. A thirty-minute hold does not need a
 * per-frame timer for twenty-nine of those minutes, and the last minute is
 * where a buyer actually watches the clock.
 */
export default function HoldTimer({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(() => Date.parse(expiresAt) - Date.now());

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      const remaining = Date.parse(expiresAt) - Date.now();
      if (cancelled) return;
      setRemainingMs(remaining);
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

  return <span className="tabular-nums">{formatRemaining(remainingMs)}</span>;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  if (totalSeconds <= 60) return `${totalSeconds}s`;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
