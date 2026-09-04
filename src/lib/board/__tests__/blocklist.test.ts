import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { execute, query } from "../../db";
import { block, isBlocked, listBlocked, unblock } from "../blocklist";
import { purge } from "../takedown";

/**
 * A takedown becomes a rule rather than an event.
 *
 * `image_sha256` has been computed and stored on every upload since migration
 * 001 and compared against nothing — it exists to fingerprint the wall for
 * cache invalidation. So until 2026-09-04 the same file could be bought onto a
 * different rectangle five minutes after it was purged, and nothing anywhere
 * would notice. `docs/imagenes.md` measured the rest of the moderation surface
 * and named this as the most urgent thing missing.
 *
 * The case that matters is the LAST one in this file: purge, then upload the
 * same bytes again.
 */

const PER_PIXEL = 1_000_000;
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function sell(x: number, bytes: Buffer | null): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                         buyer_pubkey, payment_signature, caption, link,
                         pending_image, pending_image_mime, image_sha256)
     VALUES ($1, 0, 10, 10, 'paid', $2, $3, now(), 'AWalletNobodyMayLearn', $4,
             'a caption', 'https://example.org', $5, $6, $7)
     RETURNING id`,
    [
      x, PER_PIXEL, 100 * PER_PIXEL, `sig-${x}`,
      bytes, bytes ? "image/png" : null, bytes ? sha(bytes) : null,
    ],
  );
  return rows[0].id;
}

beforeEach(async () => {
  await execute("DELETE FROM blocked_images");
});

describe("the list itself", () => {
  const hash = "a".repeat(64);

  it("says nothing about a hash it has never seen", async () => {
    expect(await isBlocked(hash)).toBeNull();
  });

  it("refuses it once it is on, and remembers why and where it came from", async () => {
    await block({ sha256: hash, reason: "reported", source: "admin" });
    const found = await isBlocked(hash);
    expect(found).toMatchObject({ sha256: hash, reason: "reported", source: "admin" });
    expect(Number.isNaN(Date.parse(found!.blockedAt))).toBe(false);
  });

  /**
   * A purge that runs twice is normal rather than a mistake — the second one
   * finds a row whose bytes are already gone. What must not happen is the
   * reason changing under it: the list should read as the judgement that was
   * made, not as whichever call happened to run last.
   */
  it("keeps the first reason when the same hash is blocked again", async () => {
    await block({ sha256: hash, reason: "the reason that was given", source: "purge" });
    await block({ sha256: hash, reason: "something somebody typed later", source: "admin" });
    expect(await isBlocked(hash)).toMatchObject({
      reason: "the reason that was given",
      source: "purge",
    });
  });

  it("lets one back off, and says whether there was anything to remove", async () => {
    await block({ sha256: hash, reason: "a mistake", source: "admin" });
    expect(await unblock(hash)).toBe(true);
    expect(await isBlocked(hash)).toBeNull();
    // The second call has nothing to do, and says so rather than reporting
    // success — an operator who mistyped a character must not be told it worked.
    expect(await unblock(hash)).toBe(false);
  });

  it("lists newest first", async () => {
    await block({ sha256: "1".repeat(64), reason: "first", source: "admin" });
    await execute("UPDATE blocked_images SET blocked_at = now() - interval '1 hour'");
    await block({ sha256: "2".repeat(64), reason: "second", source: "admin" });
    expect((await listBlocked()).map((b) => b.reason)).toEqual(["second", "first"]);
  });

  /*
    THE COLUMN'S OWN SHAPE, checked at the database rather than in the caller.
    A hash inserted by hand in the wrong case or the wrong length would never
    match anything and would sit on the list looking like protection.
  */
  it("refuses a hash that is not 64 lower-case hex characters", async () => {
    await expect(execute(
      "INSERT INTO blocked_images (sha256, reason, source) VALUES ($1, 'x', 'admin')",
      ["A".repeat(64)],
    )).rejects.toThrow();
    await expect(execute(
      "INSERT INTO blocked_images (sha256, reason, source) VALUES ($1, 'x', 'admin')",
      ["abc"],
    )).rejects.toThrow();
  });

  it("refuses a row with no reason, and a source it does not recognise", async () => {
    await expect(execute(
      "INSERT INTO blocked_images (sha256, reason, source) VALUES ($1, '   ', 'admin')",
      ["b".repeat(64)],
    )).rejects.toThrow();
    await expect(execute(
      "INSERT INTO blocked_images (sha256, reason, source) VALUES ($1, 'x', 'whoever')",
      ["c".repeat(64)],
    )).rejects.toThrow();
  });
});

describe("a purge writes to it", () => {
  it("blocks the picture it destroyed, with the purge's own reason", async () => {
    const bytes = Buffer.from("a picture somebody complained about");
    const id = await sell(0, bytes);

    expect(await isBlocked(sha(bytes))).toBeNull();
    await purge(id, "a complaint that was upheld");

    const found = await isBlocked(sha(bytes));
    expect(found).toMatchObject({ source: "purge", reason: "a complaint that was upheld" });
  });

  /**
   * THE CASE THIS WHOLE FILE IS FOR. Before 2026-09-04 the assertion below was
   * false: the bytes were gone from one rectangle and perfectly acceptable at
   * the door for the next one.
   */
  it("so the same file cannot be bought onto another rectangle afterwards", async () => {
    const bytes = Buffer.from("the same forty-two bytes, again and again");
    const first = await sell(0, bytes);
    await purge(first, "removed");

    // What the content route asks before it accepts an upload.
    expect(await isBlocked(sha(bytes))).not.toBeNull();
  });

  it("takes the hash before the bytes go, not after", async () => {
    const bytes = Buffer.from("bytes that will not exist in a moment");
    const id = await sell(0, bytes);
    await purge(id, "gone");

    // The row kept nothing to hash...
    const after = await query<{ pending_image: Buffer | null; image_sha256: string | null }>(
      "SELECT pending_image, image_sha256 FROM blocks WHERE id = $1", [id],
    );
    expect(after[0].pending_image).toBeNull();
    // ...and the list has it anyway, which is only possible if it was read first.
    expect(await isBlocked(sha(bytes))).not.toBeNull();
  });

  it("blocks nothing for a rectangle that never had a picture", async () => {
    const id = await sell(0, null);
    await purge(id, "no picture to remove");
    expect(await listBlocked()).toHaveLength(0);
  });
});
