import { recordHeartbeat, rollUpPresence } from "../../../lib/board/presence";
import { NO_STORE, identify, json, problem } from "../../../lib/http";

/**
 * "I am still looking at the wall."
 *
 * The smallest write route in this repository and the only one that is not
 * about a rectangle. It takes no body, returns no body, and stores one row
 * whose only column standing for a person is a salted one-way hash of an IP —
 * the same key the rate limiter already counts against, and the same one
 * `RATE_LIMIT_SALT` can invalidate wholesale.
 *
 * ## Why it is rate limited at all, when it stores almost nothing
 *
 * Because it is the cheapest write on the site to call in a loop. It cannot
 * inflate the count — the primary key is (caller_hash, minute), so a million
 * requests from one caller are one row — but every one of them is still a round
 * trip and an upsert, and an unbounded write route is a way to spend the
 * connection pool the board's own reads need.
 *
 * THE LIMIT IS THE PRIMARY KEY, not a counter beside it. `recordHeartbeat`
 * reports whether its insert actually wrote a row, and a repeat inside the same
 * minute is refused with the top of the next minute in `Retry-After`. One
 * accepted heartbeat per caller per minute, which is exactly what the page
 * sends, with no state to keep and nothing to tune.
 *
 * ## Why the roll-up runs here
 *
 * There is no scheduler in this project, and adding one would be a second
 * deployment target for a DELETE. `rollUpPresence` is idempotent and cheap, so
 * it rides on a fraction of heartbeats instead.
 *
 * IT IS AWAITED, and the first draft of this file did not await it. Not
 * awaiting looked like the considerate choice — why should a visitor's
 * heartbeat wait on housekeeping — and it bought nothing a browser can
 * perceive: nothing on the page renders from this response, it is a POST fired
 * from a timer and the answer is 204. What it cost was a write still running
 * after its request had returned, which in a test run is a write racing the
 * next test's TRUNCATE, and in production is a query nobody can see fail. Two
 * cheap statements on a small table, on one heartbeat in fifty, is not a cost
 * worth being clever about.
 *
 * A roll-up that throws still fails the heartbeat, and that is the correct
 * trade for the same reason: a heartbeat nobody notices failing is exactly the
 * kind of failure this project would rather see in a log than not see at all.
 */

/** Roughly one heartbeat in fifty carries the housekeeping. */
const ROLLUP_ODDS = 0.02;

export async function POST(request: Request): Promise<Response> {
  const caller = identify(request);
  if (!caller.ok) return problem(400, caller.message);

  const beat = await recordHeartbeat(caller.ipHash);
  if (!beat.accepted) {
    return problem(
      429,
      "One heartbeat a minute is enough. This one was already counted.",
      { retryAt: beat.retryAt },
      { "retry-after": String(Math.max(1, Math.ceil((Date.parse(beat.retryAt) - Date.now()) / 1000))) },
    );
  }

  if (Math.random() < ROLLUP_ODDS) await rollUpPresence();

  // 204: there is nothing to say. A body here would be a body every open board
  // downloads once a minute for no reason.
  return new Response(null, { status: 204, headers: NO_STORE });
}

/**
 * Nothing reads presence over GET. `/stats` renders on the server from
 * `presence.ts` directly, so there is no endpoint publishing a live count to
 * anybody who asks — one fewer thing to rate limit, and one fewer surface.
 */
export async function GET(): Promise<Response> {
  return json({ message: "Presence is written, not read. See /stats." }, { status: 405 });
}
