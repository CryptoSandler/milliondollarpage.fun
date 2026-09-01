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
 *
 * IT WAITS BEFORE IT REFUSES, AND THE CEILING NEVER MOVES. See
 * `waitForMachineQuiet`. `~/.claude/GATES.md`: *a resource precondition waits
 * with a cap, never relaxes.*
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

/** How often the load is re-read while waiting. */
const POLL_MS = 15_000;

/**
 * How long this will wait for the machine to go quiet before giving up.
 *
 * Ten minutes, and the cap is the whole point of the design rather than a
 * detail of it. A precondition with no cap is a hang, and a hang is worse than
 * a refusal because nobody can tell it from a slow test. A precondition that
 * relaxes its ceiling instead of waiting is a guard that reports green on the
 * exact condition it exists to catch.
 */
const MAX_WAIT_MS = 10 * 60 * 1_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for this machine to go quiet, then lets the caller measure — and
 * refuses, loudly, if it never does.
 *
 * ## Why this replaced a straight assertion
 *
 * `assertMachineIsQuiet` read the load once and threw. That was right about the
 * ceiling and wrong about the moment: this machine runs several agent sessions
 * at once, so a load spike is usually somebody else compiling for ninety
 * seconds, not a condition that will still be true when the browser starts. A
 * one-shot check turns a ninety-second spike into a failed run, and a failed
 * run that is nobody's defect is how a guard earns a reputation for crying
 * wolf — which is how it gets deleted, and the ceiling with it.
 *
 * So it waits. **What it never does is relax.** The ceiling stays
 * `MAX_LOAD_PER_CORE`, decided on evidence and not on convenience; the only
 * thing that moved is that a temporary breach now costs time instead of a red
 * run. `~/.claude/GATES.md` records that as the shared rule for every
 * repository here: *a resource precondition waits with a cap, never relaxes.*
 *
 * ## The first look is immediate
 *
 * A machine that is already quiet — the ordinary case — pays nothing. There is
 * no opening sleep, because a precondition that costs fifteen seconds on every
 * green run is a precondition people find ways around.
 *
 * ## `loadavg()[0]` lags, and polling faster than it does not help
 *
 * The one-minute average is a decaying mean, so it keeps reporting a machine
 * that went quiet long after it did, and polling every fifteen seconds is
 * therefore finer than the signal it reads. MEASURED, rather than assumed: 30
 * synthetic spinners on 10 cores, killed at 45 seconds, and this function
 * resumed at 170 — it waited **125 seconds longer than the load actually
 * lasted**. That is the honest cost of using the only number the kernel offers
 * without sampling `/proc` ourselves, and it is why the cap is ten minutes and
 * not two. It is still the right
 * window — the five-minute average would have this waiting on load that ended
 * four minutes ago.
 *
 * ## The refusal says what it tried
 *
 * Measured load, cores, per-core, the ceiling, **and how long it waited**. The
 * last one is new and it is the one that tells a reader whether to re-run or to
 * go and find what is eating the machine.
 *
 * The seams — ceiling, poll, cap, and the load reading itself — are parameters
 * so both branches can be driven deterministically by a test in milliseconds
 * instead of ten minutes. Every default is the real value.
 */
export async function waitForMachineQuiet(
  what: string,
  options: {
    ceiling?: number;
    pollMs?: number;
    maxWaitMs?: number;
    readLoad?: () => number;
    onWait?: (message: string) => void;
  } = {},
): Promise<void> {
  const ceiling = options.ceiling ?? MAX_LOAD_PER_CORE;
  const pollMs = options.pollMs ?? POLL_MS;
  const maxWaitMs = options.maxWaitMs ?? MAX_WAIT_MS;
  const readLoad = options.readLoad ?? (() => loadavg()[0]);
  const announce = options.onWait ?? ((message: string) => console.warn(message));

  const cores = Math.max(1, cpus().length);
  const startedAt = Date.now();
  let load = readLoad();
  let announced = false;

  while (load / cores > ceiling) {
    const waited = Date.now() - startedAt;

    if (waited >= maxWaitMs) {
      throw new Error(
        `${what} needs a quiet machine and this one is at ${load.toFixed(2)} across ${cores} cores ` +
          `(${(load / cores).toFixed(2)} per core, ceiling ${ceiling}) after waiting ` +
          `${Math.round(waited / 1_000)}s. A duration measured now would be measuring the load, ` +
          "not the code. Find what is running and stop it BY PID, then re-run.",
      );
    }

    if (!announced) {
      // Once, not every poll: a line every fifteen seconds for ten minutes is
      // forty lines of noise around the one that matters.
      announce(
        `${what} is waiting for this machine to go quiet — ${load.toFixed(2)} across ${cores} ` +
          `cores (${(load / cores).toFixed(2)} per core, ceiling ${ceiling}). ` +
          `Giving up after ${Math.round(maxWaitMs / 1_000)}s.`,
      );
      announced = true;
    }

    await sleep(Math.min(pollMs, maxWaitMs - waited));
    load = readLoad();
  }

  if (announced) {
    announce(
      `${what}: the machine went quiet at ${load.toFixed(2)} ` +
        `(${(load / cores).toFixed(2)} per core) after ${Math.round((Date.now() - startedAt) / 1_000)}s.`,
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
