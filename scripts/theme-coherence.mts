/**
 * Measures whether toggling the theme reads as a different site.
 *
 * WHO CALLS THIS: a person, by hand, when the two themes' typography is in
 * question — `npx tsx scripts/theme-coherence.mts`. It answers a design
 * question with a number instead of an opinion, and the number goes in
 * DESIGN.md.
 *
 * ## What it measures, and why this proxy
 *
 * The real question is perceptual: does the page feel like the same product
 * after the switch. That is not directly measurable here. What IS measurable is
 * the thing that most reliably causes the feeling — **re-flow**. A theme
 * toggle that only changes colour leaves every box exactly where it was; one
 * that changes typeface moves text, and text that moves drags its container,
 * its neighbours and the reader's sense that the page was rebuilt rather than
 * repainted.
 *
 * So it loads one page, records the bounding box of every element that carries
 * text in the chrome, toggles the theme, and records them again. The output is
 * the drift per element and the worst of them.
 *
 * ## How to read the number
 *
 * A drift of zero means the two themes are the same layout in two colourways —
 * the switch is a repaint. Sub-pixel to a pixel or two is rounding in font
 * metrics and reads as nothing. Once a heading moves further than its own line
 * height, or a fixed bar changes height, the page is being rebuilt and the
 * typefaces are the reason.
 *
 * It does NOT decide. It produces the evidence a person decides on.
 */
import { config } from "dotenv";
import { Pool } from "pg";
import { launchChrome, sleep, waitFor } from "../src/components/__tests__/cdp";
import { startDevServer } from "../src/components/__tests__/dev-server";
import { acquireHarnessLock, releaseHarnessLock } from "../src/components/__tests__/harness-lock";

config({ path: ".env.local" });

const DATABASE = process.env.TEST_DATABASE_URL;
if (!DATABASE) {
  console.error("TEST_DATABASE_URL is not set.");
  process.exit(1);
}
process.env.DATABASE_URL = DATABASE;

/**
 * The chrome, and only the chrome. The board is a canvas — it has no text to
 * re-flow — and the whole question is about type.
 */
const WATCHED = [
  "header.board-bar h1",
  "header.board-bar .board-counters, header.board-bar p",
  ".board-controls .selection-readout p",
  ".board-controls .btn-primary",
  ".board-tape__head",
  ".board-tape__row",
];

const MEASURE = `(() => {
  const seen = [];
  for (const selector of ${JSON.stringify(WATCHED)}) {
    for (const el of document.querySelectorAll(selector)) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      seen.push({
        what: selector + " #" + seen.filter((s) => s.what.startsWith(selector)).length,
        x: box.x, y: box.y, w: box.width, h: box.height,
      });
    }
  }
  return JSON.stringify(seen);
})()`;

type Box = { what: string; x: number; y: number; w: number; h: number };

