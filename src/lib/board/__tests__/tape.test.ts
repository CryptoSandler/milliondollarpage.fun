import { describe, expect, it } from "vitest";
import { execute, query } from "../../db";
import { SIGNATURE_KEPT, recentPurchases } from "../tape";

/**
 * The settled-purchase register, and the two things it must never leak.
 *
 * This suite is as much about what is ABSENT from a row as about what is in
 * one. Two assertions carry that: no query result may contain a buyer's
 * address, and no signature may come back whole. Both are cheap to write and
 * both would have caught the obvious implementation, which selects `*`.
 */

const PER_PIXEL = 1_000_000;

/** An 88-character base58 signature, the length Solana actually produces. */
function signature(seed: string): string {
  return seed.repeat(Math.ceil(88 / seed.length)).slice(0, 88);
}

async function sell(
  x: number,
  y: number,
  w: number,
  h: number,
  options: { at?: string; signature?: string | null; status?: string; buyer?: string } = {},
): Promise<void> {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc,
                         paid_at, payment_signature, buyer_pubkey)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      x,
      y,
      w,
      h,
      options.status ?? "paid",
      PER_PIXEL,
      w * h * PER_PIXEL,
      options.at ?? null,
      // Unique per rectangle: `blocks_payment_signature_unique` is the
      // constraint that stops one transfer settling two orders, and a fixture
      // reusing a string trips it rather than testing anything.
      options.signature === undefined ? signature(`${x}Kq${y}xVn7`) : options.signature,
      options.buyer ?? "BUYERWALLETADDRESSTHATMUSTNEVERAPPEAR",
    ],
  );
}

describe("recentPurchases", () => {
  it("returns nothing on a board where nothing has settled", async () => {
    expect(await recentPurchases()).toEqual([]);
  });

  it("returns settled purchases newest first", async () => {
    await sell(0, 0, 10, 10, { at: "2026-01-01T00:00:00Z" });
    await sell(20, 0, 10, 10, { at: "2026-03-01T00:00:00Z" });
    await sell(40, 0, 10, 10, { at: "2026-02-01T00:00:00Z" });

    const rows = await recentPurchases();
    expect(rows.map((row) => row.x)).toEqual([20, 40, 0]);
  });

  /**
   * The reason `paid_at` exists at all. A hold taken half an hour before the
   * money moved would have made this row read "just now" long after it landed
   * — see `migrations/012_paid_at.sql`.
   */
  it("dates a row from when it settled, not from when the hold was taken", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc,
                           created_at, paid_at, payment_signature)
       VALUES (0, 0, 10, 10, 'paid', $1, $2, '2026-01-01T00:00:00Z', '2026-01-01T00:29:00Z', $3)`,
      [PER_PIXEL, 100 * PER_PIXEL, signature("Ap6E4Tz9")],
    );

    const [row] = await recentPurchases();
    expect(row.paidAt).toBe(new Date("2026-01-01T00:29:00Z").toISOString());
  });

  it("leaves holds off it entirely, settled or not", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc)
       VALUES (0, 0, 10, 10, 'reserved', '2999-01-01T00:00:00Z', $1, $2)`,
      [PER_PIXEL, 100 * PER_PIXEL],
    );
    expect(await recentPurchases()).toEqual([]);
  });

  it("keeps a minted purchase, which is a sale that went one step further", async () => {
    await sell(0, 0, 10, 10, { status: "minted", at: "2026-01-01T00:00:00Z" });
    expect(await recentPurchases()).toHaveLength(1);
  });

  /**
   * A takedown removes CONTENT and leaves the sale standing, so the register
   * has to keep the row: dropping it would make the register disagree with the
   * money. Nothing content-shaped is on a row anyway.
   */
  it("keeps a taken-down purchase, because the sale still happened", async () => {
    await sell(0, 0, 10, 10, { at: "2026-01-01T00:00:00Z" });
    await execute("UPDATE blocks SET hidden_at = now()");
    expect(await recentPurchases()).toHaveLength(1);
  });

  it("carries the rectangle, its area and what was paid for it", async () => {
    await sell(120, 340, 50, 20, { at: "2026-01-01T00:00:00Z" });
    const [row] = await recentPurchases();
    expect(row).toMatchObject({
      x: 120,
      y: 340,
      w: 50,
      h: 20,
      pixels: 1_000,
      totalBaseUnits: 1_000 * PER_PIXEL,
    });
  });

  it("takes the newest rows only, when asked for fewer than there are", async () => {
    for (let i = 0; i < 5; i += 1) {
      await sell(i * 20, 0, 10, 10, { at: `2026-01-0${i + 1}T00:00:00Z` });
    }
    const rows = await recentPurchases(2);
    expect(rows.map((row) => row.x)).toEqual([80, 60]);
  });

  describe("what a row must not carry", () => {
    it("cuts the signature to eight characters, on the server", async () => {
      const whole = signature("5Kq2xVn7");
      await sell(0, 0, 10, 10, { at: "2026-01-01T00:00:00Z", signature: whole });

      const [row] = await recentPurchases();
      expect(row.signature).toBe(
        `${whole.slice(0, SIGNATURE_KEPT)}…${whole.slice(-SIGNATURE_KEPT)}`,
      );
      // The point of cutting it in SQL rather than in the component: the whole
      // string is never in anything the browser is handed.
      expect(JSON.stringify(row)).not.toContain(whole);
      expect(row.signature!.length).toBe(SIGNATURE_KEPT * 2 + 1);
    });

    it("never carries the address that paid", async () => {
      await sell(0, 0, 10, 10, {
        at: "2026-01-01T00:00:00Z",
        buyer: "BUYERWALLETADDRESSTHATMUSTNEVERAPPEAR",
      });

      const rows = await recentPurchases();
      expect(JSON.stringify(rows)).not.toContain("BUYERWALLETADDRESSTHATMUSTNEVERAPPEAR");
      expect(Object.keys(rows[0])).not.toContain("buyerPubkey");
      expect(Object.keys(rows[0])).not.toContain("ownerWallet");
    });

    it("says a sale is unsigned rather than inventing a proof for it", async () => {
      await sell(0, 0, 10, 10, { at: "2026-01-01T00:00:00Z", signature: null });
      const [row] = await recentPurchases();
      expect(row.signature).toBeNull();
    });
  });
});

