/**
 * A ceiling on how long any one request is allowed to keep a screen loading.
 *
 * A modal that is waiting has nothing to show and nothing to press. If the
 * answer never arrives — a dropped connection that never errors, a request
 * that stalls behind a sleeping laptop, a serverless cold start that never
 * finishes — the buyer is left looking at a sentence that will never be
 * replaced. This turns "forever" into a number.
 *
 * It lives here rather than as a `setTimeout` inside the dialog for the same
 * reason `singleFlight` does: a timer buried in a component is a thing you can
 * only test by rendering the component and waiting out its clock. This is the
 * whole rule, in one function, with its own tests and fake timers.
 *
 * ## Why it REJECTS rather than resolving to a timeout result
 *
 * Every function in `purchase-client.ts` resolves — including failure. A
 * network error comes back as `{ ok: false, status: 0 }`, never as a rejected
 * promise, and that is a documented guarantee of that module. So within this
 * codebase a rejection from a wrapped purchase call has exactly one possible
 * cause, and `TimedOut` names it. The caller distinguishes a ceiling from a
 * network failure by which channel the answer arrived on, with no new shape
 * added to `ClientResult` and no sentinel value for a caller to forget to
 * check. A resolved sentinel would have been silently ignorable; a rejection
 * is not.
 *
 * ## Why `singleFlight` wraps THIS, and not the other way round
 *
 * The dialog builds `singleFlight(withTimeout(work, ms))`. The order decides
 * what a retry does.
 *
 * With the timeout on the inside, the shared promise settles the moment the
 * ceiling fires, so `singleFlight` drops its in-flight slot there and then,
 * and the retry that follows is a genuinely new request that reaches the
 * network.
 *
 * With the timeout on the outside, the still-running request would keep the
 * in-flight slot occupied — the ceiling would have rejected, but the slot
 * would not be free — and the retry would be handed back the same request
 * that already ran past its ceiling. A retry button that re-awaits the request
 * that just failed to answer is a retry button that does nothing.
 *
 * Double-click protection is unaffected: two clicks inside the ceiling still
 * share one request, which is the whole of what `singleFlight` is for.
 */

/**
 * The ceiling fired: the work was still running when its time ran out.
 *
 * A class rather than a string or a flag so a caller can tell it from a real
 * failure with `instanceof` rather than by matching on a message that a future
 * edit is free to reword.
 *
 * It says nothing a buyer should read. The screen that catches this writes its
 * own sentence, because what to say depends on what was being asked for — a
 * hold that may or may not exist reads nothing like a payment that may or may
 * not have gone through.
 */
export class TimedOut extends Error {
  constructor(public readonly ms: number) {
    super(`Timed out after ${ms}ms.`);
    this.name = "TimedOut";
  }
}

/**
 * Wraps `work` so it rejects with `TimedOut` if it has not settled in `ms`.
 *
 * A call that settles first is passed through untouched — its value, or its
 * rejection, exactly as it came — and its timer is cleared, so a call that has
 * already answered can never fire a late ceiling at a screen that has moved on.
 *
 * The work itself is NOT cancelled, because it cannot be: a `fetch` already
 * sent is already sent, and a POST that has reached the server has already
 * done whatever it does. That is a fact the caller has to reckon with, not one
 * this function can hide — a hold attempt that runs past its ceiling may well
 * have created the hold.
 */
export function withTimeout<Args extends unknown[], Result>(
  work: (...args: Args) => Promise<Result>,
  ms: number,
): (...args: Args) => Promise<Result> {
  return (...args: Args): Promise<Result> => {
    // The async wrapper turns a `work` that throws synchronously into a
    // rejected promise, so a bad argument loses the race properly instead of
    // flying past it and leaving a timer armed with nobody waiting on it.
    const started = (async () => work(...args))();

    let timer: ReturnType<typeof setTimeout>;
    const ceiling = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new TimedOut(ms)), ms);
    });

    // `Promise.race` attaches a handler to `started` either way, so a late
    // rejection from work that lost the race is already handled and never
    // surfaces as an unhandled rejection.
    return Promise.race([started, ceiling]).finally(() => clearTimeout(timer));
  };
}
