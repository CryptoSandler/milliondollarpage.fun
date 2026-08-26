import { createHash } from "node:crypto";

/**
 * The name, the key derivation and the endpoint rewrite behind the advisory
 * lock that serialises whole suite runs.
 *
 * Called by `vitest.globalSetup.ts`, which takes the lock before any test file
 * loads and holds it until the run ends, and by
 * `src/lib/__tests__/run-lock.test.ts`, which asserts from inside a running
 * suite that the lock really is held.
 *
 * Its own module rather than three consts inside `vitest.globalSetup.ts` for
 * one reason: the test needs the same name, the same key and the same host
 * rewrite the setup used, and a test that recomputes them by hand proves that
 * the test agrees with itself rather than that the suite is locked. Importing
 * the global-setup file into a worker instead would drag a `pg` Client and a
 * live connection into every test file that touches it.
 */

/** The lock is named after this project: it guards this project's test database. */
export const RUN_LOCK_NAME = "milliondollarpage:test-suite";

/**
 * Hashes `name` to a signed 64-bit integer, returned as a decimal string so it
 * can be bound as a query parameter with no precision loss — a JS `number`
 * cannot represent the full bigint range `pg_advisory_lock(bigint)` accepts,
 * and rounding the key would silently collide two differently-named locks.
 */
export function lockKey(name: string): string {
  return createHash("sha256").update(name, "utf8").digest().readBigInt64BE(0).toString();
}

/**
 * The same database, reached on a dedicated backend instead of through the
 * connection pooler.
 *
 * A `-pooler` host multiplexes over PgBouncer in transaction-pooling mode,
 * where a *session*-level `pg_advisory_lock` is not reliably held by the
 * backend that later statements land on: the lock and the query that expects
 * to be behind it can end up on two different server connections. A run-scoped
 * lock has to outlive every transaction in the run, so it needs a backend of
 * its own — Neon serves one on the same endpoint with `-pooler` dropped from
 * the host.
 *
 * Only the host changes. Credentials, port, database name and query parameters
 * (`sslmode`, `channel_binding`) are carried through untouched, because they
 * are how the connection authenticates and encrypts and none of that differs
 * between the two endpoints.
 */
export function directEndpoint(url: string): string {
  const parsed = new URL(url);
  parsed.host = parsed.host.replace("-pooler.", ".");
  return parsed.toString();
}
