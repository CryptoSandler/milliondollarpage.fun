import { describe, expect, it } from "vitest";
import { cpus } from "node:os";
import { waitForMachineQuiet } from "./machine";

/**
 * The precondition that waits, and the two ends of it.
 *
 * WHY THIS IS DRIVEN THROUGH SEAMS AND NOT THROUGH REAL LOAD. The end-to-end
 * validation is real — synthetic load raised over the ceiling and dropped
 * halfway through the wait, recorded in the commit that added this. What that
 * cannot do is prove the give-up branch, because proving it honestly means
 * holding a machine above its ceiling for ten minutes. So the timings and the
 * load reading are parameters, every default is the real value, and both
 * branches are settled here in milliseconds.
 *
 * THE ONE THING THESE TESTS EXIST TO PIN is that the ceiling is never the thing
 * that moves. A future pass under time pressure will be tempted to widen it
 * rather than wait; `refuses rather than relaxing` below is what makes that a
 * failing test.
 */

const CORES = Math.max(1, cpus().length);

/** A load reading that walks a fixed script, one value per poll. */
function readings(perCore: number[]): () => number {
  let at = 0;
  return () => perCore[Math.min(at++, perCore.length - 1)] * CORES;
}

describe("waitForMachineQuiet", () => {
  it("costs nothing at all on a machine that is already quiet", async () => {
    const started = Date.now();
    const said: string[] = [];

    await waitForMachineQuiet("A suite", {
      ceiling: 2,
      pollMs: 5_000,
      maxWaitMs: 60_000,
      readLoad: readings([0.4]),
      onWait: (message) => said.push(message),
    });

    // No opening sleep: a precondition that costs fifteen seconds on every
    // green run is one people find ways around.
    expect(Date.now() - started).toBeLessThan(200);
    // And it says nothing, because there was nothing to say.
    expect(said).toEqual([]);
  });

  it("waits, then measures, as soon as the load drops under the ceiling", async () => {
    const said: string[] = [];

    await waitForMachineQuiet("A suite", {
      ceiling: 2,
      pollMs: 10,
      maxWaitMs: 5_000,
      // Over the ceiling for three polls, then under it. The drop is what it
      // is waiting for, and it must proceed on the first reading that clears.
      readLoad: readings([3.1, 2.9, 2.4, 0.8]),
      onWait: (message) => said.push(message),
    });

    expect(said).toHaveLength(2);
    expect(said[0]).toContain("is waiting for this machine to go quiet");
    expect(said[0]).toContain("ceiling 2");
    expect(said[1]).toContain("the machine went quiet");
  });

  it("says it is waiting exactly once, however long the wait is", async () => {
    const said: string[] = [];

    await waitForMachineQuiet("A suite", {
      ceiling: 2,
      pollMs: 1,
      maxWaitMs: 5_000,
      readLoad: readings([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 0.5]),
      onWait: (message) => said.push(message),
    });

    // One line for the wait and one for the recovery. Forty lines of "still
    // waiting" would bury the one that matters.
    expect(said.filter((m) => m.includes("is waiting"))).toHaveLength(1);
  });

  it("refuses rather than relaxing, when the load never comes down", async () => {
    const started = Date.now();

    await expect(
      waitForMachineQuiet("The end-to-end suite", {
        ceiling: 2,
        pollMs: 10,
        maxWaitMs: 60,
        readLoad: readings([4.5]),
      }),
    ).rejects.toThrow(/needs a quiet machine/);

    // It gave up at its cap rather than hanging. A precondition with no cap is
    // a hang, and a hang cannot be told from a slow test.
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("says what it measured, what the ceiling is, and how long it waited", async () => {
    const failure = await waitForMachineQuiet("The end-to-end suite", {
      ceiling: 2,
      pollMs: 10,
      maxWaitMs: 40,
      readLoad: readings([4.5]),
    }).catch((error: Error) => error.message);

    expect(failure).toContain(`${(4.5 * CORES).toFixed(2)} across ${CORES} cores`);
    expect(failure).toContain("4.50 per core");
    expect(failure).toContain("ceiling 2");
    expect(failure).toMatch(/after waiting \d+s/);
    // And what to do about it, in the terms this machine's rules use.
    expect(failure).toContain("BY PID");
  });

  it("keeps the real ceiling at 2.0 per core", async () => {
    // The number is not a parameter of the design; it is the design. A pass
    // that widened it would be reporting green on the condition the guard
    // exists to catch, so the default is pinned here rather than trusted.
    const failure = await waitForMachineQuiet("A suite", {
      pollMs: 5,
      maxWaitMs: 20,
      readLoad: readings([2.01]),
    }).catch((error: Error) => error.message);

    expect(failure).toContain("ceiling 2");

    await expect(
      waitForMachineQuiet("A suite", {
        pollMs: 5,
        maxWaitMs: 20,
        readLoad: readings([1.99]),
      }),
    ).resolves.toBeUndefined();
  });
});
