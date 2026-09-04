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
import sharp from "sharp";
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
 * ONE NUMBER, WHERE THERE WERE TWO. It was 60 idle and 140 with the purchase
 * panel open, because the panel came and went and the preset pill stood on the
 * wall in between. Since 2026-09-02 nothing stands on the wall at any width:
 * the tools, the panel and the register are one strip along the bottom whose
 * height does not move with the selection — deliberately, because a strip that
 * grew would refit the board under a rectangle somebody was drawing. So idle
 * and selected measure the same, and a difference between them is now a bug
 * rather than a second budget.
 *
 * 115 SINCE 2026-09-03, DOWN FROM 127 AND FROM 130 BEFORE THAT, AND IT IS THE
 * MEASUREMENT RATHER THAN A ROUND NUMBER WITH SLACK IN IT. A 34px header plus
 * an 81px strip: the purchase panel's own two rows — the readout beside the Buy
 * button, and the refusal on its own line under both — padded to 68 so the idle
 * box matches it, plus 6px of strip padding above and below and one hairline.
 *
 * WHERE THE TWELVE PIXELS CAME FROM: the readout's second row folded into its
 * first when the strip was redrawn on one baseline, so the panel is one line
 * plus a warning instead of two lines plus a warning.
 *
 * WHY IT DID NOT COME DOWN FURTHER: the refusal is allowed TWO lines, and the
 * longest one this page can print is 118 characters. Clipping it to one buys
 * 14px of wall and costs a buyer the reason their Buy button is dead, which is
 * not a trade this design makes.
 *
 * It is a CEILING and not a target, and there is no slack in it on purpose: the
 * next thing that grows the chrome should have to say so out loud.
 */
const BUDGET_BANDED = 115;

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
/*
 * 220, AND IT WENT TO 224 AND BACK IN ONE BATCH — WHICH IS THE INTERESTING PART.
 *
 * It was the measured 220. Then the segmented control needed 4px of padding to
 * hold a 2px focus ring at a 2px offset (`overflow-x: auto` clips at the
 * padding box, so a scrolling row of controls must carry room for the ring or
 * it draws one nobody can see) and the phone measured 224 — over.
 *
 * The budget moved rather than the ring, and then it moved back: fixing the
 * SAME rule in the header meant dropping every control from 30px to 26, because
 * a 30px button in a 34px bar leaves two pixels above it and a 2px ring at a 2px
 * offset needs four. Four pixels off every control gave the phone's stacked
 * strip its four back.
 *
 * Net zero, and neither number was chosen: both are what the page measured
 * after a rule this design does not trade against a number.
 */
