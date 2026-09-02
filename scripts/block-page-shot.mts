/**
 * What `/b/<id>` actually looks like, in both registers, at two widths.
 *
 * WHO CALLS THIS: a person, at the end of a batch that touched that page.
 * Nothing imports it. It exists because `cierre.md` §3 asks a batch that
 * produced a visual surface to READ the surface, and because production cannot
 * answer that question yet: the wall has sold nothing, so every `/b/<id>` there
 * is an honest 404 and there is no page to look at.
 *
 * So it seeds one sold rectangle into the TEST database, serves the real
 * application against it, and photographs the page. Same harness the purchase
 * suite and `board-share.mts` use — a real `next dev`, real Chrome, no
 * screenshot library — and the same lock, so it cannot run beside them.
 *
 * The artwork is a checkerboard this file draws, four pixels wide, so the
 * capture also answers the question a solid fixture cannot: is the enlargement
 * nearest-neighbour, or has something smoothed somebody's pixel art.
 *
 *     npx tsx scripts/block-page-shot.mts <directory>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";
import sharp from "sharp";
import { launchChrome, sleep } from "../src/components/__tests__/cdp";
import { startDevServer } from "../src/components/__tests__/dev-server";
import { acquireHarnessLock, releaseHarnessLock } from "../src/components/__tests__/harness-lock";

config({ path: ".env.local" });

const DATABASE = process.env.TEST_DATABASE_URL;
if (!DATABASE) {
  console.error("TEST_DATABASE_URL is not set.");
  process.exit(1);
}
process.env.DATABASE_URL = DATABASE;

const OUT = process.argv[2];
if (!OUT) {
  console.error("Usage: npx tsx scripts/block-page-shot.mts <directory>");
  process.exit(1);
}

/** Wide enough for the desktop column, and a phone. */
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

const THEMES = ["dark", "light"] as const;

/** A 40×16 checkerboard, so a smoothed enlargement is visible at a glance. */
async function fixtureArt(): Promise<Buffer> {
  const w = 40;
  const h = 16;
  const pixels = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const on = (x + y) % 2 === 0;
      const at = (y * w + x) * 3;
      pixels[at] = on ? 0xc2 : 0x1b;
      pixels[at + 1] = on ? 0x45 : 0x22;
      pixels[at + 2] = on ? 0x1e : 0x30;
    }
  }
  return sharp(pixels, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

async function main(): Promise<void> {
  acquireHarnessLock();
  mkdirSync(OUT, { recursive: true });

  const pool = new Pool({ connectionString: DATABASE });
  let id: string;
  try {
    await pool.query("TRUNCATE blocks, hold_meter CASCADE");
    const rows = await pool.query<{ id: string }>(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                           payment_signature, caption, link, image_fit,
                           pending_image, pending_image_mime)
       VALUES (120, 240, 400, 160, 'paid', 1000000, 64000000000, now(),
               'ShotFixture2Tr9vZmP4nLcXyB8dQfHjRsA6EuVoT1iN3gYkM7pWzC2xJhFbD5rSaGnQ4tU',
               'A shop that sells nothing', 'https://example.com/shop', 'contain', $1, 'image/png')
       RETURNING id`,
      [await fixtureArt()],
    );
    id = rows.rows[0].id;
    // A click count, because zero and non-zero print different sentences and
    // the capture should show the one a buyer with traffic sees.
    await pool.query(`INSERT INTO block_clicks (block_id, clicks) VALUES ($1, 412)`, [id]);
  } finally {
    await pool.end();
  }

  const server = await startDevServer();
  const browser = await launchChrome();

  try {
    /*
      EVERY console.error AND console.warn THE PAGE PRODUCES, collected before
      anything else runs. A capture shows what the page looks like and says
      nothing about what React thought of it — a hydration mismatch is a silent
      paragraph in the console and a red dot on the dev overlay, and the point
      of looking at a screenshot is to catch what no assertion thought to check.
    */
    await browser.addInitScript(
      `(function(){var o=console.error,w=console.warn;window.__logs=[];` +
        `console.error=function(){window.__logs.push("ERROR "+[].join.call(arguments," "));o.apply(console,arguments)};` +
        `console.warn=function(){window.__logs.push("WARN "+[].join.call(arguments," "));w.apply(console,arguments)}})()`,
    );

    for (const theme of THEMES) {
      // Stamped before the document runs, which is where the real boot script
      // reads it from — setting it after paint would photograph the transition
      // rather than the register.
      await browser.addInitScript(`try{localStorage.setItem("mdp-theme","${theme}")}catch(e){}`);
      for (const view of VIEWPORTS) {
        await browser.resize(view.width, view.height);
        await browser.goto(`${server.origin}/b/${id}`);
        await sleep(1200);
        writeFileSync(join(OUT, `b-${view.name}-${theme}.png`), await browser.screenshot());
        console.log(`  wrote b-${view.name}-${theme}.png`);

        // The snippet and the card link are below the fold at every viewport
        // this page is read at, and they are half of what this batch added.
        await browser.evaluate(`document.querySelector(".prose-page").scrollTo(0, 99999); true`);
        await sleep(500);
        writeFileSync(join(OUT, `b-${view.name}-${theme}-foot.png`), await browser.screenshot());
        console.log(`  wrote b-${view.name}-${theme}-foot.png`);

        const logs = await browser.evaluate<string[]>(`window.__logs || []`);
        if (logs.length > 0) {
          console.log(`  !! ${view.name} ${theme} console:`);
          for (const line of logs) console.log(`     ${line}`);
        }
      }
    }
    console.log(`\n  the badge itself: ${server.origin}/api/blocks/${id}/badge`);
    const badge = await fetch(`${server.origin}/api/blocks/${id}/badge`);
    writeFileSync(join(OUT, "badge.svg"), Buffer.from(await badge.arrayBuffer()));
    console.log(`  wrote badge.svg (${badge.status})`);
  } finally {
    await browser.close();
    await server.stop();
    releaseHarnessLock();
  }
}

main().catch((error: unknown) => {
  releaseHarnessLock();
  console.error(error);
  process.exit(1);
});
