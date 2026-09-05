/**
 * Writes the wall into a directory, in the shape `backup-expunge.mts` reads.
 *
 * WHO RUNS THIS: `.github/workflows/backup.yml`, once a day, and a person
 * rehearsing a restore. Nothing in the application calls it: it reads with a
 * role that cannot write, and it writes to a filesystem the application has no
 * idea about.
 *
 * ## The layout, which is the same one the expunge script deletes from
 *
 *   manifest.json          every block, its row hash and its image hash
 *   blocks/<id>.json       one row, WITHOUT the image bytes
 *   images/<sha256>.bin    the image bytes, content-addressed
 *
 * CONTENT-ADDRESSED IMAGES ARE THE WHOLE TRICK. A daily dump of a wall whose
 * pictures do not change would otherwise write every byte again every day, and
 * git would store a new blob each time because the path is what it keys on. By
 * the hash, an unchanged picture is the same path with the same contents, and
 * a day on which nothing was bought is a commit with no changes at all.
 *
 * ## What is NOT copied
 *
 * `owner_address` and `owner_wallet` are selected — they have to be, a backup
 * that cannot restore who owns a rectangle is not a backup — and that is
 * exactly why the destination is a PRIVATE repository and why the role that
 * reads here cannot write anywhere. `payment_signature` likewise.
 *
 * A purged block is not here at all: its bytes and words were destroyed in the
 * database, and `purged_at` rows carry nothing to copy. A block purged AFTER a
 * dump is what `backup-expunge.mts` is for.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const out = process.argv[process.argv.indexOf("--out") + 1];
if (!out || out.startsWith("--")) {
  console.error("Usage: backup-dump.mts --out <directory>");
  process.exit(2);
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL is not set. Nothing was dumped.");
  process.exit(2);
}

type Row = Record<string, unknown> & { id: string; pending_image: Buffer | null };

const pool = new Pool({ connectionString });

/*
  EVERY COLUMN THE TABLE HAS, discovered rather than listed.

  THIS IS THE FIRST REHEARSAL'S FINDING, and it is the reason rehearsals exist.
  The first version of this file named twenty-three columns by hand and the
  table has thirty-five: the restore fell over on `blocks_paid_never_expires`
  because `expires_at` was never copied, and behind that were
  `payment_fraction`, `takedown_reason`, `owner_wallet`, `mint_address`,
  `minted_at`, `approval_note`, `ip_hash` and both Arweave ids. A hand-written
  list is a list that goes stale on the next migration, silently, and the
  backup that results looks exactly like a working one.

  The two generated columns are excluded because Postgres refuses to be told
  what they are — they are the exclusion constraint's own ranges, derived from
  x, y, w and h, which ARE copied.
*/
const { rows: columns } = await pool.query<{ column_name: string }>(
  `SELECT column_name
     FROM information_schema.columns
    WHERE table_name = 'blocks' AND is_generated <> 'ALWAYS'
    ORDER BY ordinal_position`,
);
const names = columns.map((c) => c.column_name);
if (!names.includes("id") || !names.includes("pending_image")) {
  console.error("The blocks table does not look like the blocks table. Nothing was dumped.");
  process.exit(2);
}

const { rows } = await pool.query<Row>(
  `SELECT ${names.map((n) => `"${n}"`).join(", ")} FROM blocks ORDER BY created_at ASC`,
);
await pool.end();

/*
  THE DIRECTORIES ARE EMPTIED FIRST, and that is what makes this a MIRROR of the
  database rather than an accumulation. A block deleted from `blocks` — which
  only ever happens to an expired hold — must disappear from the backup too, and
  a dump that only ever adds files would keep it for ever under a name nothing
  points at.
*/
for (const dir of ["blocks", "images"]) {
  rmSync(join(out, dir), { recursive: true, force: true });
  mkdirSync(join(out, dir), { recursive: true });
}

const manifest: { generatedAt: string; blocks: { id: string; rowSha256: string; imageSha256: string | null }[] } = {
  // The date and not the instant. A timestamp to the second would make every
  // daily commit differ even on a day nothing was bought, which is exactly the
  // noise content-addressing exists to remove.
  generatedAt: new Date().toISOString().slice(0, 10),
  blocks: [],
};

for (const row of rows) {
  const { pending_image: image, ...record } = row;

  const imageSha256 = image ? createHash("sha256").update(image).digest("hex") : null;
  if (image && imageSha256) writeFileSync(join(out, "images", `${imageSha256}.bin`), image);

  // The bytes leave the row and become a file; everything else stays exactly
  // as the column list found it, so a column added tomorrow is copied tomorrow.
  const body = { ...record, imageSha256 };
  const json = `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(join(out, "blocks", `${row.id}.json`), json);

  manifest.blocks.push({
    id: row.id,
    rowSha256: createHash("sha256").update(json).digest("hex"),
    imageSha256,
  });
}

writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const images = readdirSync(join(out, "images")).length;
console.log(`  ${rows.length} rows, ${images} distinct images, manifest written.`);
