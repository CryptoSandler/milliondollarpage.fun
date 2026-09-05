import { Pool } from "pg";
import { readFileSync } from "node:fs";
const pool = new Pool({ connectionString: readFileSync(process.argv[2], "utf8").trim() });
// A TRUE empty start: not a truncate, which leaves the schema the branch
// inherited, but the schema dropped and rebuilt by the migrations themselves.
// A restore rehearsal that skipped the migrations would be rehearsing half of
// what a real restore has to do.
await pool.query("DROP SCHEMA public CASCADE");
await pool.query("CREATE SCHEMA public");
const r = await pool.query("select count(*)::int as n from information_schema.tables where table_schema='public'");
console.log("tables after wipe:", r.rows[0].n);
await pool.end();
