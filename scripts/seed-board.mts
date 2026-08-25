import { config } from "dotenv";
import { Pool } from "pg";

/**
 * Demo blocks, for development only.
 *
 * These exist so a local board has something on it: without sold blocks there
 * is no collision to see, and the red overlay is half of what this batch is
 * for. The rectangles deliberately include a touching pair, because "two
 * blocks may share an edge" is the rule most likely to be broken by accident.
 *
 * SEED_BLOCKS is exported so the test suite can check the rectangles are legal
 * without connecting to a database or running this script.
 */

export const SEED_BLOCKS = [
  { x: 0, y: 0, w: 100, h: 100, caption: "Top left corner", link: "https://example.com/1" },
  { x: 100, y: 0, w: 100, h: 100, caption: "Right beside it", link: "https://example.com/2" },
  { x: 300, y: 120, w: 200, h: 50, caption: "A wide banner", link: "https://example.com/3" },
  { x: 640, y: 300, w: 60, h: 60, caption: "A small square", link: "https://example.com/4" },
  { x: 200, y: 400, w: 10, h: 10, caption: "The minimum block", link: "https://example.com/5" },
  { x: 800, y: 700, w: 200, h: 300, caption: "Bottom right", link: "https://example.com/6" },
  { x: 450, y: 600, w: 120, h: 120, caption: "Middle of nowhere", link: "https://example.com/7" },
] as const;

async function main(): Promise<void> {
  config({ path: ".env.local" });

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. There is no default.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const price = 1_000_000;

  for (const block of SEED_BLOCKS) {
    await pool.query(
      `INSERT INTO blocks (x, y, w, h, status, caption, link, image_fit,
                           price_per_pixel_usdc, total_usdc, minted_at)
       VALUES ($1, $2, $3, $4, 'minted', $5, $6, 'contain', $7, $8, now())
       ON CONFLICT DO NOTHING`,
      [block.x, block.y, block.w, block.h, block.caption, block.link, price,
       block.w * block.h * price],
    );
  }

  console.log(`seeded ${SEED_BLOCKS.length} block(s)`);
  await pool.end();
}

// Only connect when run as a script; importing this file must not touch a
// database, because the test suite imports it for SEED_BLOCKS.
if (process.argv[1]?.endsWith("seed-board.mts")) await main();
