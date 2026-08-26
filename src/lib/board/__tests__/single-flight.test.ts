import { describe, expect, it, vi } from "vitest";
import { singleFlight } from "../single-flight";

/**
 * Pure, no database, no DOM. Every test here drives the wrapper with a
 * deferred promise it resolves by hand, so "while a call is in flight" is an
 * actual state the test controls rather than a timing accident.
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

describe("singleFlight", () => {
  it("runs the underlying function ONCE for two overlapping calls, and both get the same result", async () => {
    const gate = deferred<string>();
    const work = vi.fn(() => gate.promise);
    const call = singleFlight(work);

    // The double click: both happen before anything settles.
    const first = call();
    const second = call();

    expect(work, "a second click must not start a second request").toHaveBeenCalledTimes(1);

    gate.resolve("order-1");
    expect(await first).toBe("order-1");
    expect(await second).toBe("order-1");
  });

  it("hands every waiter the same promise, not a copy of the answer", async () => {
    const gate = deferred<number>();
    const call = singleFlight(() => gate.promise);

    const first = call();
    const second = call();
    expect(second).toBe(first);

    gate.resolve(1);
    await first;
  });

  it("starts a fresh run for a call made AFTER the first settles", async () => {
    const work = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const call = singleFlight(work);

    expect(await call()).toBe("first");
    expect(await call()).toBe("second");
    expect(work, "this is not a cache; a later click is a new attempt").toHaveBeenCalledTimes(2);
  });

  it("ignores the arguments of a call that joins one already in flight", async () => {
    const gate = deferred<string>();
    const work = vi.fn((label: string) => {
      void label;
      return gate.promise;
    });
    const call = singleFlight(work);

    const first = call("a");
    const second = call("b");
    expect(work).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledWith("a");

    gate.resolve("done");
    expect(await second).toBe("done");
    await first;
  });

  it("propagates a rejection to EVERY waiting caller", async () => {
    const gate = deferred<string>();
    const call = singleFlight(() => gate.promise);

    const first = call();
    const second = call();
    gate.reject(new Error("network down"));

    await expect(first).rejects.toThrow("network down");
    await expect(second).rejects.toThrow("network down");
  });

  it("does not poison later calls after a rejection", async () => {
    const work = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce("recovered");
    const call = singleFlight(work);

    await expect(call()).rejects.toThrow("network down");

    // The whole point of retry: a failed attempt must free the slot rather
    // than leaving the button permanently jammed on a promise that will never
    // settle again.
    expect(await call()).toBe("recovered");
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("turns a synchronous throw into a rejection, and still frees the slot", async () => {
    const work = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("bad arguments");
      })
      .mockResolvedValueOnce("fine");
    const call = singleFlight(work);

    await expect(call()).rejects.toThrow("bad arguments");
    expect(await call()).toBe("fine");
  });

  it("keeps two wrapped functions independent of each other", async () => {
    const firstGate = deferred<string>();
    const secondWork = vi.fn().mockResolvedValue("b");
    const callFirst = singleFlight(() => firstGate.promise);
    const callSecond = singleFlight(secondWork);

    const pending = callFirst();
    expect(await callSecond()).toBe("b");

    firstGate.resolve("a");
    expect(await pending).toBe("a");
  });
});
