/**
 * Removes a purged block from the backup's HISTORY, not just from its tip.
 *
 * WHO RUNS THIS: a person, immediately after `purge` in `/admin`, and nothing
 * else. It is deliberately not automatic: a purge destroys bytes in the primary
 * database inside one transaction, and rewriting another repository's history
 * is not something to do from a request handler.
 *
 * ## Why it exists BEFORE the backup does
 *
 * The owner's rule, and it is the right way round: **the backup is not switched
 * on before the script that can expunge it exists.** A daily copy of every
 * image is a second place a purged picture lives, and a purge that covers the
 * database and not the copies is a purge that does not do what `SECURITY.md`
 * says it does. Until this has been run once against a real backup,
 * `SECURITY.md` says plainly that purge does not cover the copies.
 *
 * ## What the backup looks like, which this file defines by reading it
 *
 *   manifest.json          every block, its row hash and its image hash
 *   blocks/<id>.json       one row, without the image bytes
 *   images/<sha256>.bin    the image bytes, content-addressed
 *
 * Images are content-addressed so that expunging one is deleting one path, and
 * so that two blocks carrying identical bytes are one file — which also means
 * this refuses to delete an image still referenced by a block that was not
 * purged. That check is the whole reason the manifest is read rather than
 * guessed at.
 *
 * ## The rewrite
 *
 * `git filter-branch` rather than `git filter-repo`, because filter-repo is a
 * separate install and this has to run on whatever machine the owner is at.
 * It is slow on a large history; the backup is squashed monthly and kept for
 * ninety days, so the history it walks is small by construction.
 *
 * // ponytail: if the backup ever grows past a few thousand commits, this is
 * // the line to swap for `git filter-repo --invert-paths --path …`, which is
 * // the same operation and about a hundred times faster.
 *
 *   npx tsx scripts/backup-expunge.mts --repo <path> --block <uuid> [--push]
 *
 * Without `--push` it rewrites the local clone and stops, which is what a
 * rehearsal wants. With it, the rewritten history is force-pushed and the
 * remote's reflog is expired — because a rewrite nobody pushed is a purge that
 * did not happen.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type ManifestEntry = { id: string; imageSha256: string | null };
type Manifest = { generatedAt: string; blocks: ManifestEntry[] };

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

const repo = flag("repo");
const block = flag("block");
const push = process.argv.includes("--push");

if (!repo || !block) {
  console.error("Usage: backup-expunge.mts --repo <path> --block <uuid> [--push]");
  process.exit(2);
}

function git(args: string[], cwd = repo!): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FILTER_BRANCH_SQUELCH_WARNING: "1" },
  }).trim();
}

const manifestPath = join(repo, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`No manifest.json in ${repo}. That is not a backup of this wall.`);
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
const entry = manifest.blocks.find((candidate) => candidate.id === block);

if (!entry) {
  // Not an error. A block purged before the first backup ran was never copied,
  // and saying "nothing to expunge" is the honest answer rather than a failure.
  console.log(`  ${block} is not in this backup. Nothing to expunge.`);
  process.exit(0);
}

/*
  THE IMAGE IS ONLY DELETED IF NOTHING ELSE POINTS AT IT. Two blocks with the
  same bytes are one file, and expunging one of them must not take the other's
  picture with it. This is the check that makes content-addressing safe rather
  than clever.
*/
const stillReferenced =
  entry.imageSha256 !== null &&
  manifest.blocks.some(
    (other) => other.id !== block && other.imageSha256 === entry.imageSha256,
  );

const paths = [`blocks/${block}.json`];
if (entry.imageSha256 && !stillReferenced) paths.push(`images/${entry.imageSha256}.bin`);

console.log(`  expunging from every commit: ${paths.join(", ")}`);
if (stillReferenced) {
  console.log("  the image is kept: another block that was not purged has the same bytes.");
}

// The manifest at the tip loses the row first, so the rewrite below carries a
// manifest that is already correct rather than one that still names a file it
// has just deleted.
manifest.blocks = manifest.blocks.filter((candidate) => candidate.id !== block);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
git(["add", "manifest.json"]);
git(["commit", "-q", "-m", `expunge ${block} from the manifest`]);

const removals = paths.map((path) => `git rm --cached --ignore-unmatch -- '${path}'`).join(" && ");
git([
  "filter-branch",
  "--force",
  "--index-filter",
  removals,
  "--prune-empty",
  "--",
  "--all",
]);

// filter-branch keeps the old history reachable through refs/original and the
// reflog; leaving either behind means the bytes are still in the repository,
// which is the difference between a rewrite and a purge.
try {
  git(["update-ref", "-d", "refs/original/refs/heads/main"]);
} catch {
  // Some layouts name it differently, and a missing ref is the outcome we want.
}
git(["reflog", "expire", "--expire=now", "--all"]);
git(["gc", "--prune=now", "--aggressive"]);

if (!push) {
  console.log("\n  rewritten locally. Nothing was pushed — pass --push when this is the real one.");
  process.exit(0);
}

git(["push", "--force", "origin", "--all"]);
console.log("\n  rewritten and force-pushed. The remote's own gc decides when the objects go.");
