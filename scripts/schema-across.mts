import { config } from "dotenv";
import { Pool } from "pg";
import { EXPECTED_MIGRATION } from "../src/lib/schema-version";

/**
 * Which migration each of the three databases is actually on.
 *
 * WHO CALLS THIS: a person, before a deploy, and `/cierre` step 2 when a batch
 * carries a migration. `assertSchemaIsCurrent` already refuses to serve a
 * database that is behind — this is the same question asked of all three at
 * once, from a machine that can still fix it, rather than one at a time from
 * three different failures.
 *
 * IT NEVER PRINTS A CONNECTION STRING. Host and database name only, which is
 * what tells two Neon branches apart and is not a credential.
 */
config({ path: ".env.local" });

const TARGETS = [
  ["app", "DATABASE_URL"],
  ["test", "TEST_DATABASE_URL"],
  ["preview", "PREVIEW_DATABASE_URL"],
] as const;

let behind = 0;
console.log(`\n  expecting ${EXPECTED_MIGRATION}\n`);

for (const [name, variable] of TARGETS) {
  const url = process.env[variable];
  if (!url) {
    console.log(`  ${name.padEnd(9)} ${variable} is not set — UNKNOWN, not "up to date"`);
    behind += 1;
    continue;
  }

  const pool = new Pool({ connectionString: url });
  try {
    const { rows } = await pool.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
    );
    const at = rows[0]?.version ?? "(none)";
    const host = new URL(url).hostname.split(".")[0];
    const ok = at === EXPECTED_MIGRATION;
    if (!ok) behind += 1;
    console.log(`  ${name.padEnd(9)} ${at.padEnd(24)} ${host.padEnd(28)} ${ok ? "current" : "BEHIND"}`);
  } catch (error) {
    behind += 1;
    console.log(`  ${name.padEnd(9)} could not be asked: ${(error as Error).message}`);
  } finally {
    await pool.end();
  }
}

if (behind > 0) {
  console.error(`\n  ${behind} database(s) are not on ${EXPECTED_MIGRATION}.`);
  process.exitCode = 1;
} else {
  console.log(`\n  all three databases are on ${EXPECTED_MIGRATION}.`);
}
