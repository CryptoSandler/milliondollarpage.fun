import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { singleFlight } from "../single-flight";
import { TimedOut, withTimeout } from "../with-timeout";

/**
 * Pure, no database, no DOM, and no real waiting: fake timers mean the ten
 * second ceiling is asserted in microseconds. Every test drives the wrapper
 * with a deferred promise it settles by hand, so "still in flight when the
 * ceiling fired" is a state the test controls rather than a timing accident.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * The rejection a promise ends in, with the handler attached NOW.
 *
 * Winding a fake clock forward and only then writing the assertion would
 * leave the rejection momentarily unhandled, which Node reports and Vitest
 * fails the run over. That is an artefact of driving time by hand — a real
 * caller does `await call(...)` and is already waiting — so every test here
 * hands its promise to this the moment it exists, and advances the clock
 * afterwards.
 */
function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    (value) => {
      throw new Error(`expected a rejection, got ${JSON.stringify(value)}`);
    },
    (error: unknown) => error,
  );
}

const CEILING_MS = 10_000;

// What a network failure looks like coming out of purchase-client: a RESOLVED
// value, never a rejection. That is the property a caller tells a ceiling
// apart by, so it is restated here rather than assumed.
const NETWORK_FAILURE = { ok: false as const, status: 0, message: "Could not reach the server." };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("passes through the value of a call that settles before the ceiling", async () => {
    const call = withTimeout(async () => "order-1", CEILING_MS);
    expect(await call()).toBe("order-1");
  });

  it("passes the arguments straight through", async () => {
    const work = vi.fn(async (rect: string, pubkey: string) => `${rect}/${pubkey}`);
    const call = withTimeout(work, CEILING_MS);

    expect(await call("10x10", "wallet")).toBe("10x10/wallet");
    expect(work).toHaveBeenCalledWith("10x10", "wallet");
  });

  it("rejects with TimedOut once the work runs past the ceiling, and not a millisecond before", async () => {
    const gate = deferred<string>();
    const pending = withTimeout(() => gate.promise, CEILING_MS)();

    let done = false;
    const outcome = rejection(pending).finally(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(CEILING_MS - 1);
    expect(done, "the ceiling must not fire early").toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const error = await outcome;
    expect(error).toBeInstanceOf(TimedOut);
    expect(error).toMatchObject({ ms: CEILING_MS });

    gate.resolve("the request, answering far too late");
  });

  it("gives the caller a ceiling it can tell apart from a network failure", async () => {
    // A network failure RESOLVES — purchase-client never lets a rejection
    // escape — so the two arrive on different channels, and telling them
    // apart needs no message matching and no sentinel value.
    const failed = await withTimeout(async () => NETWORK_FAILURE, CEILING_MS)();
    expect(failed).toEqual(NETWORK_FAILURE);

    const outcome = rejection(withTimeout(() => new Promise<never>(() => {}), CEILING_MS)());
    await vi.advanceTimersByTimeAsync(CEILING_MS);
    expect(await outcome).toBeInstanceOf(TimedOut);
  });

  it("propagates a rejection from before the ceiling unchanged", async () => {
    const boom = new Error("the wrapped call blew up");
    const error = await rejection(
      withTimeout(async () => {
        throw boom;
      }, CEILING_MS)(),
    );

    // The SAME error object, not a TimedOut wrapping it: a real failure must
    // reach the caller as itself.
    expect(error).toBe(boom);
    expect(error).not.toBeInstanceOf(TimedOut);
  });

  it("turns a synchronous throw into a rejection rather than losing the race to it", async () => {
    const call = withTimeout(() => {
      throw new Error("bad arguments");
    }, CEILING_MS);

    await expect(call()).rejects.toThrow("bad arguments");
    expect(vi.getTimerCount(), "a synchronous throw must not leave a timer armed").toBe(0);
  });

  it("clears the timer when the work settles first, so a settled call cannot fire a late ceiling", async () => {
    const call = withTimeout(async () => "answered", CEILING_MS);
    expect(await call()).toBe("answered");

    expect(vi.getTimerCount(), "the ceiling's timer must be gone once the work answered").toBe(0);

    // Nothing left to fire: well past the ceiling, and no rejection appears.
    await vi.advanceTimersByTimeAsync(CEILING_MS * 3);
  });

  it("clears the timer when the work REJECTS first too", async () => {
    const call = withTimeout(async () => {
      throw new Error("network down");
    }, CEILING_MS);

    await expect(call()).rejects.toThrow("network down");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(CEILING_MS * 3);
  });
});

