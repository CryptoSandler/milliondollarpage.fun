import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The expunge script, run against a real backup repository built for it.
 *
 * WHY THIS EXISTS BEFORE THE BACKUP DOES. The owner's rule: the daily backup is
 * not switched on before the script that can expunge it exists. A copy of every
 * image is a second place a purged picture lives, and a purge that covers the
 * database and not the copies is a purge that does not do what `SECURITY.md`
 * says. Until this passes, `SECURITY.md` says so plainly.
 *
 * IT BUILDS A REPOSITORY RATHER THAN MOCKING GIT, the same argument
 * `ignore-build-step.test.ts` makes next door: the thing under test is a
 * history rewrite, and a mock of `git` would be a test of the mock. Three
 * commits, a picture in all of them, and the requirement is that afterwards no
 * commit anywhere in the repository contains those bytes.
 */
const room = mkdtempSync(join(tmpdir(), "expunge-"));
afterAll(() => rmSync(room, { recursive: true, force: true }));

const SECRET = "the-bytes-that-must-not-survive";
const OTHER = "a-picture-nobody-complained-about";
const PURGED = "11111111-1111-1111-1111-111111111111";
const KEPT = "22222222-2222-2222-2222-222222222222";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.com",
      FILTER_BRANCH_SQUELCH_WARNING: "1",
    },
  }).trim();
}

/** Every blob in every commit, as text — which is where a rewrite either worked or did not. */
function everyBlob(dir: string): string {
  const objects = git(dir, ["rev-list", "--objects", "--all"])
    .split("\n")
    .map((line) => line.split(" ")[0])
    .filter(Boolean);
  return objects
    .map((sha) => {
      try {
        return execFileSync("git", ["cat-file", "-p", sha], { cwd: dir, encoding: "utf8" });
      } catch {
        return "";
      }
    })
    .join("\n");
}

/** A backup with two blocks, three commits, and the picture present throughout. */
function backup(): string {
  const dir = mkdtempSync(join(room, "repo-"));
  git(dir, ["init", "-q", "-b", "main"]);
  mkdirSync(join(dir, "blocks"), { recursive: true });
  mkdirSync(join(dir, "images"), { recursive: true });

  const manifest = {
    generatedAt: "2026-09-05T00:00:00Z",
    blocks: [
      { id: PURGED, imageSha256: "aaaa" },
      { id: KEPT, imageSha256: "bbbb" },
    ],
  };

  writeFileSync(join(dir, "images", "aaaa.bin"), SECRET);
  writeFileSync(join(dir, "images", "bbbb.bin"), OTHER);
  writeFileSync(join(dir, "blocks", `${PURGED}.json`), JSON.stringify({ id: PURGED }));
  writeFileSync(join(dir, "blocks", `${KEPT}.json`), JSON.stringify({ id: KEPT }));
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "day one"]);

  // Two more days, so the bytes are in three commits rather than one — the
  // case where deleting the file at the tip would look like it had worked.
  for (const day of ["day two", "day three"]) {
    writeFileSync(join(dir, "manifest.json"), `${JSON.stringify({ ...manifest, generatedAt: day }, null, 2)}\n`);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", day]);
  }
  return dir;
}

function expunge(dir: string, block: string): string {
  return execFileSync(
    "npx",
    ["tsx", "scripts/backup-expunge.mts", "--repo", dir, "--block", block],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

describe("expunging a purged block from the backup", () => {
  it("removes its bytes from every commit, not only from the tip", () => {
    const dir = backup();
    expect(everyBlob(dir)).toContain(SECRET);

    expunge(dir, PURGED);

    // The assertion the whole file exists for: nothing anywhere in the object
    // database still contains those bytes.
    expect(everyBlob(dir)).not.toContain(SECRET);
  });

  it("leaves every other picture exactly where it was", () => {
    const dir = backup();
    expunge(dir, PURGED);

    expect(everyBlob(dir)).toContain(OTHER);
    expect(readFileSync(join(dir, "images", "bbbb.bin"), "utf8")).toBe(OTHER);
    expect(readFileSync(join(dir, "blocks", `${KEPT}.json`), "utf8")).toContain(KEPT);
  });

  it("takes the block out of the manifest", () => {
    const dir = backup();
    expunge(dir, PURGED);

    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    expect(manifest.blocks.map((row: { id: string }) => row.id)).toEqual([KEPT]);
  });

  /**
   * TWO BLOCKS, ONE PICTURE. Images are content-addressed, so identical bytes
   * are one file — and expunging one block must not take the other's picture
   * with it. This is the case that makes content-addressing safe rather than
   * merely clever.
   */
  it("keeps an image another block still points at", () => {
    const dir = backup();
    // Point the kept block at the purged one's image, as a duplicate upload
    // would have.
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    manifest.blocks[1].imageSha256 = "aaaa";
    writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "a duplicate upload"]);

    const output = expunge(dir, PURGED);
    expect(output).toContain("another block that was not purged has the same bytes");
    expect(everyBlob(dir)).toContain(SECRET);

    /*
      THE ROW IS GONE FROM EVERY COMMIT; THE ID IS NOT, AND THAT IS CORRECT.

      `blocks/<id>.json` — the caption, the link, the owner, the hash — is
      removed from the whole history. What survives is the block's uuid inside
      the manifests of older commits, because rewriting those would mean a
      tree-filter over every commit to edit one JSON file, for a value that a
      purge does not destroy in the database either: `/b/<id>` is a public URL
      and `blocks.id` outlives a purge by design (`purged_at` marks the row,
      the row stays). What a purge destroys is the material, and the material
      is gone.
    */
    expect(everyBlob(dir)).not.toContain("blocks/" + PURGED);
    const rows = everyBlob(dir).split("\n").filter((line) => line.includes('"id"'));
    expect(rows.some((line) => line.includes(KEPT))).toBe(true);
  });

  it("says nothing to expunge for a block the backup never had", () => {
    const dir = backup();
    const output = expunge(dir, "33333333-3333-3333-3333-333333333333");
    expect(output).toContain("Nothing to expunge");
    expect(everyBlob(dir)).toContain(SECRET);
  });
});
