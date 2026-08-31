import { readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { EXPECTED_MIGRATION } from "../schema-version";

/**
 * The one thing that keeps `EXPECTED_MIGRATION` from rotting.
 *
 * It is a hand-written constant precisely because the runtime cannot read the
 * migrations directory (see the module's own comment). This test runs where the
 * directory does exist, so adding `010_something.sql` and forgetting the
 * constant fails here — loudly, on a machine that can still fix it — instead of
 * shipping a boot check that believes the schema is current when it is a
 * version behind.
 */
describe("EXPECTED_MIGRATION", () => {
  it("names the last migration in the directory", () => {
    const latest = readdirSync("migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .at(-1)
      ?.replace(/\.sql$/, "");

    expect(latest).toBeDefined();
    expect(EXPECTED_MIGRATION).toBe(latest);
  });
});

describe("assertSchemaIsCurrent", () => {
  it("passes against a database that is actually up to date", async () => {
    const { assertSchemaIsCurrent } = await import("../config");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(assertSchemaIsCurrent()).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("names both versions when the database is behind", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    // Hide the newest migration from the check the way a un-migrated database
    // would, then confirm the message says what to do about it.
    vi.doMock("../schema-version", () => ({ EXPECTED_MIGRATION: "999_not_applied" }));
    vi.resetModules();
    const { assertSchemaIsCurrent: fresh } = await import("../config");
    // Two assertions rather than one dot-all regex: the `s` flag needs a newer
    // target than this project type-checks against, and the message spans lines.
    await expect(fresh()).rejects.toThrow(/999_not_applied/);
    await expect(fresh()).rejects.toThrow(/db:migrate/);
    vi.doUnmock("../schema-version");
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("leaves a developer alone", async () => {
    const { assertSchemaIsCurrent } = await import("../config");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    await expect(assertSchemaIsCurrent()).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });
});