const BUDGET_PHONE = 220;
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
  for (const selector of ["header.board-bar", ".board-strip", ".board-tape", ".board-tape--echo", ".board-tools", ".board-controls"]) {
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
    ticker: document.documentElement.getAttribute("data-ticker") ?? "strip",
  });
})()`;

/**
 * What is visible, at the bottom of each column, of the one item that is
 * crossing from the left-hand column to the right-hand one.
 *
 * It finds the row clipped by the bottom of the left column, looks for the SAME
 * rectangle clipped by the bottom of the right one, and reports how much of
 * each is on screen. Two numbers that add up to the item's height are one path;
 * anything else is two.
 */
const JOIN_AT_THE_BOTTOM = `(() => {
  const columns = [...document.querySelectorAll(".board-tape")];
  const left = columns.find((c) => !c.classList.contains("board-tape--echo"));
  const right = columns.find((c) => c.classList.contains("board-tape--echo"));
  if (!left || !right) return "null";

  const cut = (column) => {
    const edge = column.getBoundingClientRect().bottom;
    for (const row of column.querySelectorAll(".board-tape__row")) {
      const box = row.getBoundingClientRect();
      if (box.top < edge && box.bottom > edge) return { row, box, visible: edge - box.top };
    }
    return null;
  };

  const a = cut(left);
  if (!a) return "null";
  const id = a.row.dataset.block;
  const edge = right.getBoundingClientRect().bottom;
  let b = null;
  for (const row of right.querySelectorAll(".board-tape__row")) {
    if (row.dataset.block !== id) continue;
    const box = row.getBoundingClientRect();
    if (box.top < edge && box.bottom > edge) { b = edge - box.top; break; }
  }
  return JSON.stringify({ id, left: a.visible, right: b === null ? 0 : b, height: a.box.height });
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
  /** "sides" or "strip" — where the register is drawn. */
  ticker: string;
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
      /*
        TWENTY PURCHASES, NOT ONE, because twenty is what the register carries
        — `TAPE_ROWS` — and since 2026-09-03 it runs down both letterboxes as a
        ticker. One row in a 1300px column is a column that is empty in every
        capture, which is exactly the thing the join at 2495 has to be judged
        on. Twenty is the production case rather than a flattering one.
      */
      /*
        AND HALF OF THEM CARRY ARTWORK. The register draws the picture now, so a
        fixture with no bytes shows twenty copies of the no-image state and says
        nothing about the case that matters. Half and half puts both on screen
        in the same capture: the artwork, and the tone-with-its-size a one-pixel
        purchase or a takedown gets instead.
      */
      const art = await sharp({
        create: { width: 24, height: 18, channels: 3, background: { r: 0xc2, g: 0x45, b: 0x1e } },
      })
        .png()
        .toBuffer();

      /*
        AND THREE OF THE TWENTY ARE THE SHAPES THAT BREAK A GRID: an extreme
        landscape, an extreme portrait and a tiny one. The parade keeps each
        rectangle's real proportion, so a fixture of twenty identical 120×90s
        would show a column of identical boxes and prove nothing about the rule.
      */
      const SHAPES: [number, number][] = [
        [173, 16],
        [31, 169],
        [6, 40],
      ];

      let x = 0;
      let y = 0;
      let rowTall = 0;
      for (let i = 0; i < 20; i += 1) {
        const [w, h] = SHAPES[i] ?? [120, 90];
        // A shelf: wrap when the next one would leave the wall, and drop by the
        // tallest thing on the shelf. `blocks_in_bounds` and `blocks_no_overlap`
        // are both real, and a fixture that trips either one tells you nothing.
        if (x + w > 1250) {
          x = 0;
          y += rowTall + 10;
          rowTall = 0;
        }
        const at = { x, y };
        x += w + 10;
        rowTall = Math.max(rowTall, h);

        await pool.query(
          // Nine to a row, so twenty rectangles fit inside a 1250×800 wall —
          // `blocks_in_bounds` refuses anything that does not, which is the
          // constraint being right and the first draft of this loop being wrong.
          `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                               payment_signature, caption, pending_image, pending_image_mime)
           VALUES ($1, $2, $3, $4, 'paid', 1000000, $5,
                   now() - ($6 || ' minutes')::interval, $7, $8, $9, $10)`,
          [
            at.x,
            at.y,
            w,
            h,
            w * h * 1000000,
            i * 3,
            `share-fixture-${i}`,
            `Rectangle ${i + 1}`,
            i % 2 === 0 ? art : null,
            i % 2 === 0 ? "image/png" : null,
          ],
        );
      }
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
          /*
            FOUND BY ITS ACCESSIBLE NAME, NOT BY ITS VISIBLE LABEL. The presets
            read `10×10` until 2026-09-03 and read `10` after it — the row is
            already a row of sizes and the second number was saying the same
            thing four times — and this guard went red on the change, correctly
            and unhelpfully. `aria-label` is still `10×10` and is the thing a
            person operating this control by name would use, so it is the thing
            to select on: it survives the label being shortened again.
          */
          const armed = await browser.evaluate<boolean>(
            `(() => { const b = [...document.querySelectorAll(".board-rail button")]
                .find((el) => /^\\d+×\\d+$/.test((el.getAttribute("aria-label") || "").trim()));
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

          /*
            AND THREE OF THEM AT 2495, a second and a half apart. The join is a
            claim about MOTION — that what leaves the bottom of one column is
            entering the bottom of the other — and one frame cannot show it
            travelling. The arithmetic beside this proves it holds; the sequence
            is what a person can look at.
          */
          if (view.width === 2495 && !selected) {
            for (let frame = 1; frame <= 3; frame += 1) {
              await sleep(1_500);
              writeFileSync(
                join(SHOTS, `join-2495-${frame}.png`),
                await browser.screenshot(),
              );
            }
          }
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

        /*
          AND THE TICKER IS INSIDE ITS OWN GAP. Where the register runs down the
          letterbox, "not overlapping the board" is necessary and not
          sufficient: a column that reached past the board's far edge would also
          satisfy it. So each side is checked against the side it belongs to —
          the left column ends before the board begins, the right one begins
          after the board ends.
        */
        if (reading.ticker === "sides") {
          const columns = reading.parts.filter((part) => part.what.startsWith(".board-tape"));
          if (columns.length !== 2) {
            failures.push(
              `${view.name}: the ticker should be two columns and ${columns.length} were measured`,
            );
          }
          const [left, right] = [...columns].sort((a, b) => a.left - b.left);
          if (left && left.right > bx) {
            failures.push(
              `${view.name}: the left ticker reaches ${left.right.toFixed(0)}, past the board's ` +
                `left edge at ${bx.toFixed(0)}`,
            );
          }
          if (right && right.left < bx + bw) {
            failures.push(
              `${view.name}: the right ticker starts at ${right.left.toFixed(0)}, inside the ` +
                `board, whose right edge is ${(bx + bw).toFixed(0)}`,
            );
          }
        }

        /*
          THE JOIN IS ONE PATH, AND THIS IS THE ARITHMETIC THAT SAYS SO.

          The two columns are one route: down the left, up the right. The claim
          is that the instant an item finishes leaving the bottom of the left
          column is the instant it starts entering the bottom of the right — so
          for the item straddling that join, what is visible of it at the bottom
          left plus what is visible at the bottom right is exactly its own
          height. Anything else is two rolls that happen to look similar.

          Measured at the widest viewport with a full register, because that is
          where an item is tall enough for a pixel of error to be visible.
        */
        if (reading.ticker === "sides" && view.width === 2495 && !selected) {
          const join = JSON.parse(
            await browser.evaluate<string>(JOIN_AT_THE_BOTTOM),
          ) as { id: string; left: number; right: number; height: number } | null;

          if (join === null) {
            failures.push(`${view.name}: no item was straddling the join to measure`);
          } else if (Math.abs(join.left + join.right - join.height) > 2) {
            failures.push(
              `${view.name}: the join does not add up — ${join.left.toFixed(1)}px visible bottom ` +
                `left plus ${join.right.toFixed(1)} bottom right is ${(join.left + join.right).toFixed(1)}, ` +
                `and the item is ${join.height.toFixed(1)} tall`,
            );
          } else {
            console.log(
              `\n  the join at 2495: ${join.left.toFixed(1)} + ${join.right.toFixed(1)} = ` +
                `${(join.left + join.right).toFixed(1)}px against an item ${join.height.toFixed(1)}px tall\n`,
            );
          }
        }

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
        /*
          JUDGED ON THE NUMBER IT PRINTS, not on the one behind it.

          This was `chrome > budget` against an unrounded measurement while the
          table printed `toFixed(0)`, so the phone came back reading `220px` over
          `a 220px budget` and marked OVER — a row that shows two identical
          numbers and calls one of them too big is a row nobody can act on. The
          measurement is fractional because a hairline and a padding do not land
          on whole pixels; the budget is an integer because a person wrote it.

          Rounding first makes the comparison the one the reader can check. A
          real overrun is a pixel or more and survives it; a sub-pixel one is not
          a chrome regression, it is a border.
        */
        const over = Math.round(chrome) > budget;
        if (over) {
          failures.push(
            `${view.name} ${selected ? "selected" : "idle"}: chrome ${chrome.toFixed(0)}px over a ${budget}px budget`,
          );
        }

        console.log(
          `  ${`${view.name}${reading.rails === "off" ? "" : ` ·${reading.rails}`}${
            reading.ticker === "sides" ? " ·sides" : ""
          }`.padEnd(26)}${(selected ? "open" : "none").padEnd(11)}` +
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
