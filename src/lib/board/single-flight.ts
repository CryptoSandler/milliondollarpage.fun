/**
 * One request per click, however many clicks arrive.
 *
 * A buyer who double-clicks Buy sends two POSTs a few milliseconds apart. The
 * second one loses the exclusion constraint to the first and comes back 409 —
 * a refusal caused entirely by the buyer's own first click, which is the
 * worst kind of error message this site can produce.
 *
 * A `disabled` flag on the button is the visible half of the fix, and it is
 * not sufficient on its own: the flag is React state, so it takes a render to
 * appear, and two clicks inside one frame both see the old value. This is the
 * half that holds regardless — while a call is in flight, every further call
 * is handed the SAME promise instead of starting a second one.
 *
 * It lives here rather than as a `useRef` boolean inside the dialog because a
 * boolean buried in a component is a thing you can only test by rendering the
 * component. This is the whole rule, in one function, with its own tests.
 *
 * Deliberately NOT a cache. The shared promise is dropped the moment it
 * settles, success or failure: a click after the first attempt finished is a
 * new attempt and must reach the network. It is also not keyed by arguments —
 * the wrapped call is "the purchase this dialog is making", and a second one
 * with different arguments while the first is still open would be a bug in
 * the caller, not a case to serve from here.
 */
export function singleFlight<Args extends unknown[], Result>(
  work: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  let inFlight: Promise<Result> | null = null;

  return (...args: Args): Promise<Result> => {
    if (inFlight) return inFlight;

    // The async wrapper turns a `work` that throws synchronously into a
    // rejected promise like any other failure. Without it such a throw would
    // fly past every waiter and leave `inFlight` unset in an inconsistent way.
    const shared = (async () => work(...args))().finally(() => {
      inFlight = null;
    });

    inFlight = shared;
    return shared;
  };
}
