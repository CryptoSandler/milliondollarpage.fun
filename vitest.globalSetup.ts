import { config } from "dotenv";
import { Client } from "pg";
import { assertNoForeignSuite } from "./src/components/__tests__/machine";
import { RUN_LOCK_NAME, directEndpoint, lockKey } from "./src/lib/run-lock";
import { takeSuiteLock, type SuiteLock } from "./suite-lock";

/**
 * Serialises whole suite runs against the shared test database.
 *
 * Called by `vitest.config.mts`, which names this file as `globalSetup`, so it
 * runs once in the main process before any test file loads and once more after
 * the last one finishes.
 *
 * `vitest.setup.ts` truncates every table before each test, so two runs at once
 * delete each other's fixtures mid-assertion and report failures that have
 * nothing to do with the code under test. That is not hypothetical: it has
 * already cost a reviewer on this project twelve phantom failures. Until now
 * the mitigation was a sentence in `.claude/commands/cierre.md` asking people
 * not to do it, which is the wrong shape for the problem — a condition that can
 * be warned about can be forgotten. This makes the second run *wait*.
 *
 * It blocks rather than skipping, and that is the whole difference between this
 * and a cron guard: a scheduled job that finds the lock taken should give up,
 * because another copy is already doing the work. A suite run that gave up
 * would report nothing while looking like it passed. So it queues, with a
 * `lock_timeout` underneath so a stuck holder ends in a message naming the
 * cause instead of an indefinite hang.
 *
 * ponytail: a file lock (`flock`, `proper-lockfile`) is fewer lines and would
 * serialise the sessions on this laptop. It is a database lock because the
 * resource being protected is the database — a run from CI or from a second
 * machine walks straight past a file lock and truncates the fixtures anyway.
 */

/**
 * How long to queue behind other runs before giving up. A full suite is about
 * eight and a half minutes against Neon, so this leaves room for two ahead of
 * us and then fails with a real message rather than hanging until someone
 * notices. Raise it if a third session becomes normal; do not remove it.
 */
const WAIT_TIMEOUT_MS = 20 * 60 * 1000;

let client: Client | undefined;
let suiteLock: SuiteLock | undefined;

export async function setup(): Promise<void> {
  config({ path: ".env.local" });

  /*
    THREE LOCKS, IN THIS ORDER, EACH ANSWERING A DIFFERENT QUESTION.

    1. The MACHINE lock: is any other measuring suite running anywhere on this
       machine? It WAITS rather than refusing, because queueing costs the same
       wall clock as a manual re-run and needs nobody. This is what stops a
       worker waiting for CPU past Postgres's idle timeout and coming back to a
       closed connection — the failure that read as nine database bugs on
       2026-09-02. `suite-lock.ts` has the numbers.

    2. `assertNoForeignSuite`: the net for the one thing the lock cannot see —
       a browser-driving run in another repository, which competes for the same
       cores without ever running vitest. It refuses rather than waits, because
       the browser harness has its own lock and its own queue.

    3. The DATABASE lock below: is another run of THIS suite using THIS
       database? A file lock cannot answer that from a second machine, which is
       why it is still here and still last.
  */
  suiteLock = await takeSuiteLock();
  assertNoForeignSuite();

  const url = process.env.TEST_DATABASE_URL?.trim();
  // Never interpolate the value into the message: this string reaches logs.
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. The suite truncates every table, so it " +
        "refuses to run without a database that is explicitly disposable.",
    );
  }

  // Deliberately NOT the pool from src/lib/db.ts: that pool is built from
  // DATABASE_URL, is shared, and hands a different backend to every query.
  // This lock needs one connection it keeps for the whole run.
  client = new Client({ connectionString: directEndpoint(url) });
  // Without a listener a dropped connection is an uncaught exception rather
  // than a rejected query, which would take the runner down. Mirrors the
  // pool's handler in db.ts.
  client.on("error", () => {});
  await client.connect();

  const key = lockKey(RUN_LOCK_NAME);
  const { rows } = await client.query<{ got: boolean }>(
    "SELECT pg_try_advisory_lock($1::bigint) AS got",
    [key],
  );
  if (rows[0].got) return;

  const startedAt = Date.now();
  console.log("Another run of this suite holds the test database. Waiting for it to finish...");
  // lock_timeout applies to advisory-lock waits, so a stuck holder surfaces as
  // an error with a name attached instead of an indefinite hang.
  await client.query(`SET lock_timeout = ${WAIT_TIMEOUT_MS}`);
  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [key]);
  } catch (error) {
    await client.end().catch(() => {});
    client = undefined;
    throw new Error(
      `Gave up after ${Math.round(WAIT_TIMEOUT_MS / 60_000)} minutes waiting for another run ` +
        `of this suite to release the test database. Check for a stray 'vitest run' before ` +
        `retrying. (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  console.log(`Waited ${Math.round((Date.now() - startedAt) / 1000)}s for the test database.`);
}

export async function teardown(): Promise<void> {
  // Closing the connection releases the session lock, so there is no unlock
  // call to forget — and it is also what frees the lock when a run is killed
  // rather than exiting cleanly.
  await client?.end().catch(() => {});
  client = undefined;
  // Same property, one layer out: closing the descriptor releases the machine
  // lock, and so does the process dying.
  suiteLock?.release();
  suiteLock = undefined;
}
