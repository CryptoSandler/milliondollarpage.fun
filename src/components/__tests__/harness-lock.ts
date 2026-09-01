import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";

/**
 * One browser-driving run at a time, across every repository on this machine.
 *
 * WHO CALLS THIS: `purchase-e2e.test.ts`, which is the only suite here that
 * starts a real `next dev` and a real Chrome, and `scripts/capture-board.mts`,
 * which starts the same two for screenshots. Nothing else may take it, and
 * nothing else should: a lock this wide costs other repositories time, and a
 * pure unit run contends for nothing it protects.
 *
 * ## Why the lock is machine-wide and not this project's
 *
 * `~/.claude/GATES.md` is the shared rule and it records the measurement that
 * produced it: a run in `kolscanhispano` took **24.6 minutes and failed two
 * cases that never reproduced** while a stray harness from another project was
 * alive on this machine, green twice on either side. The cost was not the
 * failure — it was that a collision between two repositories **looked like a
 * product bug** and was investigated as one.
 *
 * This repository paid the same bill on 2026-09-01, in the other direction and
 * without a second repository involved: full runs stretched from 18 minutes to
 * **51 and then 110**, with individual tests reporting 900 seconds, and it was
 * diagnosed as a slow database for over an hour before `assertMachineIsQuiet`
 * named it — a `tsc` and a `next build` running in a worktree while the suite
 * measured. Same lesson, one repository: **the thing that makes a timing suite
 * lie is other work on the same machine**, whoever started it.
 *
 * The vitest suites already had the equivalent for their own hazard: a Postgres
 * advisory lock in `vitest.globalSetup.ts`, added after two concurrent runs
 * truncated each other's fixtures. That lock cannot serve here, because
 * browsers and dev servers contend for CPU and ports across repositories that
 * share no database.
 *
 * ## The protocol is copied, not invented
 *
 * Same path, same JSON, same rules as `kolscanhispano/e2e/harness-lock.ts`,
 * which `GATES.md` names as the reference: *"Copy it; do not invent a second
 * protocol, because the whole point is that unrelated repositories agree on one
 * path."* The filename says `playwright` and this repository has no Playwright
 * — it drives Chrome over CDP directly. **The name is the contract**, not a
 * description, and renaming it here would give this machine two locks that do
 * not see each other, which is the failure the file exists to prevent.
 *
 * ## The port is deliberately not checked here
 *
 * `dev-server.ts` already takes a free port and `assertPortIsFree` names the
 * holder by PID if one is somehow taken. What neither can see is another
 * repository's run, and that is the only thing this lock is for.
 */
const LOCK_PATH = "/tmp/claude-playwright-e2e.lock";

type Holder = { pid: number; cwd: string; startedAt: string };

/** Whether a process is alive. Signal 0 tests for existence without signalling. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readHolder(): Holder | null {
  try {
    return JSON.parse(readFileSync(LOCK_PATH, "utf8")) as Holder;
  } catch {
    // Unreadable or malformed is treated as stale: a lockfile nobody can parse
    // protects nothing, and refusing to run because of one would be worse.
    return null;
  }
}

/**
 * Takes the machine-wide harness lock, or refuses **by name**.
 *
 * Refusing fast is the whole design goal. The failure this replaces was not two
 * runs colliding; it was a second run discovering the first twenty minutes
 * later, through assertions that read like defects.
 *
 * A holder whose pid is dead is stale and gets taken over — a crash must not
 * block every repository on this machine until somebody deletes a file they
 * have never heard of.
 */
export function acquireHarnessLock(): void {
  const holder = existsSync(LOCK_PATH) ? readHolder() : null;

  if (holder && alive(holder.pid)) {
    throw new Error(
      `Another browser-driving run holds the machine-wide e2e lock.\n` +
        `  pid ${holder.pid}, started ${holder.startedAt}\n` +
        `  in ${holder.cwd}\n` +
        `Wait for it, or kill that PID — never \`pkill -f\` on a name, which ` +
        `would take every other repository's run down with it (CLAUDE.md, GATES.md).`,
    );
  }

  if (holder) {
    console.warn(`e2e: taking over a stale lock from pid ${holder.pid} (no longer running)`);
    try {
      unlinkSync(LOCK_PATH);
    } catch {
      /* raced with another taker; the exclusive create below decides it */
    }
  }

  // `wx` is the atomic part: two runs racing here, one loses.
  let fd: number;
  try {
    fd = openSync(LOCK_PATH, "wx");
  } catch {
    throw new Error(
      `Another browser-driving run took the e2e lock while this one was starting. ` +
        `Re-run; ${LOCK_PATH} names the holder.`,
    );
  }

  const mine: Holder = {
    pid: process.pid,
    cwd: process.cwd(),
    startedAt: new Date().toISOString(),
  };
  writeSync(fd, JSON.stringify(mine));
  closeSync(fd);
}

/**
 * Gives it back.
 *
 * Called from `afterAll`, which vitest runs **even when the suite fails** —
 * the same guarantee Playwright's `globalTeardown` gives, and the reason the
 * reference implementation puts it there. A run only ever releases a lock whose
 * pid is its own: a stale-lock takeover elsewhere could otherwise have this run
 * delete a lock that now belongs to somebody else.
 */
export function releaseHarnessLock(): void {
  const holder = readHolder();
  if (holder && holder.pid !== process.pid) return;
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    /* already gone */
  }
}
