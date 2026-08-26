import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { RUN_LOCK_NAME, directEndpoint, lockKey } from "../run-lock";

// A URL shaped exactly like the real TEST_DATABASE_URL — a Neon pooler host,
// six labels deep, with credentials, a database name and the two query
// parameters the real one carries. Every value in it is invented. The real
// connection string is never printed, never asserted against and never
// committed; what is under test is the rewrite, and a fake with the same shape
// exercises it identically.
const POOLED = "postgresql://board_owner:npg_S3cr3t-t0ken@ep-still-fog-12345678-pooler.c-2.us-east-1.aws.neon.tech/milliondollarpage?sslmode=require&channel_binding=require";
const DIRECT = "postgresql://board_owner:npg_S3cr3t-t0ken@ep-still-fog-12345678.c-2.us-east-1.aws.neon.tech/milliondollarpage?sslmode=require&channel_binding=require";

const clients: Client[] = [];

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end().catch(() => {})));
});

describe("the run lock", () => {
  // THE POINT OF THIS FILE.
  //
  // While this suite is running, vitest.globalSetup.ts holds the run lock on a
  // session of its own. A second `npm test` blocks in that setup instead of
  // truncating these fixtures. This test opens its own direct connection —
  // its own session, which is what makes it a fair stand-in for that second
  // run — and asserts it CANNOT take the same key. A pass means the lock is
  // held for the duration of the run; the moment globalSetup stops taking it,
  // or takes it through the pooler where the backend is not the one that keeps
  // it, this fails.
  it("is held for the whole run, so a second run cannot take it", async () => {
    const url = process.env.TEST_DATABASE_URL?.trim();
    expect(url, "TEST_DATABASE_URL must be set for the suite to run at all").toBeTruthy();

    const client = new Client({ connectionString: directEndpoint(url!) });
    client.on("error", () => {});
    clients.push(client);
    await client.connect();

    const { rows } = await client.query<{ got: boolean }>(
      "SELECT pg_try_advisory_lock($1::bigint) AS got",
      [lockKey(RUN_LOCK_NAME)],
    );

    // Hand it straight back if it was somehow free, so a failure here does not
    // leave this session holding the lock every later run would queue behind.
    if (rows[0].got) {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockKey(RUN_LOCK_NAME)]);
    }

    expect(rows[0].got, "globalSetup should be holding the run lock right now").toBe(false);
  });

  it("derives a stable key inside the signed 64-bit range", () => {
    const key = lockKey(RUN_LOCK_NAME);

    expect(key).toBe(lockKey(RUN_LOCK_NAME));
    expect(key).toMatch(/^-?\d+$/);
    // pg_advisory_lock takes a bigint, and a key outside the range is an error
    // from Postgres rather than a lock nobody notices is missing. The bounds
    // are written out rather than computed, because `2n ** 63n` is a BigInt
    // literal and this project's tsconfig targets below ES2020.
    expect(BigInt(key)).toBeGreaterThanOrEqual(BigInt("-9223372036854775808"));
    expect(BigInt(key)).toBeLessThanOrEqual(BigInt("9223372036854775807"));
  });

  it("gives different names different keys", () => {
    expect(lockKey(RUN_LOCK_NAME)).not.toBe(lockKey("kolscanhispano:test-suite"));
  });

  it("strips -pooler from the host and leaves the rest of the URL intact", () => {
    expect(directEndpoint(POOLED)).toBe(DIRECT);

    const rewritten = new URL(directEndpoint(POOLED));
    const original = new URL(POOLED);
    expect(rewritten.hostname).toBe("ep-still-fog-12345678.c-2.us-east-1.aws.neon.tech");
    expect(rewritten.username).toBe(original.username);
    expect(rewritten.password).toBe(original.password);
    expect(rewritten.pathname).toBe("/milliondollarpage");
    expect(rewritten.searchParams.get("sslmode")).toBe("require");
    expect(rewritten.searchParams.get("channel_binding")).toBe("require");
  });

  it("leaves a host that is already direct alone", () => {
    expect(directEndpoint(DIRECT)).toBe(DIRECT);
  });

  it("keeps an explicit port", () => {
    const withPort = POOLED.replace(".aws.neon.tech/", ".aws.neon.tech:5433/");
    expect(new URL(directEndpoint(withPort)).port).toBe("5433");
    expect(new URL(directEndpoint(withPort)).hostname).not.toContain("-pooler");
  });

  it("does not rewrite a -pooler that is not part of the host", () => {
    // The endpoint id itself is what carries the suffix; a database named
    // after it must not be rewritten along with it.
    const named = POOLED.replace("/milliondollarpage?", "/board-pooler.db?");
    expect(new URL(directEndpoint(named)).pathname).toBe("/board-pooler.db");
  });
});
