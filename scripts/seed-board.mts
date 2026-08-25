import { config } from "dotenv";
import { Pool } from "pg";
import { SEED_BLOCKS } from "../src/lib/board/seed-data";

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
// database, because the test suite imports SEED_BLOCKS from seed-data.ts.
if (process.argv[1]?.endsWith("seed-board.mts")) await main();
