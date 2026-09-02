/**
 * Preconditions a timing-sensitive or browser-driving test needs before it can
 * mean anything.
 *
 * WHO CALLS THIS: `purchase-e2e.test.ts` before it starts a server or a
 * browser, any test that measures wall time, and — for
 * `assertNoForeignSuite` — `vitest.globalSetup.ts`, once, before the first
 * test file loads.
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
import { readFileSync } from "node:fs";
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

/**
 * The machine-wide e2e lock, which a browser-driving run in ANY repository on
 * this machine holds for its whole duration. Same path and same JSON as
 * `harness-lock.ts` next door, read here rather than imported because this file
 * must not acquire anything — it only asks whether somebody else has.
 */
const HARNESS_LOCK = "/tmp/claude-playwright-e2e.lock";

/** Alive, without signalling it. Same test `harness-lock.ts` uses. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Every process on this machine, as `{ pid, ppid, command }`. */
function processTable(): { pid: number; ppid: number; command: string }[] {
  const out = execFileSync("ps", ["-axo", "pid=,ppid=,command="], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const rows: { pid: number; ppid: number; command: string }[] = [];
  for (const line of out.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (match) rows.push({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] });
  }
  return rows;
}

/**
 * Refuses to start a run while another repository's suite or browser is alive.
 *
 * ## The failure this exists to stop reporting as a defect
 *
 * Measured on 2026-09-02, three runs of the same commit — one comment apart:
 * **1269s green, 2883s with three failures, 6249s with nine.** Every failure was
 * `Connection terminated unexpectedly` or `ECONNRESET`, in the files that use
 * the database hardest, and none of them touched the code that had changed.
 *
 * The cause is a chain rather than a flake. Another project's suite takes the
 * cores; this run's worker waits for CPU; the wait exceeds Neon's idle timeout,
 * around five minutes, and the server closes the connection; the next query on
 * it fails. The run then reads as a red suite, and a red suite that is nobody's
 * defect is a run somebody repeats until it goes green — which is the exact
 * habit `~/.claude/GATES.md` exists to refuse.
 *
 * ## What counts as "running", and what deliberately does not
 *
 * A foreign **vitest** process, and the machine-wide browser lock held by a
 * live PID that is not in this run's tree. Those are the two shapes of "another
 * suite is working right now".
 *
 * **A headless Chrome on its own is not one of them**, and that was the first
 * draft. Run against this machine it named six — orphans with `ppid 1`,
 * **six days old**, from another repository's harness, at **0.0% CPU and 497 MB
 * between them**. They are a leak worth reporting and they are not contention:
 * blocking every run in this repository on somebody else's week-old zombie is
 * how a guard earns a reputation for crying wolf, which is how it gets deleted
 * and takes the real check with it. A browser that somebody is DRIVING holds
 * the lock; a browser nobody is driving holds only memory.
 *
 * ## Why a process check rather than the load average
 *
 * `waitForMachineQuiet` above reads `loadavg()[0]`, which is a decaying mean:
 * measured in this repository, it kept reporting load 125 seconds after the
 * load had stopped. That lag is the right trade for a stage that only needs the
 * machine quiet for the next ninety seconds. It is the wrong instrument for
 * "is another suite RUNNING right now", where the answer is a process and the
 * evidence is a PID.
 *
 * ## It refuses, and it never kills
 *
 * The message names each PID and its command. It does not offer to stop
 * anything, because `pkill -f vitest` on this machine has already killed
 * another repository's run — CLAUDE.md and `~/.claude/GATES.md` both carry the
 * incident. Killing is the reader's decision, by PID.
 */
export function assertNoForeignSuite(): void {
  const table = processTable();
  const byPid = new Map(table.map((row) => [row.pid, row]));

  /*
    OURS IS THIS PROCESS, WHAT IT SPAWNED, AND THE CHAIN THAT SPAWNED IT — and
    deliberately NOT the chain's other children.

    The ancestors are needed because `npm test` and the `sh -c vitest run`
    under it both carry the word this looks for, and a run that refused because
    of its own wrapper would never start. The descendants are needed because
    vitest's workers are this process's children.

    Expanding descendants from the ANCESTORS as well is the version this had
    first, and it was silently useless: every session on this machine shares a
    shell somewhere up the chain, so every other repository's suite came out as
    "ours" and the guard reported quiet on a machine with three runs on it.
    Caught by pointing it at a decoy — a copy of `sleep` named `vitest-decoy`,
    started from the same shell — which it declared quiet.
  */
  const ours = new Set<number>();
  for (let pid: number | undefined = process.pid; pid && pid > 1; pid = byPid.get(pid)?.ppid) {
    if (ours.has(pid)) break;
    ours.add(pid);
  }
  const mine = new Set<number>([process.pid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of table) {
      if (!mine.has(row.pid) && mine.has(row.ppid)) {
        mine.add(row.pid);
        ours.add(row.pid);
        grew = true;
      }
    }
  }

  /*
    A FOREIGN `vitest` IS NO LONGER ONE OF THESE, and that is the whole change
    `suite-lock.ts` made. A second suite now QUEUES on the machine lock instead
    of racing, so a live foreign vitest is a run waiting its turn — refusing
    because of it would refuse because somebody is politely waiting.

    What is left is what the lock cannot see: a run driving a browser. Those
    repositories take `/tmp/claude-playwright-e2e.lock` rather than the suite
    lock, they compete for the same cores, and there is nothing in a process
    table that reliably distinguishes a Playwright run from Playwright's
    long-lived `test-server` — two of which were sitting on this machine at 1
    day 5 hours and 7 hours, both at 0.0% CPU. So the lock file is the signal,
    and the process table is not consulted for this at all.
  */
  const foreign: { pid: number; ppid: number; command: string }[] = [];

  // A browser-driving run in another repository holds this whether or not its
  // command line says "playwright" — it is the signal that costs nothing, names
  // the repository as well as the PID, and cannot be confused with a server
  // that is merely open.
  try {
    const held = JSON.parse(readFileSync(HARNESS_LOCK, "utf8")) as { pid: number; cwd: string };
    if (held.pid !== process.pid && !ours.has(held.pid) && alive(held.pid)) {
      foreign.push({ pid: held.pid, ppid: 0, command: `browser harness in ${held.cwd}` });
    }
  } catch {
    // No lock file, or an unreadable one. Nothing to report either way.
  }

  if (foreign.length === 0) return;

  throw new Error(
    "Another suite or browser is running on this machine, so this run would be measuring " +
      "the contention rather than the code:\n" +
      foreign.map((row) => `  pid ${row.pid}  ${row.command.slice(0, 140)}`).join("\n") +
      "\n\nMeasured here on 2026-09-02: the same commit took 1269s green, then 2883s with three " +
      "failures, then 6249s with nine — every failure a dropped Postgres connection, from workers " +
      "waiting on CPU for longer than Neon's idle timeout.\n" +
      "Wait for it, or stop it BY PID. Never `pkill` by name: that has already killed another " +
      "project's test run on this machine.",
  );
}
