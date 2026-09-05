import { describe, expect, it } from "vitest";
import { execute, query } from "../../db";

async function insertReserved(x: number, y: number, extra = "", params: unknown[] = []) {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at${extra ? ", " + extra : ""})
     VALUES ($1, $2, 10, 10, 'reserved', 1000000, 100000000, now() + interval '30 minutes'${
       extra ? ", " + extra.split(", ").map((_, i) => `$${i + 3}`).join(", ") : ""
     })`,
    [x, y, ...params],
  );
}

async function errorCodeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error) {
    return (error as { code?: string }).code ?? "no code";
  }
  return "no error";
}

describe("migration 002", () => {
  it("adds every column an order needs", async () => {
    const rows = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'blocks'`,
    );
    const names = rows.map((r) => r.column_name);
    for (const expected of [
      "payment_fraction",
      "payment_signature",
      "image_arweave_id",
      "metadata_arweave_id",
      "image_sha256",
      "is_animated",
      "mint_address",
      "owner_wallet",
      // Renamed by migration 006, which turned a takedown from a status into
      // a flag; it is the same column doing the same job under a name that
      // says what it is.
      "hidden_at",
      "pending_image",
      "pending_image_mime",
    ]) {
      expect(names, `missing column ${expected}`).toContain(expected);
    }
  });

  it("refuses to let one payment settle two orders", async () => {
    await insertReserved(0, 0, "payment_signature", ["sig-abc"]);
    expect(await errorCodeOf(() => insertReserved(20, 0, "payment_signature", ["sig-abc"]))).toBe(
      "23505",
    );
  });

  it("refuses two blocks claiming the same mint", async () => {
    await insertReserved(0, 0, "mint_address", ["mint-abc"]);
    expect(await errorCodeOf(() => insertReserved(20, 0, "mint_address", ["mint-abc"]))).toBe(
      "23505",
    );
  });

  it("allows many orders with no signature and no mint yet", async () => {
    await insertReserved(0, 0);
    await insertReserved(20, 0);
    await insertReserved(40, 0);
    const rows = await query("SELECT id FROM blocks");
    expect(rows).toHaveLength(3);
  });

  it("defaults is_animated to false rather than null", async () => {
    await insertReserved(0, 0);
    const rows = await query<{ is_animated: boolean }>("SELECT is_animated FROM blocks");
    expect(rows[0].is_animated).toBe(false);
  });

  it("forbids a paid order that still has an expiry", async () => {
    // A paid order must never expire. This is the invariant the whole retry
    // story rests on, so the database enforces it rather than trusting callers.
    const code = await errorCodeOf(() =>
      execute(
        `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at, approved_at)
         VALUES (0, 0, 10, 10, 'paid', 1000000, 100000000, now() + interval '30 minutes', now())`,
      ),
    );
    expect(code).toBe("23514");
  });

  it("allows a paid order with a null expiry", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at, approved_at)
       VALUES (0, 0, 10, 10, 'paid', 1000000, 100000000, NULL, now())`,
    );
    const rows = await query("SELECT id FROM blocks WHERE status = 'paid'");
    expect(rows).toHaveLength(1);
  });

  it("requires a reserved order to carry an expiry", async () => {
    const code = await errorCodeOf(() =>
      execute(
        `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at)
         VALUES (0, 0, 10, 10, 'reserved', 1000000, 100000000, NULL)`,
      ),
    );
    expect(code).toBe("23514");
  });

  it("rejects a malformed image hash", async () => {
    const code = await errorCodeOf(() =>
      insertReserved(0, 0, "image_sha256", ["not-a-hash"]),
    );
    expect(code).toBe("23514");
  });
});
