/**
 * Fails the build if a secret's VALUE is sitting in the build output.
 *
 * WHO RUNS THIS: `npm run build`, immediately after `next build` — see
 * package.json. It is part of the build rather than a separate chore because a
 * check somebody has to remember to run is a check that runs the day after the
 * leak.
 *
 * WHY IT EXISTS. The 2026-08-28 audit found `ADMIN_TOKEN`, `RATE_LIMIT_SALT`
 * and the database password written verbatim into `.next/cache/turbopack/*.sst`
 * — Turbopack stores the environment it uses as cache keys, and on Vercel that
 * cache is preserved and restored between builds, so a rotated admin token
 * outlives its own rotation inside the build infrastructure. The build script
 * now deletes that cache; this is what proves the deletion actually worked, and
 * what will catch the next place the toolchain decides to write a secret.
 *
 * THE POSITIVE CONTROL IS THE POINT. A grep that finds nothing proves nothing
 * until it has been shown to find something: a scanner with a broken pattern, a
 * wrong root, or an unreadable directory reports a clean build forever. So this
 * plants a sentinel inside the output, requires the scan to find it, and only
 * then trusts a negative result. If the control does not fire, this exits
 * non-zero saying it could not verify anything — which is the honest answer, and
 * the opposite of what a silent pass would claim.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Values to scan for, from the environment AND from `.env.local`.
 *
 * BOTH, because neither alone is right. On Vercel the secrets are in the
 * environment and there is no `.env.local`. Locally the opposite: `next build`
 * loads `.env.local` into ITS OWN process, and this script runs as a separate
 * process in the `&&` chain that inherits none of it — so reading only
 * `process.env` here scanned for empty strings, skipped every secret, and
 * printed a pass. That was this file's first bug and it is exactly the failure
 * the positive control cannot catch: the control proves the scanner can find a
 * string, not that it was given the right strings to look for.
 */
function secretValues(names: string[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) found.set(name, value);
  }
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (!match) continue;
      const [, name, raw] = match;
      if (!names.includes(name)) continue;
      const value = raw.trim().replace(/^["']|["']$/g, "");
      if (value) found.set(name, value);
    }
  }
  return found;
}

/**
 * Every build output directory, not just the one `next build` writes.
 *
 * The end-to-end suite runs its own `next dev` under `NEXT_DIST_DIR=.next-e2e`
 * so its turbopack cache cannot collide with the real build's. That cache holds
 * the same secrets for the same reason, and scanning only `.next` would have
 * meant the guard reported clean while `ADMIN_TOKEN` and `RATE_LIMIT_SALT` sat
 * in the directory next to it — the leak moved out of the scanner's sight
 * rather than closed. Verified: both values were in `.next-e2e` when this was
 * a single-root scan.
 *
 * Discovered rather than listed, so the next tool that invents its own output
 * directory is covered without anybody remembering to add it here.
 */
function buildRoots(): string[] {
  return readdirSync(".")
    .filter((name) => name === ".next" || name.startsWith(".next-"))
    .filter((name) => statSync(name).isDirectory());
}

/** Env vars whose VALUE must never appear in build output. */
const SECRET_NAMES = [
  "ADMIN_TOKEN",
  "RATE_LIMIT_SALT",
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "COLLECTION_AUTHORITY_SECRET",
];

/** Files containing `value`, or []. Binary-safe: -r without -I, -F for literals. */
function filesContaining(value: string, roots: string[]): string[] {
  if (roots.length === 0) return [];
  try {
    const out = execFileSync("grep", ["-rlaF", "--", value, ...roots], { encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  } catch {
    // grep exits 1 when nothing matched, which is the ordinary answer here.
    return [];
  }
}

// --- The positive control, before anything is trusted ------------------------

const SENTINEL = "BUILDSCAN-c7f1a94e2b60d538-SENTINEL";
const ROOTS = buildRoots();
const controlDir = join(ROOTS[0] ?? ".next", "cache");
const controlFile = join(controlDir, "build-secret-scan-control.txt");
mkdirSync(controlDir, { recursive: true });
writeFileSync(controlFile, `${SENTINEL}\n`);

const controlHits = filesContaining(SENTINEL, ROOTS);
rmSync(controlFile, { force: true });

if (controlHits.length === 0) {
  console.error(
    "check-build-secrets: the positive control did not fire. The scanner could " +
      "not find a string it had just written into the build output, so a clean " +
      "result here would mean nothing. Refusing to report a pass.",
  );
  process.exit(1);
}

// --- The real scan -----------------------------------------------------------

const values = secretValues(SECRET_NAMES);
if (values.size === 0) {
  console.error(
    "check-build-secrets: no secret values were available to scan for, from the " +
      "environment or from .env.local. A pass here would mean nothing.",
  );
  process.exit(1);
}

const leaked: string[] = [];
for (const [name, value] of values) {
  // A short value would match half the build by accident; a secret is long.
  if (value.length < 12) continue;
  const hits = filesContaining(value, ROOTS);
  if (hits.length > 0) leaked.push(`  ${name}: ${hits.length} file(s), first: ${hits[0]}`);
}

if (leaked.length > 0) {
  console.error(
    `check-build-secrets: a secret's value is in a build directory.\n${leaked.join("\n")}\n\n` +
      "On Vercel the build cache is preserved between builds, so a secret here " +
      "outlives its own rotation. Do not ship this build.",
  );
  process.exit(1);
}

console.log(
  `check-build-secrets: control fired, ${values.size} secret value(s) checked, none in ${ROOTS.join(", ")}.`,
);