/**
 * The order the dialog composes these in — `singleFlight(withTimeout(work))`,
 * single-flight OUTSIDE, ceiling INSIDE — and why it is that way round rather
 * than the other.
 */
describe("withTimeout composed under singleFlight, the way PurchaseDialog builds it", () => {
  it("still collapses a double click into one request", async () => {
    const gate = deferred<string>();
    const work = vi.fn(() => gate.promise);
    const call = singleFlight(withTimeout(work, CEILING_MS));

    const first = call();
    const second = call();
    expect(work, "the ceiling must not cost us the double-click guard").toHaveBeenCalledTimes(1);

    gate.resolve("order-1");
    expect(await first).toBe("order-1");
    expect(await second).toBe("order-1");
  });

  it("rejects every waiter with TimedOut when the shared request runs past the ceiling", async () => {
    const work = vi.fn(() => new Promise<string>(() => {}));
    const call = singleFlight(withTimeout(work, CEILING_MS));

    const first = rejection(call());
    const second = rejection(call());
    await vi.advanceTimersByTimeAsync(CEILING_MS);

    expect(await first).toBeInstanceOf(TimedOut);
    expect(await second).toBeInstanceOf(TimedOut);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("frees the in-flight slot at the ceiling, so a RETRY reaches the network", async () => {
    // The request that timed out is still running — a fetch already sent
    // cannot be recalled — and whether the slot it occupies is freed anyway
    // decides whether the retry button does anything at all.
    const stillRunning = deferred<string>();
    const work = vi
      .fn()
      .mockImplementationOnce(() => stillRunning.promise)
      .mockImplementationOnce(async () => "from the retry");
    const call = singleFlight(withTimeout(work, CEILING_MS));

    const stalled = rejection(call());
    await vi.advanceTimersByTimeAsync(CEILING_MS);
    expect(await stalled).toBeInstanceOf(TimedOut);

    expect(await call(), "the retry must be a new request, not the stalled one re-awaited").toBe(
      "from the retry",
    );
    expect(work).toHaveBeenCalledTimes(2);

    stillRunning.resolve("the first request, answering far too late");
  });

  it("is the WRONG way round when singleFlight is on the inside: the retry never reaches the network", async () => {
    // Kept as a test because it is the whole argument for the order above. If
    // this ever starts behaving like the case above, the reason for the
    // nesting has evaporated and the comment in with-timeout.ts is stale.
    const stillRunning = deferred<string>();
    const work = vi.fn().mockImplementationOnce(() => stillRunning.promise);
    const call = withTimeout(singleFlight(work), CEILING_MS);

    const stalled = rejection(call());
    await vi.advanceTimersByTimeAsync(CEILING_MS);
    expect(await stalled).toBeInstanceOf(TimedOut);

    // The slot is still held by the request that never answered, so the retry
    // is handed that same request back and runs out its ceiling all over
    // again instead of asking anybody anything.
    const retry = rejection(call());
    await vi.advanceTimersByTimeAsync(CEILING_MS);
    expect(await retry).toBeInstanceOf(TimedOut);
    expect(work, "no second request was ever sent").toHaveBeenCalledTimes(1);

    stillRunning.resolve("far too late");
  });
});
