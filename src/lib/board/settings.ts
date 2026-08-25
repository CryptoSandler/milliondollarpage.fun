import { queryOne } from "../db";

/**
 * Settings live in the database, not the environment, because the admin
 * console has to change them without a redeploy. There is no fallback here on
 * purpose: the price is seeded by migration 001, so a missing row means the
 * database is not the one we think it is, and guessing a dollar would sell
 * pixels at a price nobody set.
 */

export class SettingMissing extends Error {
  constructor(key: string) {
    super(`Setting "${key}" is not in the settings table. Migration 001 seeds it.`);
    this.name = "SettingMissing";
  }
}

async function setting(key: string): Promise<string> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", [key]);
  if (!row) throw new SettingMissing(key);
  return row.value;
}

/** USDC base units per pixel. USDC has six decimals, so 1_000_000 is one dollar. */
export async function pricePerPixelBaseUnits(): Promise<number> {
  return Number(await setting("price_per_pixel_usdc"));
}
