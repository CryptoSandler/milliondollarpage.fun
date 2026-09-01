/**
 * Preconditions a timing-sensitive or browser-driving test needs before it can
 * mean anything.
 *
 * WHO CALLS THIS: `purchase-e2e.test.ts` before it starts a server or a
 * browser, and any test that measures wall time.
 *
 * WHY IT EXISTS. A suite run on this project once reported 45 failures across
 * nine files and took twice as long as usual; an immediate re-run of the same
 * commit passed 872/872. The evidence was lost, so the cause is not known —
 * which is exactly the situation this file is meant to prevent happening again.
 * A test that measures a duration on a machine already doing something else is
 * not measuring the code, and the honest answer is to say the machine was busy
 * rather than to report a failure that reads like a defect.
 *
 * IT REFUSES RATHER THAN SKIPS. A skipped test is green, and green is what a
 * loaded machine must NOT report — the run should stop and say why, so the
 * person re-runs it instead of shipping on a result nobody produced.
 */
import { execFileSync } from "node:child_process";
import { cpus, loadavg } from "node:os";

/**
 * How busy is too busy, as a fraction of a core per CPU.
 *
 * 2.0 IS DELIBERATELY HIGH, and the first draft of this file had it at 0.7.
 * That number was wrong in a way worth writing down: this suite runs its own
 * files concurrently and generates most of the load it would then measure, so a
 * tight ceiling turns healthy runs red — which is a worse failure than the one
 * it was added to catch, because a guard that cries wolf gets deleted.
 *
 * At 2.0 the machine has to be doing roughly twice its own cores' worth of work
 * before this fires, which is the shape of "another project's suite is running"
 * or "a build is going" rather than "this suite is busy being itself".
 *
 * A TIMING TEST SHOULD NOT NEED THIS AT ALL where it can be written relative to
 * a baseline instead — see `base58.test.ts`, which measures a short input on the
 * same machine in the same run and compares the ratio. That is load-independent
 * and strictly better. This ceiling is for stages that cannot do that: the ones
 * that start a server and a browser and wait on them.
 */
const MAX_LOAD_PER_CORE = 2.0;

/**
 * Refuses to continue when this machine is too loaded to time anything.
 *
 * `loadavg()[0]` is the one-minute average, which is the window that matters:
 * a five-minute average still reports a machine that went quiet a minute ago,
 * and this is about the minute the test is about to spend.
 */
export function assertMachineIsQuiet(what: string): void {
  const cores = Math.max(1, cpus().length);
  const load = loadavg()[0];
  const perCore = load / cores;
  if (perCore > MAX_LOAD_PER_CORE) {
    throw new Error(
      `${what} needs a quiet machine and this one is at ${load.toFixed(2)} across ${cores} cores ` +
        `(${perCore.toFixed(2)} per core, ceiling ${MAX_LOAD_PER_CORE}). A duration measured now ` +
        "would be measuring the load, not the code. Stop whatever else is running and re-run.",
    );
  }
}

/** Processes listening on `port`, as "pid command" lines. Empty when free. */
function listenersOn(port: number): string[] {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\n").slice(1).filter(Boolean);
  } catch {
    // lsof exits non-zero when nothing matches, which is the ordinary answer.
    return [];
  }
}

/**
 * Refuses to start a server on a port somebody else is already holding.
 *
 * The failure this replaces is the confusing one: the harness connects to
 * SOMEBODY ELSE'S server — a leftover `next dev`, another project's Playwright,
 * a stale worker — and the tests fail against a build nobody in this run made.
 * That looks like a code defect and is not one.
 *
 * It names the process, because "port in use" without a PID sends the reader to
 * `pkill`, and this repository has already had one project's test run killed by
 * another's `pkill -f vitest`.
 */
export function assertPortIsFree(port: number): void {
  const holders = listenersOn(port);
  if (holders.length > 0) {
    throw new Error(
      `Port ${port} is already held, so this run would drive somebody else's server:\n` +
        holders.map((line) => `  ${line}`).join("\n") +
        "\n\nStop that process BY PID. Never `pkill` by name — that has already " +
        "killed another project's test run on this machine.",
    );
  }
}