/**
 * The column and its two rules, tested against the database rather than
 * against the function that reads them.
 */
describe("paid_at, as the database enforces it", () => {
  it("stamps a sale that arrives without one", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc)
       VALUES (0, 0, 10, 10, 'paid', $1, $2)`,
      [PER_PIXEL, 100 * PER_PIXEL],
    );
    const [row] = await query<{ paid_at: Date | null }>("SELECT paid_at FROM blocks");
    expect(row.paid_at).toBeInstanceOf(Date);
  });

  it("stamps a hold at the moment it becomes a sale", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc)
       VALUES (0, 0, 10, 10, 'reserved', '2999-01-01T00:00:00Z', $1, $2)`,
      [PER_PIXEL, 100 * PER_PIXEL],
    );
    const [held] = await query<{ paid_at: Date | null }>("SELECT paid_at FROM blocks");
    expect(held.paid_at).toBeNull();

    await execute("UPDATE blocks SET status = 'paid', expires_at = NULL");
    const [sold] = await query<{ paid_at: Date | null }>("SELECT paid_at FROM blocks");
    expect(sold.paid_at).toBeInstanceOf(Date);
  });

  it("never moves a settlement time that is already there", async () => {
    await sell(0, 0, 10, 10, { at: "2026-01-01T00:00:00Z" });
    await execute("UPDATE blocks SET caption = 'anything'");
    const [row] = await query<{ paid_at: Date }>("SELECT paid_at FROM blocks");
    expect(row.paid_at.toISOString()).toBe(new Date("2026-01-01T00:00:00Z").toISOString());
  });

  /**
   * The half of the CHECK the trigger cannot do. The trigger only ever fills,
   * so nothing but the constraint refuses a rectangle nobody has paid for
   * carrying a settlement time.
   */
  it("refuses a hold that claims to have settled", async () => {
    await expect(
      execute(
        `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc, paid_at)
         VALUES (0, 0, 10, 10, 'reserved', '2999-01-01T00:00:00Z', $1, $2, now())`,
        [PER_PIXEL, 100 * PER_PIXEL],
      ),
    ).rejects.toThrow(/blocks_paid_at_matches_status/);
  });
});
