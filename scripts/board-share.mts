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
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
 * Where to photograph each row, if anywhere.
 *
 * `npx tsx scripts/board-share.mts <directory>` writes one PNG per viewport per
 * selection state beside the table. The numbers say the chrome is off the wall;
 * only a picture says whether what is left is worth looking at, and
 * `cierre.md` §3 asks for both.
 */
const SHOTS = process.argv[2];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/**
 * The budget, in CSS pixels of vertical room the chrome may take.
 *
 * ONE NUMBER NOW, WHERE THERE WERE TWO. It was 60 idle and 140 with the
 * purchase panel open, because the panel came and went and the preset pill
 * stood on the wall in between. Since 2026-09-02 nothing stands on the wall at
 * any width: the tools, the panel and the register are one strip along the
 * bottom whose height does not move with the selection — deliberately, because
 * a strip that grew would refit the board under a rectangle somebody was
 * drawing. So idle and selected measure the same, and a difference between them
 * is now a bug rather than a second budget.
 *
 * 130 is a 34px header plus a strip that measures 92 at the widths this table
 * covers — the purchase panel's own two lines, which the idle box is padded to
 * match — with four pixels of slack for a browser that rounds a border
 * differently. It is a CEILING and not a target.
 */
const BUDGET_BANDED = 130;

/**
 * And a phone's, which is a different question wearing the same units.
 *
 * At 390 the board is fitted by its WIDTH — 370px of free width against 844 of
 * height — so vertical chrome costs it nothing at all: the board measures
 * 374×241 with a 60px strip and with a 240px one. The number here is a sanity
 * ceiling on a strip that stacks three segments, not a claim about the wall's
 * share, and the table's own percentage column is what says the wall did not
 * move.
 */
const BUDGET_PHONE = 260;
/**
 * And the budget where a PAIR of rails is on — either pair — which is the
 * header and nothing else, measured at exactly 34px: the same number
 * `--bar-top-h` sets and the same one a phone reports when the settled strip is
 * not shown. The register has left the bottom of the window in both.
 *
 * It does not move with the selection there. The purchase panel is at the foot
 * of the left rail rather than floating over the letterbox, so opening it costs
 * the board no height at all, which the 140px row of this table cannot say.
 */
const BUDGET_RAILED = 34;

