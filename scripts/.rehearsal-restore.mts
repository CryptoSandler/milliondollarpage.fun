import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const from = process.argv[2];
const pool = new Pool({ connectionString: readFileSync(process.argv[3], "utf8").trim() });

const manifest = JSON.parse(readFileSync(join(from, "manifest.json"), "utf8")) as {
  generatedAt: string;
  blocks: { id: string; rowSha256: string; imageSha256: string | null }[];
};

let images = 0;
for (const entry of manifest.blocks) {
  const json = readFileSync(join(from, "blocks", `${entry.id}.json`), "utf8");

  // The manifest is checked before the row is trusted: a backup whose manifest
  // and files disagree has been edited or truncated, and the moment to find
  // that out is before it is loaded.
  if (createHash("sha256").update(json).digest("hex") !== entry.rowSha256) {
    throw new Error(`row hash mismatch for ${entry.id}`);
  }

  const { imageSha256, ...row } = JSON.parse(json) as Record<string, unknown>;

  if (entry.imageSha256) {
    const path = join(from, "images", `${entry.imageSha256}.bin`);
    if (!existsSync(path)) throw new Error(`manifest names an image that is not here: ${entry.imageSha256}`);
    const bytes = readFileSync(path);
    if (createHash("sha256").update(bytes).digest("hex") !== entry.imageSha256) {
      throw new Error(`image hash mismatch for ${entry.id}`);
    }
    row.pending_image = bytes;
    images += 1;
  }

  // THE COLUMNS COME FROM THE FILE, not from a list in this script. That is the
  // same rule the dump follows and for the same reason: a hand-written list is
  // one that goes stale on the next migration, and a restore that silently
  // dropped a column would look exactly like a working one.
  const names = Object.keys(row);
  await pool.query(
    `INSERT INTO blocks (${names.map((n) => `"${n}"`).join(", ")})
     VALUES (${names.map((_, i) => `$${i + 1}`).join(", ")})`,
    names.map((n) => row[n]),
  );
}

const n = await pool.query<{ n: number }>("select count(*)::int as n from blocks");
console.log(`restored ${n.rows[0].n} rows and ${images} images, from the copy of ${manifest.generatedAt}`);
await pool.end();
