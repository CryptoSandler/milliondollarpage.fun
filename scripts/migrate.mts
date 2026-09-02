import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";

/**
 * Applies every unapplied migration, in filename order, each inside its own
 * transaction. A migration that throws leaves the database exactly as it was
 * and stops the run: applying half a schema and reporting success is the one
 * outcome a migration tool must never produce.
 */

config({ path: ".env.local" });

/**
 * THREE DATABASES, NAMED RATHER THAN GUESSED.
 *
 * `DATABASE_URL` is the one the app serves from, `TEST_DATABASE_URL` is the one
 * the suite truncates, and `PREVIEW_DATABASE_URL` is the one every Vercel
 * preview deployment reads. The third was invisible until a migration landed
 * and preview started answering 500 on a column that did not exist there: it is
 * a genuinely separate Neon branch, and `vercel env pull --environment=preview`
 * returns its URL as an empty string, so it has to be fetched from the Neon CLI
 * and kept in `.env.local` beside the other two.
 *
 * A flag per target and no default beyond the app's. A fallback here would mean
 * migrating the wrong database rather than failing, which is the one thing a
 * migration tool must never do quietly.
 */
const TARGETS = {
  app: "DATABASE_URL",
  test: "TEST_DATABASE_URL",
  preview: "PREVIEW_DATABASE_URL",
} as const;

const target: keyof typeof TARGETS = process.argv.includes("--test")
  ? "test"
  : process.argv.includes("--preview")
    ? "preview"
    : "app";
const variable = TARGETS[target];
const url = process.env[variable];

if (!url) {
  console.error(
    `${variable} is not set. There is no default: a fallback would mean ` +
      "migrating the wrong database rather than failing.\n" +
      (target === "preview"
        ? "It is the Vercel Preview deployment's own Neon branch. `vercel env pull` " +
          "returns it empty; get it with `neonctl connection-string <preview branch> " +
          "--project-id <project>` and put it in .env.local.\n"
        : ""),
  );
  process.exit(1);
}

console.log(`migrating the ${target} database (${variable})`);

const pool = new Pool({ connectionString: url });
const dir = join(process.cwd(), "migrations");

await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

const applied = new Set(
  (await pool.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map(
    (row) => row.version,
  ),
);

const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
let count = 0;

for (const file of files) {
  const version = file.replace(/\.sql$/, "");
  if (applied.has(version)) continue;

  const sql = await readFile(join(dir, file), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
    await client.query("COMMIT");
    console.log(`applied ${version}`);
    count++;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`failed on ${version}:`, error);
    process.exit(1);
  } finally {
    client.release();
  }
}

console.log(count === 0 ? "nothing to apply" : `applied ${count} migration(s)`);
await pool.end();
