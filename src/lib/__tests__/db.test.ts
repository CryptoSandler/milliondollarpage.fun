import { describe, expect, it } from "vitest";
import { execute, query } from "../db";
import { sameTarget } from "../../../vitest.setup";

// Captured at module scope, which runs while files are still being collected
// and therefore before vitest.setup.ts's beforeAll fires. That beforeAll
// redirects process.env.DATABASE_URL to the test connection string so the
// rest of the app talks to the disposable database; reading DATABASE_URL
// from inside an `it()` would only ever see that redirected value and could
// never disagree with TEST_DATABASE_URL. This constant is the one place that
// still holds the original app URL, which is what this test needs to compare
// against.
const originalAppDatabaseUrl = process.env.DATABASE_URL;

describe("the test harness", () => {
  it("is pointed at a database that is not the app database", () => {
    expect(sameTarget(process.env.TEST_DATABASE_URL!, originalAppDatabaseUrl)).toBe(false);
  });

  it("reaches Postgres and sees the bootstrap migration", async () => {
    const rows = await query<{ ok: boolean }>("SELECT TRUE AS ok FROM bootstrap_check LIMIT 1");
    expect(rows).toEqual([]);
    await execute("INSERT INTO bootstrap_check (ok) VALUES (TRUE)");
    const after = await query<{ ok: boolean }>("SELECT ok FROM bootstrap_check");
    expect(after).toEqual([{ ok: true }]);
  });

  it("truncates between tests", async () => {
    const rows = await query("SELECT ok FROM bootstrap_check");
    expect(rows).toEqual([]);
  });
});
