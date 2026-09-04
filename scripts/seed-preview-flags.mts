/**
 * The twenty seeded purchases, with real artwork, for the owner's gate.
 *
 * PREVIEW ONLY. It writes to `PREVIEW_DATABASE_URL` and refuses to run against
 * anything else — production's wall is empty and stays that way.
 *
 * THE PICTURES GO THROUGH THE BUYER'S OWN PLANNER, and one part of the buyer's
 * pipeline is deliberately NOT reused because it cannot be: `prepareImage` in
 * `image-encode.ts` is browser code — `createImageBitmap` and a `<canvas>` — and
 * calling it here returns `image_unreadable` for every file, which is what the
 * first version of this script did twenty times in a row.
 *
 * WHAT IS SHARED IS EVERY DECISION. `plannedEncode` picks the crop and the
 * stored size, `encodeAttempts` walks the same quality-then-resolution ladder,
 * and `TARGET_STORED_BYTES` / `STORED_MAX_BYTES` are the same budgets. The fit
 * is chosen the way `ContentForm` chooses it: `contain` unless it cannot be
 * honoured, in which case a real buyer is switched to `cover` and so is this.
 * The only difference is the rasteriser — sharp here, a canvas there — so the
 * geometry a viewer judges is identical and the bytes differ by whatever two
 * WebP encoders differ by.
 *
 * A 173×16, a 31×169 and a 6×40 are in the set precisely so somebody can see
 * what a flag becomes in a rectangle nobody drew it for.
 */
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { Pool } from "pg";
import sharp from "sharp";
import { canHonourContain } from "../src/lib/board/image-fit";
import { encodeAttempts, plannedEncode, TARGET_STORED_BYTES, STORED_MAX_BYTES } from "../src/lib/board/image-plan";

config({ path: ".env.local" });
const url = process.env.PREVIEW_DATABASE_URL;
if (!url) { console.error("PREVIEW_DATABASE_URL is not set"); process.exit(1); }
if (url === process.env.DATABASE_URL) { console.error("that is the app database, not preview"); process.exit(1); }

const FLAGS = join(homedir(), "Documents/survives/survives.fun/app/public/flags");
const files = readdirSync(FLAGS).filter((f) => f.endsWith(".png")).sort();

/** `dr-congo.png` -> `DR Congo`. The caption is the country and nothing else. */
function country(file: string): string {
  return file
    .replace(/\.png$/, "")
    .split("-")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/* The three shapes that show what a picture does in a rectangle nobody designed
   it for: an extreme landscape, an extreme portrait, and a tiny one. */
const SHAPES: [number, number][] = [[173, 16], [31, 169], [6, 40]];

const pool = new Pool({ connectionString: url });
try {
  await pool.query("TRUNCATE blocks, hold_meter CASCADE");
  let x = 0, y = 0, rowTall = 0, n = 0;
  const report: string[] = [];

  for (let i = 0; i < 20; i += 1) {
    const [w, h] = SHAPES[i] ?? [120, 90];
    if (x + w > 1250) { x = 0; y += rowTall + 10; rowTall = 0; }
    const at = { x, y };
    x += w + 10;
    rowTall = Math.max(rowTall, h);

    const file = files[i % files.length];
    const bytes = readFileSync(join(FLAGS, file));
    const meta = await sharp(bytes).metadata();
    const sw = meta.width ?? 1;
    const sh = meta.height ?? 1;

    // The form's own rule: contain unless it cannot be honoured, then cover.
    const fit = canHonourContain({ width: sw, height: sh }, { width: w, height: h })
      ? "contain"
      : "cover";

    /*
      THE SAME LADDER THE BROWSER WALKS: every quality at the full stored size,
      then the same qualities at a smaller one, stopping at the first rung under
      the target. Resolution is given up last, because a block forty pixels
      across has none to spare.
    */
    let stored: Buffer | null = null;
    let size = { width: 0, height: 0 };
    for (const attempt of encodeAttempts({ width: w, height: h })) {
      const plan = plannedEncode(sw, sh, { width: w, height: h }, fit, attempt.maxLongEdge);
      const out = await sharp(bytes)
        .extract({
          left: Math.round(plan.source.x),
          top: Math.round(plan.source.y),
          width: Math.round(plan.source.width),
          height: Math.round(plan.source.height),
        })
        .resize(plan.target.width, plan.target.height, { fit: "fill" })
        // Flattened onto the sold ground for the reason `image-encode.ts` gives:
        // these bytes sit inside a rectangle on a wall shared by two themes, so
        // they cannot carry either theme's paper.
        .flatten({ background: "#2e3642" })
        .webp({ quality: Math.round(attempt.quality * 100) })
        .toBuffer();
      stored = out;
      size = { width: plan.target.width, height: plan.target.height };
      if (out.length <= TARGET_STORED_BYTES) break;
    }
    if (!stored || stored.length > STORED_MAX_BYTES) {
      console.error(`  ${file}: could not get under the stored budget`);
      continue;
    }
    const mime = "image/webp";

    await pool.query(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                           payment_signature, caption, link,
                           pending_image, pending_image_mime, image_sha256, image_fit, is_animated)
       VALUES ($1, $2, $3, $4, 'paid', 1000000, $5, now() - ($6 || ' minutes')::interval,
               $7, $8, $9, $10, $11, $12, $13, false)`,
      [at.x, at.y, w, h, w * h * 1000000, i * 3, `flags-${i}`,
       country(file).slice(0, 32), `https://example.org/flags/${file.replace(/\.png$/, "")}`,
       stored, mime, createHash("sha256").update(stored).digest("hex"), fit],
    );
    n += 1;
    report.push(`  ${String(w).padStart(4)}×${String(h).padEnd(3)} ${country(file).padEnd(16)} ${fit.padEnd(7)} ${size.width}×${size.height} ${mime} ${(stored.length / 1024).toFixed(1)} KiB`);
  }
  console.log(report.join("\n"));
  const { rows } = await pool.query("SELECT count(*)::int AS n, sum(w*h)::int AS px FROM blocks WHERE status='paid'");
  console.log(`\nseeded ${n} purchases, ${rows[0].px.toLocaleString("en-US")} pixels, all with artwork`);
} catch (error) {
  const host = url.match(/@([^/:?]+)/)?.[1] ?? "unparseable";
  console.error(`seeding failed against ${host}: ${(error as Error).message}`);
  process.exit(1);
} finally {
  await pool.end();
}
