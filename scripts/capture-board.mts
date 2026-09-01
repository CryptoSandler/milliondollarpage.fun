/**
 * Screenshots of the board, at the two widths and in the two states, for a
 * design gate.
 *
 * WHO CALLS THIS: a person, by hand, before asking the owner to look at a
 * register change — `npx tsx scripts/capture-board.mts <out-dir>`. Nothing in
 * the suite calls it and nothing should: it starts a server, drives a browser
 * and writes files, which is a thing to do deliberately rather than on every
 * `npm test`.
 *
 * WHY IT IMPORTS OUT OF `__tests__`. `cdp.ts` and `dev-server.ts` are the only
 * browser driver and the only real-server harness in this repository, and they
 * were written for `purchase-e2e.test.ts`. Copying either into `scripts/` would
 * give the project two of each, and the second one would be the one that rots.
 * The import is deliberate and the direction is safe: nothing in `__tests__`
 * imports back out of here.
 *
 * WHAT IT DOES NOT DO. It does not diff anything and it does not pass or fail.
 * A screenshot is evidence for a person; the assertions about the board's fit
 * and its frame live in `purchase-e2e.test.ts`, where they can fail.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";
import { launchChrome, sleep, waitFor } from "../src/components/__tests__/cdp";
import { startDevServer } from "../src/components/__tests__/dev-server";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../src/lib/board/geometry";

config({ path: ".env.local" });

/**
 * The test database, and nothing else. This script TRUNCATEs to seed a board,
 * so it refuses to run against anything that is not explicitly disposable —
 * the same guard `vitest.setup.ts` makes, for the same reason.
 */
const DATABASE = process.env.TEST_DATABASE_URL;
if (!DATABASE) {
  console.error("TEST_DATABASE_URL is not set. This script truncates; it will not guess.");
  process.exit(1);
}

const OUT = process.argv[2];
if (!OUT) {
  console.error("usage: npx tsx scripts/capture-board.mts <out-dir>");
  process.exit(1);
}

/**
 * The two widths, and why these two.
 *
 * 1440 is the commonest laptop the board is looked at on and the width the fit
 * maths was first got wrong at. 1920 is where the panel stops being the
 * constraint and the board is limited by height instead — a different branch of
 * the same arithmetic, and the one where a register change is most likely to
 * leave the board smaller than it needs to be.
 */
const WIDTHS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
];

/**
 * A board with enough on it to judge the register against real artwork, laid
 * out deterministically so two captures taken a week apart are comparable.
 *
 * The colours are chosen to be hostile on purpose: a photograph-ish brown, a
 * near-white, a saturated yellow and a near-black. If a sold rectangle can be
 * told from a free one in all four, the "state never depends on the buyer's
 * hue" rule is holding.
 */
const FILL = [
  "#1f4fd8",
  "#eab308",
  "#f8fafc",
  "#ef4444",
  "#8c5a3c",
  "#0b0f14",
  "#a855f7",
  "#22d3ee",
];

type Rect = { x: number; y: number; w: number; h: number; fill: string };

function layout(): Rect[] {
  // A deterministic pseudo-random walk: same board every run, no dependency on
  // Math.random, and no two rectangles overlapping (which the database would
  // refuse anyway, loudly).
  let seed = 20260901;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  const placed: Rect[] = [];
  const hits = (r: Rect) =>
    placed.some(
      (p) => r.x < p.x + p.w && p.x < r.x + r.w && r.y < p.y + p.h && p.y < r.y + r.h,
    );

  for (let i = 0; i < 140; i += 1) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const w = Math.max(1, Math.round(next() ** 2.2 * 260));
      const h = Math.max(1, Math.round(next() ** 2.2 * 170));
      const candidate = {
        x: Math.round(next() * (BOARD_WIDTH - w)),
        y: Math.round(next() * (BOARD_HEIGHT - h)),
        w,
        h,
        fill: FILL[Math.floor(next() * FILL.length)],
      };
      if (!hits(candidate)) {
        placed.push(candidate);
        break;
      }
    }
  }
  return placed;
}

async function seed(rects: Rect[]): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE });
  try {
    await pool.query("TRUNCATE blocks, hold_meter CASCADE");
    for (const [index, rect] of rects.entries()) {
      await pool.query(
        `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc,
                             paid_at, payment_signature, caption)
         VALUES ($1, $2, $3, $4, 'paid', 1000000, $5, now() - make_interval(mins => $6), $7, $8)`,
        [
          rect.x,
          rect.y,
          rect.w,
          rect.h,
          rect.w * rect.h * 1_000_000,
          index,
          `capture-${index}`.padEnd(88, "x"),
          "A rectangle somebody bought",
        ],
      );
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });

  const server = await startDevServer();
  const browser = await launchChrome();

  try {
    for (const state of ["empty", "full"] as const) {
      await seed(state === "full" ? layout() : []);

      for (const size of WIDTHS) {
        await browser.resize(size.width, size.height);
        await browser.goto(server.origin);

        // The same settle the fit guard uses: the canvas has no size until
        // layout runs, so the first paint is of a board fitted to a zero box.
        // Two identical reads a beat apart means the re-fit has happened.
        const read = `document.querySelector('canvas')?.dataset.boardRect ?? null`;
        await waitFor(`the board's fit at ${size.name} to settle`, async () => {
          const before = await browser.evaluate<string | null>(read);
          await sleep(200);
          const after = await browser.evaluate<string | null>(read);
          return before !== null && before === after ? after : null;
        });
        // The wall is one bitmap fetched after the first paint. Without this the
        // "full" capture is a board of fallback rectangles, which is a real
        // state and not the one being judged.
        await sleep(1_200);

        const name = `board-${state}-${size.name}.png`;
        await writeFile(join(OUT, name), await browser.screenshot());
        console.log(`wrote ${name}`);
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }
}

await main();
