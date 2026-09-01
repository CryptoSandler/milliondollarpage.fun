/**
 * The two numbers the heartbeat and the count have to agree on.
 *
 * WHO CALLS THIS: `OnlineBanner` in the browser, which beats on the interval
 * below, and `presence.ts` on the server, which decides who is still here from
 * the window. They live apart from `presence.ts` for the same reason
 * `hold-clock.ts` lives apart from `reserve.ts`: one of the two callers runs in
 * a browser, and `presence.ts` reaches for the connection pool. Nothing is
 * imported here on purpose.
 *
 * THE TWO NUMBERS ARE NOT INDEPENDENT. The window has to be more than two
 * beats: at exactly two, one dropped request — a sleeping laptop, a tunnel, a
 * throttled background tab — drops a visitor out of the count and then back in,
 * and a counter that flickers reads as broken rather than as live. 150 seconds
 * against a 60-second beat is two and a half, which makes one missed heartbeat
 * survivable and two not.
 */

/** How often an open board says it is still there. */
export const HEARTBEAT_MS = 60_000;

/** How long after its last heartbeat a board still counts as here. */
export const ONLINE_WINDOW_SECONDS = 150;
