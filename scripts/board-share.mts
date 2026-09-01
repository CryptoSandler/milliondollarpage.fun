/**
 * The vertical chrome budget, checked, and the board's share of each viewport,
 * reported.
 *
 * WHO CALLS THIS: a person, and `purchase-e2e.test.ts` imports nothing from it
 * — the browser suite has its own four-width fit guard and this is the budget
 * question, which is a different one.
 *
 * ## Why a budget and not a percentage
 *
 * The obvious guard is "the board is at least N% of the viewport", and it does
 * not survive contact with the arithmetic. The board is 1250×800, an aspect of
 * 1.5625; a 1920×1080 viewport is 1.778. They do not match, so the board can
 * never fill it: with **no chrome at all** — no header, no rail, no inset — the
 * ceiling at 1920×1080 is 87.9%, which leaves an 18px budget for everything if
 * the threshold is 85%. A percentage threshold therefore encodes the viewport's
 * aspect ratio as much as it encodes the design, and fails on a monitor nobody
 * was thinking about.
 *
 * What the design actually controls is how much VERTICAL room the chrome takes.
 * That is the number this guards, it is the same number at every viewport, and
 * the percentages fall out of it. They are reported rather than asserted.
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
 * The budget, in CSS pixels of vertical room the chrome may take.
 *
 * 60 with nothing selected: a 34px header, a 26px rail, and the 8px board inset
 * on each side counted separately below. 140 once the purchase panel is open,
 * which is the one piece of chrome that comes and goes.
 */
const BUDGET_IDLE = 60;
const BUDGET_SELECTED = 140;

const VIEWPORTS = [
  { name: "1440×900", width: 1440, height: 900 },
  { name: "1920×1080", width: 1920, height: 1080 },
  { name: "1280×800", width: 1280, height: 800 },
  { name: "390×844", width: 390, height: 844 },
];

/**
 * How much vertical room the chrome is taking, measured off the page.
 *
 * The union of what the fixed chrome covers vertically, not the sum of its
 * heights: two bars that overlapped would otherwise be counted twice, and a
 * floating panel sitting over the letterbox is not costing the board anything
 * the board was going to use.
 */
const MEASURE = `(() => {
  const board = document.querySelector("canvas")?.dataset.boardRect ?? null;
  const parts = [];
  for (const selector of ["header.board-bar", ".board-tape", ".board-controls:not([hidden])"]) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const box = el.getBoundingClientRect();
    if (box.height === 0) continue;
    parts.push({ what: selector, top: box.top, bottom: box.bottom, height: box.height });
  }
  return JSON.stringify({ board, parts, vw: innerWidth, vh: innerHeight });
})()`;

type Reading = {
  board: string | null;
  parts: { what: string; top: number; bottom: number; height: number }[];
  vw: number;
  vh: number;
};

/** The vertical band the chrome occupies, with overlaps counted once. */
function chromeHeight(parts: Reading["parts"]): number {
  const spans = parts.map((p) => [p.top, p.bottom] as const).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursor = -Infinity;
  for (const [top, bottom] of spans) {
    const from = Math.max(top, cursor);
    if (bottom > from) total += bottom - from;
    cursor = Math.max(cursor, bottom);
  }
  return total;
}

async function main(): Promise<void> {
  acquireHarnessLock();
  const server = await startDevServer();
  const browser = await launchChrome();
  const failures: string[] = [];

  try {
    const pool = new Pool({ connectionString: DATABASE });
    try {
      await pool.query("TRUNCATE blocks, hold_meter CASCADE");
      await pool.query(
        `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                             payment_signature, caption)
         VALUES (0, 0, 120, 90, 'paid', 1000000, 10800000000, now(), 'share-fixture', 'A rectangle')`,
      );
    } finally {
      await pool.end();
    }

    console.log(
      `\n  ${"viewport".padEnd(12)}${"selection".padEnd(11)}${"chrome".padStart(8)}` +
        `${"budget".padStart(8)}${"board".padStart(14)}${"share".padStart(9)}`,
    );

    for (const view of VIEWPORTS) {
      for (const selected of [false, true]) {
        await browser.resize(view.width, view.height);
        await browser.goto(`${server.origin}/?share=${view.name}-${selected}`);
        await waitFor("the board to settle", async () =>
          browser.evaluate<string | null>(`document.querySelector('canvas')?.dataset.boardRect ?? null`),
        );
        await sleep(700);

        if (selected) {
          /*
            ARM A PRESET, THEN CLICK THE BOARD. A preset does not place a
            rectangle on its own — DESIGN.md: "Click to place a size" — so a
            script that only pressed the button measured the idle layout and
            labelled it "open", which is the two-states rule one level down.
            The assertion at the end catches that now.
          */
          const armed = await browser.evaluate<boolean>(
            `(() => { const b = [...document.querySelectorAll(".board-rail button")]
                .find((el) => /^\\d+×\\d+$/.test(el.textContent.trim()));
              if (b) b.click(); return !!b; })()`,
          );
          if (!armed) throw new Error("no size preset on the rail to arm");
          await sleep(250);
          await browser.evaluate(
            `(() => { const c = document.querySelector("canvas");
              const r = c.getBoundingClientRect();
              const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
                           bubbles: true, pointerId: 1, isPrimary: true, button: 0 };
              c.dispatchEvent(new PointerEvent("pointerdown", at));
              c.dispatchEvent(new PointerEvent("pointerup", at));
              return true; })()`,
          );
          await sleep(600);
        }

        const reading = JSON.parse(await browser.evaluate<string>(MEASURE)) as Reading;
        const panelOpen = reading.parts.some((part) => part.what.startsWith(".board-controls"));
        if (selected !== panelOpen) {
          throw new Error(
            `at ${view.name} the panel is ${panelOpen ? "open" : "closed"} when this pass ` +
              `wanted it ${selected ? "open" : "closed"} — the two passes would measure the ` +
              "same state. See ~/.claude/GATES.md.",
          );
        }
        const chrome = chromeHeight(reading.parts);
        const budget = selected ? BUDGET_SELECTED : BUDGET_IDLE;
        const [, , bw, bh] = (reading.board ?? "0,0,0,0").split(",").map(Number);
        const share = ((bw * bh) / (reading.vw * reading.vh)) * 100;
        const over = chrome > budget;
        if (over) {
          failures.push(
            `${view.name} ${selected ? "selected" : "idle"}: chrome ${chrome.toFixed(0)}px over a ${budget}px budget`,
          );
        }

        console.log(
          `  ${view.name.padEnd(12)}${(selected ? "open" : "none").padEnd(11)}` +
            `${chrome.toFixed(0).padStart(6)}px${String(budget).padStart(6)}px` +
            `${`${bw.toFixed(0)}×${bh.toFixed(0)}`.padStart(14)}${share.toFixed(1).padStart(8)}%` +
            (over ? "   OVER" : ""),
        );
      }
    }

    console.log(
      "\n  Percentages are reported, not guarded: the board is 1.5625:1 and a" +
        "\n  viewport is whatever it is, so a share threshold would encode the" +
        "\n  monitor rather than the design. The budget is the design.",
    );

    if (failures.length > 0) {
      console.error("\n  OVER BUDGET:\n" + failures.map((f) => `    ${f}`).join("\n"));
      process.exitCode = 1;
    } else {
      console.log("\n  every viewport is inside its budget.");
    }
  } finally {
    await browser.close();
    await server.stop();
    releaseHarnessLock();
  }
}

await main();
