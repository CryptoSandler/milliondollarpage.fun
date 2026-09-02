/**
 * The migration this build expects the database to have reached.
 *
 * WHO CALLS THIS: `src/instrumentation.ts`, at boot, to refuse to serve against
 * a database that is behind — and `./__tests__/schema-version.test.ts`, which
 * is what keeps the constant honest.
 *
 * WHY A CONSTANT AND NOT A DIRECTORY LISTING. The obvious implementation reads
 * `migrations/` and takes the last filename. Those `.sql` files are not traced
 * into the serverless bundle, so at runtime on Vercel the directory is not
 * there and the check would either crash or, worse, read an empty directory and
 * conclude everything is fine. The constant travels in the JavaScript; the test
 * below compares it against the real directory on a machine that has one, so a
 * migration added without touching this line fails the suite rather than
 * shipping a boot check that is quietly one version behind.
 *
 * WHY THIS EXISTS AT ALL. Three times in one week a database was found behind
 * the code that talks to it: the `tests` branch was five migrations back, a
 * per-branch database needed catching up at every merge, and the first
 * production deploy answered 500 on every route because `hidden_at` and
 * `board_composites` did not exist yet. Each time the symptom was a runtime
 * error naming a column, which reads like a bug in the query rather than a
 * database that was never migrated.
 */
export const EXPECTED_MIGRATION = "014_visits_and_clicks";
