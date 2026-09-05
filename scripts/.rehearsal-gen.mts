import { readFileSync } from "node:fs";
import { Pool } from "pg";
const pool = new Pool({ connectionString: readFileSync(process.argv[2], "utf8").trim() });
const r = await pool.query<{ column_name: string; is_generated: string; identity: string }>(
  `select column_name, is_generated, is_identity as identity
     from information_schema.columns where table_name='blocks' order by ordinal_position`,
);
console.log("GENERATED: " + r.rows.filter((x) => x.is_generated === "ALWAYS" || x.identity === "YES").map((x) => x.column_name).join(" "));
await pool.end();
