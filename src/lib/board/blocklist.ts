import { query, queryOne } from "../db";

/**
 * Images this wall has already refused, by the hash of their exact bytes.
 *
 * WHO CALLS THIS. `src/app/api/orders/[id]/content/route.ts`, which asks
 * `isBlocked` before it accepts an upload; `src/lib/board/takedown.ts`, whose
 * `purge` writes here so that removing a picture removes it for good rather
 * than once; and `src/app/api/admin/blocked/route.ts`, which is how a person
 * reads and edits the list. Nothing else, and nothing in the browser: this
 * imports the pool.
 *
 * ## Why the check is here and not in `validateContent`
 *
 * That function is pure — bytes in, a verdict out, no database — which is what
 * makes every one of its rules testable without one. Folding a table lookup
 * into it would cost that for no gain: the route already has to await
 * something, and one more await in the route is cheaper than a database
 * dependency in the only piece of validation that currently has none.
 *
 * ## What it catches and what it does not
 *
 * The SAME FILE. A one-pixel edit is a different SHA-256 and walks straight
 * past — that is understood rather than overlooked, and `DECISIONS.md` carries
 * a perceptual hash as a later layer. The argument for the exact match first is
 * that it costs one primary-key lookup and stops the case that actually
 * happens: somebody re-uploading the thing that was taken down.
 */

export type BlockedImage = {
  sha256: string;
  reason: string;
  source: "purge" | "admin";
  blockedAt: string;
};

/**
 * Is this exact file refused?
 *
 * Takes the hash rather than the bytes: the caller has already computed it —
 * `validateContent` puts it on every accepted upload — and hashing a hundred
 * kilobytes twice to ask one question would be work for nothing.
 */
export async function isBlocked(sha256: string): Promise<BlockedImage | null> {
  const row = await queryOne<{
    sha256: string;
    reason: string;
    source: string;
    blocked_at: Date;
  }>("SELECT sha256, reason, source, blocked_at FROM blocked_images WHERE sha256 = $1", [sha256]);
  if (!row) return null;
  return {
    sha256: row.sha256,
    reason: row.reason,
    source: row.source as "purge" | "admin",
    blockedAt: row.blocked_at.toISOString(),
  };
}

/**
 * Refuse this file from now on.
 *
 * IDEMPOTENT, and deliberately keeps the FIRST reason. A picture purged twice
 * should read as the judgement that was made about it, not as whichever purge
 * happened to run last — and a purge re-running is a normal thing rather than a
 * mistake, since `purge` is called on rows whose bytes may already be gone.
 */
export async function block(entry: {
  sha256: string;
  reason: string;
  source: "purge" | "admin";
}): Promise<void> {
  await query(
    `INSERT INTO blocked_images (sha256, reason, source)
     VALUES ($1, $2, $3)
     ON CONFLICT (sha256) DO NOTHING`,
    [entry.sha256, entry.reason, entry.source],
  );
}

/**
 * Let it through again.
 *
 * It exists because a blocklist without one is a list of mistakes nobody can
 * correct — a hash added by hand to the wrong entry is exactly the thing an
 * admin screen has to be able to undo. What it does NOT do is un-purge
 * anything: the rectangle whose bytes were purged stays purged, because that is
 * a different act on a different row.
 */
export async function unblock(sha256: string): Promise<boolean> {
  const rows = await query<{ sha256: string }>(
    "DELETE FROM blocked_images WHERE sha256 = $1 RETURNING sha256",
    [sha256],
  );
  return rows.length > 0;
}

/** The list an admin screen reads, newest first. */
export async function listBlocked(limit = 200): Promise<BlockedImage[]> {
  const rows = await query<{
    sha256: string;
    reason: string;
    source: string;
    blocked_at: Date;
  }>(
    `SELECT sha256, reason, source, blocked_at FROM blocked_images
      ORDER BY blocked_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    sha256: row.sha256,
    reason: row.reason,
    source: row.source as "purge" | "admin",
    blockedAt: row.blocked_at.toISOString(),
  }));
}
