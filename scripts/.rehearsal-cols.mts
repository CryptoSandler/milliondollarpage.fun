import { readFileSync } from "node:fs";
import { Pool } from "pg";
const pool = new Pool({ connectionString: readFileSync(process.argv[2], "utf8").trim() });
const cols = await pool.query<{ column_name: string }>(
  "select column_name from information_schema.columns where table_name='blocks' order by ordinal_position",
);
console.log("COLUMNS: " + cols.rows.map((r) => r.column_name).join(" "));
const cons = await pool.query<{ conname: string; def: string }>(
  "select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid='blocks'::regclass and contype='c'",
);
for (const c of cons.rows) if (c.conname.includes("expire")) console.log(c.conname, "=>", c.def);
await pool.end();
