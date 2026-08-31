import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { execute, query } from "../../db";

/**
 * The permanence invariant, attacked rather than described.
 *
 * `SECURITY.md` says a sold pixel does not change owner or content without its
 * owner's signature and never expires. Migration 005 wrote the first half as a
 * trigger; the 2026-08-28 audit showed the trigger could be walked around,
 * because its WHEN clause reads `OLD.status` and a statement can change that
 * first. Migration 011 closed both routes.
 *
 * EVERY CASE HERE IS AN ATTEMPT, NOT AN ASSERTION ABOUT A COLUMN. A test that
 * checked the trigger exists would pass with the trigger doing nothing. These
 * run the statements an attacker with database access would run, and require
 * the database to refuse them.
 */
const OWNER = "OwnerPubkey11111111111111111111111111111111";
const THIEF = "ThiefPubkey11111111111111111111111111111111";

let slot = 0;

async function soldBlock(): Promise<string> {
  const id = randomUUID();
  // A fresh rectangle per row: sold rows cannot be deleted any more, which is
  // the point, so a fixed rectangle would collide with the previous test's.
  const x = 200 + slot++ * 20;
  await execute(
    `INSERT INTO blocks (id, x, y, w, h, status, price_per_pixel_usdc, total_usdc, buyer_pubkey, created_at)
     VALUES ($1, $2, 500, 10, 10, 'paid', 1000000, 100000000, $3, now())`,
    [id, x, OWNER],
  );
  return id;
}

async function ownerOf(id: string): Promise<string | null> {
  const rows = await query<{ buyer_pubkey: string | null }>(
    "SELECT buyer_pubkey FROM blocks WHERE id = $1",
    [id],
  );
  return rows[0]?.buyer_pubkey ?? null;
}

beforeEach(() => {
  slot = 0;
});

describe("a sale cannot change hands", () => {
  it("refuses the direct owner change", async () => {
    const id = await soldBlock();
    await expect(
      execute("UPDATE blocks SET buyer_pubkey = $2 WHERE id = $1", [id, THIEF]),
    ).rejects.toThrow(/cannot be changed/);
    expect(await ownerOf(id)).toBe(OWNER);
  });

  /**
   * The audit's bypass, in the exact form that worked.
   *
   * An earlier three-statement version does NOT work — `blocks_paid_never_expires`
   * refuses a paid row carrying an expiry — which is why the middle statement
   * supplies one. That detail is here because a test written from the shorter
   * recipe would pass against a database with the hole still in it.
   */
  it("refuses the downgrade that used to launder the owner change", async () => {
    const id = await soldBlock();
    await expect(
      execute(
        "UPDATE blocks SET status = 'reserved', expires_at = now() + interval '1 hour' WHERE id = $1",
        [id],
      ),
    ).rejects.toThrow(/cannot go back to/);
    expect(await ownerOf(id)).toBe(OWNER);
  });

  it("refuses the whole three-statement laundering, and the sale is untouched", async () => {
    const id = await soldBlock();
    await expect(
      (async () => {
        await execute(
          "UPDATE blocks SET status = 'reserved', expires_at = now() + interval '1 hour' WHERE id = $1",
          [id],
        );
        await execute("UPDATE blocks SET buyer_pubkey = $2 WHERE id = $1", [id, THIEF]);
        await execute("UPDATE blocks SET status = 'paid', expires_at = NULL WHERE id = $1", [id]);
      })(),
    ).rejects.toThrow();

    const rows = await query<{ status: string; buyer_pubkey: string }>(
      "SELECT status, buyer_pubkey FROM blocks WHERE id = $1",
      [id],
    );
    expect(rows[0]).toEqual({ status: "paid", buyer_pubkey: OWNER });
  });
});

describe("a sale cannot be deleted", () => {
  it("refuses DELETE on a sold row, so its pixels never return to the board", async () => {
    const id = await soldBlock();
    await expect(execute("DELETE FROM blocks WHERE id = $1", [id])).rejects.toThrow(
      /cannot be deleted/,
    );
    expect(await ownerOf(id)).toBe(OWNER);
  });

  it("still deletes holds, because the expiry sweep depends on it", async () => {
    const id = randomUUID();
    await execute(
      `INSERT INTO blocks (id, x, y, w, h, status, price_per_pixel_usdc, total_usdc, buyer_pubkey, expires_at, created_at)
       VALUES ($1, 400, 500, 10, 10, 'reserved', 1000000, 100000000, $2, now() + interval '1 hour', now())`,
      [id, OWNER],
    );
    await execute("DELETE FROM blocks WHERE id = $1", [id]);
    expect(await ownerOf(id)).toBeNull();
  });
});

describe("what 011 must NOT have broken", () => {
  it("still lets a takedown hide content and a purge destroy it, leaving the sale standing", async () => {
    const id = await soldBlock();

    await execute("UPDATE blocks SET hidden_at = now(), takedown_reason = $2 WHERE id = $1", [
      id,
      "reported",
    ]);
    await execute("SELECT block_purge_content($1, $2)", [id, "court order"]);

    const rows = await query<{
      status: string;
      buyer_pubkey: string;
      purged_at: Date | null;
      caption: string | null;
    }>("SELECT status, buyer_pubkey, purged_at, caption FROM blocks WHERE id = $1", [id]);

    // Content gone, sale and owner exactly as they were: SECURITY.md's rule
    // that a takedown is about what is displayed and never about who owns it.
    expect(rows[0].caption).toBeNull();
    expect(rows[0].purged_at).not.toBeNull();
    expect(rows[0].status).toBe("paid");
    expect(rows[0].buyer_pubkey).toBe(OWNER);
  });
});