async function main(): Promise<void> {
  acquireHarnessLock();
  const server = await startDevServer();
  const browser = await launchChrome();

  try {
    /*
      SEED A KNOWN BOARD FIRST, because the element set depends on it.

      This script used to measure whatever the test database happened to hold,
      and that is not a constant: the suite truncates between runs. On an EMPTY
      board the pixels-left counter carries `sm:hidden` — the million is already
      in the offer line beside it — so it has no box, is skipped, and its drift
      is silently absent from the table. An earlier run of this reported 0.0px
      across the fixed chrome for exactly that reason, and the counter turned
      out to be the largest drift on the page.

      A comparison has to control everything except the thing being compared.
      The board state is one of those things.
    */
    const pool = new Pool({ connectionString: DATABASE });
    try {
      await pool.query("TRUNCATE blocks, hold_meter CASCADE");
      await pool.query(
        `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                             payment_signature, caption)
         VALUES (0, 0, 120, 90, 'paid', 1000000, 10800000000, now(), 'coherence-fixture', 'A rectangle')`,
      );
    } finally {
      await pool.end();
    }

    await browser.resize(1440, 900);
    await browser.goto(`${server.origin}/?coherence=1`);
    await waitFor("the board to settle", async () => {
      const at = await browser.evaluate<string | null>(
        `document.querySelector('canvas')?.dataset.boardRect ?? null`,
      );
      return at;
    });
    await sleep(1_200);

    /*
      FREEZE EVERY ANIMATION FIRST, or this measures the wrong thing.

      The settled rail rolls, so two measurements 900ms apart catch the track at
      two offsets and report a drift that has nothing to do with typography. The
      first run of this said 7.0px on the tape rows with their width and height
      unchanged, which is the signature of a moving track rather than a
      re-flowing one — and a measurement that cannot tell those apart is not
      evidence.
    */
    await browser.evaluate(`(() => {
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
      document.head.appendChild(style);
      return true;
    })()`);
    await sleep(200);

    /*
      STAMP LIGHT EXPLICITLY, and do not trust the browser's preference.

      The first version of this measured "light" by simply not stamping
      anything — which follows `prefers-color-scheme`, and this machine's
      headless Chrome prefers DARK. So both passes were the dark theme, both
      reported Space Grotesk, and the script printed a drift of 0.0px across
      every element and called it a clean result.

      That is the failure mode GATES.md names: a guard green over the defect it
      exists for. It was caught only because the script also prints the computed
      typefaces, which is now the first thing to read in its output.
    */
    await browser.evaluate(`document.documentElement.setAttribute("data-theme", "light")`);
    await sleep(400);

    const light = JSON.parse(await browser.evaluate<string>(MEASURE)) as Box[];
    const lightFaces = JSON.parse(
      await browser.evaluate<string>(`JSON.stringify({
        display: getComputedStyle(document.querySelector("header.board-bar h1")).fontFamily,
        mono: getComputedStyle(document.querySelector(".board-tape__size") || document.body).fontFamily,
      })`),
    ) as Record<string, string>;
    console.log(`\n  light display: ${lightFaces.display}`);
    console.log(`  light mono:    ${lightFaces.mono}`);

    // Toggle to dark through the attribute the toggle writes, so this measures
    // the same switch a reader performs rather than a different one.
    await browser.evaluate(`document.documentElement.setAttribute("data-theme", "dark")`);
    // Long enough for the faces to apply and the board to repaint.
    await sleep(900);

    const dark = JSON.parse(await browser.evaluate<string>(MEASURE)) as Box[];

    /*
      AND CHECK THE FONTS ACTUALLY CHANGED, because a drift of zero has two
      explanations and only one of them is good news. If the typefaces did not
      switch, this whole script measures nothing and reports it as a clean
      result — which is exactly the shape of a guard that is green over the
      defect it exists for.
    */
    const faces = JSON.parse(
      await browser.evaluate<string>(`JSON.stringify({
        display: getComputedStyle(document.querySelector("header.board-bar h1")).fontFamily,
        mono: getComputedStyle(document.querySelector(".board-tape__size") || document.body).fontFamily,
      })`),
    ) as Record<string, string>;
    console.log(`  dark display:  ${faces.display}`);
    console.log(`  dark mono:     ${faces.mono}`);

    /*
      AND REFUSE IF THE TWO PASSES MEASURED THE SAME STATE.

      This is the assertion the whole script exists to have. Its first run
      reported 0.0px on every element and concluded the two themes were one
      layout in two colourways — having measured the dark theme twice, because
      "light" meant "stamp nothing", which follows prefers-color-scheme, and
      this machine's headless Chrome prefers dark. A perfect score over a
      comparison that never happened.

      Breaking the thing under test would not have caught it: change the
      typefaces however you like and a script measuring one theme twice still
      returns 0.0px. Only the identity of what was measured can. See
      `~/.claude/GATES.md`, "A comparison names both states".
    */
    if (lightFaces.display === faces.display && lightFaces.mono === faces.mono) {
      console.error(
        "\n  REFUSED: both passes resolved the same typefaces, so this compared a " +
          "state with itself.\n  The drift below would be 0.0px whatever the two " +
          "themes actually do.",
      );
      process.exitCode = 1;
      return;
    }

    console.log(`\n  ${"element".padEnd(46)}  ${"Δx".padStart(7)}${"Δy".padStart(8)}${"Δw".padStart(8)}${"Δh".padStart(8)}`);
    let worst = 0;
    let worstWhat = "";
    for (const before of light) {
      const after = dark.find((box) => box.what === before.what);
      if (!after) {
        console.log(`  ${before.what.padEnd(46)}  gone in dark`);
        worst = Infinity;
        worstWhat = before.what;
        continue;
      }
      const d = {
        x: after.x - before.x,
        y: after.y - before.y,
        w: after.w - before.w,
        h: after.h - before.h,
      };
      const drift = Math.max(...Object.values(d).map(Math.abs));
      if (drift > worst) {
        worst = drift;
        worstWhat = before.what;
      }
      console.log(
        `  ${before.what.padEnd(46)}  ${d.x.toFixed(1).padStart(7)}${d.y.toFixed(1).padStart(8)}` +
          `${d.w.toFixed(1).padStart(8)}${d.h.toFixed(1).padStart(8)}`,
      );
    }

    console.log(`\n  worst drift: ${worst.toFixed(1)}px, on ${worstWhat}`);
    console.log(
      worst <= 2
        ? "  → the switch is a repaint. The typefaces are not rebuilding the page."
        : "  → the switch re-flows the page. The typefaces are changing the layout, not the skin.",
    );
  } finally {
    await browser.close();
    await server.stop();
    releaseHarnessLock();
  }
}

await main();