const VIEWPORTS = [
  { name: "1440×900", width: 1440, height: 900 },
  { name: "1920×1080", width: 1920, height: 1080 },
  // The widest desktop this design is looked at on, and the first one where
  // the letterbox beside a height-limited board is wide enough to hold the
  // chrome. Without it the table reports only viewports where the side rails
  // are off, which is the half of the layout that did not change.
  { name: "2560×1440", width: 2560, height: 1440 },
  // The owner's own Mac. It is the viewport the paired rails were built for:
  // 120px of gap, which is the tools pair and not the full one.
  { name: "2495×1484", width: 2495, height: 1484 },
  { name: "1280×800", width: 1280, height: 800 },
  { name: "390×844", width: 390, height: 844 },
  // The one viewport where the rails still come on with the floor at 200px.
  // Without it the table would report only the banded layout, which is half the
  // change and the half that got harder rather than easier.
  { name: "3440×1440", width: 3440, height: 1440 },
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
  for (const selector of ["header.board-bar", ".board-strip", ".board-tape", ".board-tools", ".board-controls"]) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const box = el.getBoundingClientRect();
    if (box.height === 0) continue;
    parts.push({
      what: selector,
      top: box.top,
      bottom: box.bottom,
      height: box.height,
      left: box.left,
      right: box.right,
    });
  }
  /*
    THE PANEL IS ALWAYS IN THE LAYOUT NOW, so its presence stopped being the
    signal for whether anything is selected — the strip holds one box that shows
    the hint or the readout, and it is the same height either way. The hint's
    own hidden attribute is what says which. No backticks anywhere in this
    string: the whole of it is a template literal, and one would close it.
  */
  const hint = document.querySelector(".board-hint");
  return JSON.stringify({
    board,
    parts,
    panelOpen: !!hint && hint.hasAttribute("hidden"),
    vw: innerWidth,
    vh: innerHeight,
    rails: document.documentElement.getAttribute("data-rails") ?? "off",
  });
})()`;

type Part = {
  what: string;
  top: number;
  bottom: number;
  height: number;
  left: number;
  right: number;
};

type Reading = {
  board: string | null;
  parts: Part[];
  panelOpen: boolean;
  vw: number;
  vh: number;
  /** "full" or "off" — the word the boot script stamped. */
  rails: string;
};

/**
 * WHAT COUNTS IS THE CHROME THAT STANDS OVER THE BOARD'S OWN WIDTH.
 *
 * The budget is a claim about vertical room the board does not get, and a rail
 * BESIDE the board denies it none: the board is fitted into the width between
 * the rails and takes every pixel of height the header leaves. Summing every
 * fixed element's height would report a 1300px column as 1300px of vertical
 * chrome, which is arithmetic answering a question nobody asked.
 *
 * WHAT IS NOT IN THE LIST AT ALL is the board's own overlay — the preset pill
 * and the line of instruction under it. It is not a band anywhere: it stands ON
 * the board where there is nothing beside it, and in a column where there is,
 * so its height has never belonged in this sum. The `·tools` marker in the
 * table below says which of those a row is.
 *
 * The condition attached to that exemption is not a budget question and is not
 * asked here — `purchase-e2e.test.ts` asks it twice: nothing covers artwork
 * where there is a rail, and where there is not, the overlay is gone at rest.
 *
 * So a part is counted only where its horizontal span meets the board's. That
 * is the same predicate the fit guard in `purchase-e2e.test.ts` uses for
 * overlap, one axis at a time, and it does a second job for free: a rail that
 * ever DID reach over the board would start counting, and the budget would fail
 * rather than the encroachment going unnoticed.
 */
function overTheBoard(parts: Part[], board: string | null): Part[] {
  const [x, , w] = (board ?? "0,0,0,0").split(",").map(Number);
  if (!(w > 0)) return parts;
  return parts.filter((part) => part.left < x + w && x < part.right);
}

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
      `\n  ${"viewport".padEnd(20)}${"selection".padEnd(11)}${"chrome".padStart(8)}` +
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

        if (SHOTS) {
          const name = `${view.name.replace("×", "x")}-${selected ? "selected" : "idle"}.png`;
          writeFileSync(join(SHOTS, name), await browser.screenshot());
        }

        const reading = JSON.parse(await browser.evaluate<string>(MEASURE)) as Reading;
        const panelOpen = reading.panelOpen;
        if (selected !== panelOpen) {
          throw new Error(
            `at ${view.name} the panel is ${panelOpen ? "open" : "closed"} when this pass ` +
              `wanted it ${selected ? "open" : "closed"} — the two passes would measure the ` +
              "same state. See ~/.claude/GATES.md.",
          );
        }
        const chrome = chromeHeight(overTheBoard(reading.parts, reading.board));
        /*
          A PAIR OF RAILS COSTS THE HEADER AND NOTHING ELSE: the register and
          the purchase panel are in the columns, where they cost no height at
          all. Without them it is the header plus the strip, and the same number
          whether or not anything is selected.
        */
        const budget =
          reading.rails === "full"
            ? BUDGET_RAILED
            : reading.vw <= 640
              ? BUDGET_PHONE
              : BUDGET_BANDED;

        /*
          AND THE RULE THE BUDGET CANNOT EXPRESS: no piece of chrome overlaps the
          board's own rectangle, at any width. The budget is about how much
          height the board is denied; this is about whether anything is standing
          on the artwork, which until this batch was allowed and priced. It is
          checked on the BOX rather than on one axis — a thing beside the board
          and a thing on top of it differ in exactly this.
        */
        const [bx, by, bw, bh] = (reading.board ?? "0,0,0,0").split(",").map(Number);
        for (const part of reading.parts) {
          const meets =
            part.left < bx + bw && bx < part.right && part.top < by + bh && by < part.bottom;
          if (meets) {
            failures.push(
              `${view.name} ${selected ? "selected" : "idle"}: ${part.what} is standing on the ` +
                `board — chrome ${part.left.toFixed(0)},${part.top.toFixed(0)} to ` +
                `${part.right.toFixed(0)},${part.bottom.toFixed(0)}, board ${bx.toFixed(0)},` +
                `${by.toFixed(0)} to ${(bx + bw).toFixed(0)},${(by + bh).toFixed(0)}`,
            );
          }
        }

        const share = ((bw * bh) / (reading.vw * reading.vh)) * 100;
        const over = chrome > budget;
        if (over) {
          failures.push(
            `${view.name} ${selected ? "selected" : "idle"}: chrome ${chrome.toFixed(0)}px over a ${budget}px budget`,
          );
        }

        console.log(
          `  ${`${view.name}${reading.rails === "off" ? "" : ` ·${reading.rails}`}`.padEnd(20)}${(selected ? "open" : "none").padEnd(11)}` +
            `${chrome.toFixed(0).padStart(6)}px${String(budget).padStart(6)}px` +
            `${`${bw.toFixed(0)}×${bh.toFixed(0)}`.padStart(14)}${share.toFixed(1).padStart(8)}%` +
            (over ? "   OVER" : ""),
        );
      }
    }

    console.log(
      "\n  Percentages are reported, not guarded: the board is 1.5625:1 and a" +
        "\n  viewport is whatever it is, so a share threshold would encode the" +
        "\n  monitor rather than the design. The budget is the design." +
        "\n\n  What IS guarded, at every row: nothing overlaps the board's own box." +
        "\n  Not a budget question — a purchase under a control is covered whatever" +
        "\n  the height arithmetic says.",
    );

    if (failures.length > 0) {
      console.error("\n  FAILED:\n" + failures.map((f) => `    ${f}`).join("\n"));
      process.exitCode = 1;
    } else {
      console.log("\n  every viewport is inside its budget, and nothing stands on the wall.");
    }
  } finally {
    await browser.close();
    await server.stop();
    releaseHarnessLock();
  }
}

await main();
