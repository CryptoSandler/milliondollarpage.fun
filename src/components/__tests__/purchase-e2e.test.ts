import { readFileSync } from "node:fs";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { queryOne } from "../../lib/db";
import { testWallet } from "../../lib/wallet/__tests__/keypair";
import { findChrome, launchChrome, sleep, waitFor, type Browser } from "./cdp";
import { waitForMachineQuiet } from "./machine";
import { acquireHarnessLock, releaseHarnessLock } from "./harness-lock";
import { startDevServer, type DevServer } from "./dev-server";
import { mockWallet, type MockWallet } from "./mock-wallet";

/**
 * A rectangle bought from a browser, start to finish, by a wallet.
 *
 * WHAT ONLY THIS TEST CAN SAY. Every other suite here proves a decision: the
 * geometry, the challenge, the encoder, the wall. This one proves the WIRING —
 * that `walletSigner` is reached, that the Wallet Standard registry is really
 * read out of `window`, that Continue and Pay came back on together because
 * all three signed steps go through one seam, and that the bytes the browser
 * signs are the bytes the server verifies. Every one of those is a connection
 * between two files, and a unit test that mocks the connection proves the mock.
 *
 * So: a real `next dev`, a real headless Chrome, a real page, and a MOCK
 * WALLET carrying a real ed25519 key that registers itself the way an
 * extension does. Nothing about the signature is faked — `consumeChallenge`
 * rebuilds the sentence from its own row and `verifySignature` checks it with
 * `node:crypto`, and if the browser signed anything else this test does not
 * reach the receipt.
 *
 * ## What it covers, and what it cannot
 *
 * Covered: registry discovery, connect, hold, upload and shrink in the
 * browser, the `attach` signature, the `pay` signature, the receipt, and the
 * row in the database afterwards.
 *
 * NOT covered here, and stated rather than implied: the same flow against the
 * deployed site. `isDeployed()` refuses `ALLOW_STUB_PAYMENTS` on anything with
 * `VERCEL_ENV` set, so the paying half cannot run against a preview or
 * production deployment BY DESIGN — see `dev-server.ts`. The half that can run
 * there is connect-and-sign, and it is smoked by hand rather than from this
 * file, because pointing a suite at a public URL makes a test suite that fails
 * when somebody else's deploy is mid-flight.
 *
 * NOT covered either: a mobile wallet reachable only by a deep link, real
 * extension prompts, and any wallet that does not implement the Wallet
 * Standard. `src/lib/wallet/standard.ts` says the same thing about the
 * product itself.
 */

const chrome = findChrome();

// A skipped test says so in the runner's output, which is the honest failure
// mode when a machine has no browser to drive. It is NOT a pass: the name
// below is what a reader sees, and CHROME_PATH is how they fix it.
const describeIfChrome = chrome ? describe : describe.skip;

let server: DevServer;
let browser: Browser;
let wallet: MockWallet;

/** The picture the buyer picks: a real PNG the browser can decode and sharp can read. */
async function picture(): Promise<string> {
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 68, b: 30 } },
  })
    .png()
    .toBuffer();
  return png.toString("base64");
}

/** The page's whole text, for waiting on a sentence rather than on a selector. */
const PAGE_TEXT = "document.body.innerText";

/**
 * Waits for a sentence, and prints what was on screen instead when it never
 * arrives.
 *
 * Every step of this flow can fail into a screen that EXPLAINS itself — a
 * refused rectangle, an expired hold, a signature that was declined, the
 * ten-second ceiling. A bare "timed out waiting for Step 1 of 2" throws all of
 * that away and leaves the next person to reproduce it by hand. This is the
 * cheapest possible substitute for the screenshots an automation library would
 * have given us, and it is most of their value.
 *
 * The comparison folds case, and that is not laziness about assertions: two of
 * the sentences this waits for carry `.label-caps`, whose `text-transform:
 * uppercase` reaches `innerText` — so "Step 1 of 2" is on screen as
 * "STEP 1 OF 2". Matching the source spelling would make this test fail
 * whenever the stylesheet, rather than the product, changed its mind.
 */
async function waitForPhrase(what: string, phrase: string, timeoutMs = 30_000): Promise<void> {
  try {
    await waitFor(
      what,
      () =>
        browser.evaluate<boolean>(
          `${PAGE_TEXT}.toLowerCase().includes(${JSON.stringify(phrase.toLowerCase())})`,
        ),
      timeoutMs,
    );
  } catch (error) {
    const seen = await browser.evaluate<string>(PAGE_TEXT).catch(() => "(the page could not be read)");
    throw new Error(`${(error as Error).message}\n\nThe page said instead:\n${seen}`);
  }
}

/**
 * A colour this document decided, as RGB channels.
 *
 * THE BROWSER ASSERTIONS READ DESIGN.MD, they do not carry their own copy of
 * the palette. Two of them used to: the focus-ring check held `#c2451e` and the
 * frame check held the ink, and both went red on the register change while the
 * page was exactly right — a screenshot test asserting a hex is a screenshot
 * test that has to be edited every time the design does, and the edit is
 * indistinguishable from silencing it.
 *
 * `design-tokens.test.ts` already proves the stylesheet sets what this
 * frontmatter says. So a value read here and sampled out of a real screenshot
 * closes the loop: document → stylesheet → rendered pixel.
 */
function token(name: string, theme: "light" | "dark" = "light"): [number, number, number] {
  const design = readFileSync("DESIGN.md", "utf8");
  // Two palettes now. `colors:` is light and `colors-dark:` is dark, and a
  // sample taken in one theme compared against the other's value is a failure
  // that reads like a paint bug and is not one — which is exactly what happened
  // the first time this ran after the second theme landed.
  const block = new RegExp(`^${theme === "light" ? "colors" : "colors-dark"}:\\n((?:  .*\\n)+)`, "m").exec(design);
  if (!block) throw new Error(`DESIGN.md has no ${theme} palette`);
  const found = new RegExp(`^  ${name}: "(#[0-9a-f]{6})"$`, "m").exec(block[1]);
  if (!found) throw new Error(`DESIGN.md's ${theme} palette does not decide ${name}`);
  const hex = found[1];
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];
}

/**
 * Pins the register before anything paints.
 *
 * These assertions sample real pixels and compare them to a documented value,
 * so they have to know which of the two palettes is on screen. Left to itself a
 * headless Chrome follows the machine's own preference — this one prefers dark
 * — and the comparison silently becomes light-values-against-dark-pixels.
 */
const PIN_LIGHT = `document.documentElement.setAttribute("data-theme", "light")`;

/**
 * Draws a rectangle on the board, which is now what makes the purchase panel
 * exist at all.
 *
 * THE FLOW CHANGED WITH THE LAYOUT. The wallet, the price and Buy used to live
 * in a column that was always on screen, so a buyer could connect before
 * choosing anything. The panel floats now and is present only while something
 * is selected — so the order is draw, then connect, then buy, and a test that
 * reaches for Connect on an empty board is reaching into a panel that is not
 * there.
 */
async function selectARectangle(browser: Browser): Promise<void> {
  const armed = await browser.evaluate<boolean>(
    `(() => { const b = [...document.querySelectorAll(".board-rail button")]
        .find((el) => /^\\d+×\\d+$/.test(el.textContent.trim()));
      if (b) b.click(); return !!b; })()`,
  );
  if (!armed) throw new Error("no size preset on the rail to arm");
  await sleep(200);
  await browser.evaluate(
    `(() => { const c = document.querySelector("canvas");
      const r = c.getBoundingClientRect();
      const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
                   bubbles: true, pointerId: 1, isPrimary: true, button: 0 };
      c.dispatchEvent(new PointerEvent("pointerdown", at));
      c.dispatchEvent(new PointerEvent("pointerup", at));
      return true; })()`,
  );
  await waitFor("the purchase panel to come up", () =>
    browser.evaluate<boolean>(`!!document.querySelector(".board-controls:not([hidden])")`),
  );
}

describeIfChrome("buying a rectangle from a browser, with a wallet", () => {
  beforeAll(async () => {
    // THE LOCK COMES FIRST, before the load check, and the order is the point.
    // Another repository's harness is the commonest reason this machine is
    // loud, so asking "is it quiet" first would report a load average when the
    // useful answer is a pid and a working directory. Fail by name, then by
    // number. See `~/.claude/GATES.md`.
    acquireHarnessLock();
    // THEN wait for the machine, and in that order for a reason. The lock is
    // what stops another repository's harness competing with this one; waiting
    // for the load before taking it would mean waiting for a machine that is
    // about to get louder, and two runs could both decide it was quiet. Take
    // the resource, then wait for the conditions to measure in it.
    await waitForMachineQuiet("The end-to-end suite");
    server = await startDevServer();
    browser = await launchChrome();
    wallet = mockWallet();
    // Before anything on the page runs, so the registry is populated by the
    // same race a real extension wins or loses.
    await browser.addInitScript(wallet.script);
  }, 240_000);

  afterAll(async () => {
    // Released even when the suite failed — which is the whole reason it lives
    // in `afterAll` rather than at the end of the last test. A harness lock
    // that survives a red run blocks every repository on this machine until
    // somebody deletes a file they have never heard of.
    releaseHarnessLock();
    // Both by PID, and both even if the test failed: a leaked `next dev` holds
    // the advisory lock's database connection and a leaked Chrome holds a
    // gigabyte.
    await browser?.close();
    await server?.stop();
  });

  it(
    "holds, connects, signs, attaches, pays and lands on the receipt",
    async () => {
      await browser.goto(`${server.origin}/`);

      // Hydration. The connect button exists only once the registry has been
      // asked, which is the first thing on this page that needs the client —
      // and `querySelector` finds it inside the retracted panel, so this does
      // not need a selection first. The keydown below does.
      await waitFor("the wallet's Connect button", () =>
        browser.evaluate<boolean>(
          `!!document.querySelector('[aria-label="Connect Mock Wallet"]')`,
        ),
      );

      /*
        THE SELECTION COMES BEFORE THE CONNECT AND AFTER HYDRATION. and that is the flow changing rather
        than the test being rearranged for convenience. The wallet control used
        to live in a column that was always on screen; it lives in a panel that
        exists only while something is selected, so a buyer draws, then
        connects, then buys.

        The keyboard path, because it is the one that does not need the board's
        fit maths recomputed here: the first arrow puts a 10x10 cursor at the
        origin (keyboard-cursor.ts).
      */
      await waitFor("the board to accept a keyboard cursor", () =>
        browser.evaluate<boolean>(`!!document.querySelector("canvas")`),
      );
      await browser.evaluate(`(() => {
        const board = document.querySelector('canvas');
        board.focus();
        board.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      })()`);
      await waitFor("the purchase panel to come up with it", () =>
        browser.evaluate<boolean>(`!!document.querySelector(".board-controls:not([hidden])")`),
      );

      // 1. CONNECT. The address the page shows afterwards must be the mock
      //    wallet's own — this is the registry read, the connect call and the
      //    account choice, all in one assertion.
      await browser.evaluate(`document.querySelector('[aria-label="Connect Mock Wallet"]').click()`);
      await waitFor("the connected wallet's address", () =>
        browser.evaluate<boolean>(
          `document.body.innerText.includes(${JSON.stringify(wallet.address.slice(0, 4))}) &&
           document.body.innerText.includes("Disconnect")`,
        ),
      );

      // 2. HOLD IT. The rectangle is already selected — see above — and Enter
      //    is the Buy button (BoardCanvas).
      // Enter goes in a SEPARATE round trip, and that is not politeness: the
      // canvas's `onActivate` is the handler from the render that is on screen,
      // so an Enter dispatched in the same tick as the arrow is handled by a
      // Buy that has not heard about the selection yet and does nothing at all.
      // Waiting for the button to go live is waiting for that render.
      await waitFor("Buy to go live with the selection", () =>
        browser.evaluate<boolean>(
          `(() => {
             const buy = [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Buy'));
             return !!buy && !buy.disabled;
           })()`,
        ),
      );

      await browser.evaluate(
        `document.querySelector('canvas').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`,
      );

      await waitForPhrase("the purchase dialog's first step", "Step 1 of 2");

      // 3. THE CONTENT. A real PNG through the real file input, so the
      //    browser's own shrink (image-encode.ts) runs on real bytes.
      const base64 = await picture();
      await browser.evaluate(`(() => {
        const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0));
        const file = new File([bytes], 'block.png', { type: 'image/png' });
        const input = document.querySelector('input[type=file]');
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // React reads the value off its own descriptor, so assigning .value
        // directly is a change React never hears about.
        const type = (el, value) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        type(document.querySelector('input[inputmode=url]'), 'example.com');
        type(document.querySelector('input[maxlength="32"]'), 'a test block');
      })()`);

      // 4. CONTINUE — the first signed step. It is enabled at all only because
      //    `sign` is no longer null, which is the seam this whole batch is.
      await waitFor("Continue to become pressable", () =>
        browser.evaluate<boolean>(
          `!!document.querySelector('button[type=submit]') && !document.querySelector('button[type=submit]').disabled`,
        ),
      );
      expect(await browser.evaluate<string>(PAGE_TEXT)).not.toContain(
        "there is nothing here that can sign",
      );
      await browser.evaluate(`document.querySelector('button[type=submit]').click()`);

      // Sixty seconds: this wait covers the browser shrinking the picture, a
      // challenge round trip, a wallet signature and a multipart upload.
      await waitForPhrase("the confirmation step", "Step 2 of 2", 60_000);

      // 5. PAY — the second signed step, through the stub verifier.
      await browser.evaluate(`(() => {
        const pay = [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Pay '));
        if (!pay) throw new Error('No Pay button on the confirmation screen.');
        if (pay.disabled) throw new Error('Pay is disabled: ' + document.body.innerText.slice(0, 400));
        pay.click();
      })()`);

      await waitForPhrase("the receipt", "pixels are yours", 60_000);

      // 6. AND IN THE DATABASE. The receipt is the browser's claim; this is
      //    the server's. Paid, to the mock wallet's own address, with the
      //    caption and the link the browser typed.
      const row = await queryOne<{
        status: string;
        buyer_pubkey: string;
        caption: string | null;
        link: string | null;
        w: number;
        h: number;
      }>(
        `SELECT status, buyer_pubkey, caption, link, w, h
           FROM blocks
          WHERE buyer_pubkey = $1`,
        [wallet.address],
      );

      expect(row).not.toBeNull();
      expect(row!.status).toBe("paid");
      expect(row!.caption).toBe("a test block");
      expect(row!.link).toBe("https://example.com");
      expect({ w: row!.w, h: row!.h }).toEqual({ w: 10, h: 10 });
    },
    240_000,
  );

  /**
   * The focus ring on the connect control, read out of rendered pixels.
   *
   * WHY A SCREENSHOT AND NOT A COMPUTED STYLE. The stylesheet said
   * `outline: 2px solid var(--primary)` while three of this control's four
   * sides were painting the panel's cream, because `overflow-x: auto` on the
   * row clips at its padding box and the ring sits four pixels outside the
   * button. Nothing short of the pixels catches that — it is the same lesson
   * DESIGN.md records for the ring that used to fade in ("Caught from pixels —
   * the stylesheet said 2px of --primary the whole time, and the screenshot
   * said #d78f73"), and this is that lesson kept rather than relearned.
   *
   * Both layouts, because they are two different boxes: the floating panel
   * above 640, and the bottom sheet below it. `#c2451e` is DESIGN.md's `primary`, measured at
   * 4.64:1 against the `card-lift` these buttons sit on.
   */
  it(
    "keeps the focus ring on every control inside a scrolling row, in both layouts",
    async () => {
      // Both rows use `overflow-x: auto` and both therefore clip their focus
      // ring at the padding box. The wallet row was measured first; the presets
      // row was REPORTED as having the same shape and is fixed here, so both
      // are pinned by the same pixels rather than one being trusted to stay
      // right because its neighbour is.
      const controls = [
        ['[aria-label="Connect Mock Wallet"]', "the Connect button"],
        [".board-rail button", "the first size preset"],
      ] as const;

      for (const [layout, width, height] of [
        ["side panel", 1280, 900],
        ["bottom bar", 560, 900],
      ] as const) {
       for (const [selector, what] of controls) {
        await browser.resize(width, height);
        await browser.goto(`${server.origin}/`);
        await browser.evaluate(PIN_LIGHT);
        // The panel — and the Connect button in it — only exists once a
        // rectangle is selected, so the sampler has to make one first.
        await selectARectangle(browser);
        /*
         * The VISIBLE one. Both layouts are in the DOM at once and CSS hides
         * the one that does not apply, so a bare `querySelector` returns the
         * hidden copy at one of the two widths — which cannot take focus, and
         * fails in a way that looks like a missing focus ring rather than like
         * the wrong element.
         */
        const visible = `[...document.querySelectorAll(${JSON.stringify(selector)})].find((el) => el.offsetParent !== null)`;
        await waitFor(`${what} in the ${layout}`, () =>
          browser.evaluate<boolean>(`!!(${visible})`),
        );

        await browser.evaluate(`(${visible}).focus({ focusVisible: true })`);
        expect(
          await browser.evaluate<boolean>(`document.activeElement.matches(":focus-visible")`),
          `${what} should be showing a focus ring in the ${layout}`,
        ).toBe(true);

        const box = JSON.parse(
          await browser.evaluate<string>(
            `JSON.stringify(document.activeElement.getBoundingClientRect())`,
          ),
        ) as { left: number; right: number; top: number; bottom: number; width: number; height: number };

        const { data, info } = await sharp(await browser.screenshot())
          .raw()
          .toBuffer({ resolveWithObject: true });
        const hex = (x: number, y: number) => {
          const at = (Math.round(y) * info.width + Math.round(x)) * info.channels;
          return `#${[data[at], data[at + 1], data[at + 2]]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("")}`;
        };

        // The ring is 2px at a 2px offset, so it occupies the third pixel out
        // from the border box on every side.
        const midX = box.left + box.width / 2;
        const midY = box.top + box.height / 2;
        const sides = {
          left: hex(box.left - 3, midY),
          right: hex(box.right + 2, midY),
          top: hex(midX, box.top - 3),
          bottom: hex(midX, box.bottom + 2),
        };
        /*
         * Compared with a tolerance, not for exact equality.
         *
         * The failure being guarded is a side painting the BACKGROUND — the
         * panel's `#fbf5e8` cream, which is what a clipped ring looks like and
         * is 150-plus points away per channel. What a tolerance allows through
         * is a pixel the renderer blended at an edge: the presets row came back
         * `#be441d` on its top side, four points off `#c2451e` and unmistakably
         * the ring. Demanding the exact hex there would fail on anti-aliasing
         * and teach the next person to delete the test.
         */
        // INK, not the accent. The accent means money moving now and a focus
        // ring is a selection state — see DESIGN.md's colour section.
        const RING = token("ink");
        for (const [side, sampled] of Object.entries(sides)) {
          const channels = [1, 3, 5].map((at) => Number.parseInt(sampled.slice(at, at + 2), 16));
          const drift = Math.max(...channels.map((value, index) => Math.abs(value - RING[index])));
          expect(
            drift,
            `${side} of ${what} in the ${layout} sampled ${sampled}, which is not the focus ring`,
          ).toBeLessThanOrEqual(12);
        }
       }
      }
    },
    240_000,
  );

  /**
   * The whole board, its frame included, on screen at four widths.
   *
   * WHY THIS EXISTS. The fit scale is contain, not cover, and the arithmetic
   * for it is unit tested — but the arithmetic was being handed the wrong box.
   * The board is scaled by its LIMITING dimension, so whenever width limited,
   * its left and right edges landed exactly on the free region's: the sheet's
   * own edge went under the side panel on one side and off the window on the
   * other, and nothing in a pure-function suite could see it, because the pure
   * function was right about the box it was given. What was wrong was the box.
   * So this asks the rendered page instead, at the widths a visitor actually
   * arrives at.
   *
   * WHAT IT MEASURES. `data-board-rect` is the renderer reporting the
   * rectangle it just painted, frame included, in CSS pixels — a canvas has no
   * DOM box for its contents, so there is nothing else to ask. Re-deriving the
   * rectangle from the fit maths would test the maths against itself; this
   * takes the numbers the draw call used. The frame is then confirmed in
   * PIXELS at all four sides: a rectangle that is inside the viewport and
   * paints no border there would satisfy every assertion above it and still be
   * the bug.
   */
  it(
    "opens with the whole board and its frame inside the viewport, at every width",
    async () => {
      // The frame has its own token now. It used to be drawn in `--ink`, which
      // was right when the paper was cream and the frame was the darkest thing
      // on it; on near-black paper a boundary identifying the board has to go
      // the other way, and WCAG 1.4.11 puts it at 3:1. See DESIGN.md.

      for (const [width, height] of [
        [1280, 800],
        [1440, 900],
        [1920, 1080],
        [390, 844],
      ] as const) {
        const at = `${width}x${height}`;
        await browser.resize(width, height);
        await browser.goto(`${server.origin}/`);

        /*
         * The rectangle once it has SETTLED, not the first one published.
         * The canvas has no size until layout runs, so the very first paint is
         * of a board fitted to a zero-sized box; the ResizeObserver then
         * re-fits it. Two identical reads a beat apart is the cheapest way to
         * be sure the re-fit has happened — the rectangle changes only on a
         * resize or a zoom, and neither is happening here.
         */
        await browser.evaluate(PIN_LIGHT);
        const read = `document.querySelector('canvas')?.dataset.boardRect ?? null`;
        const painted = await waitFor(`the board's fit at ${at} to settle`, async () => {
          const before = await browser.evaluate<string | null>(read);
          await sleep(150);
          const after = await browser.evaluate<string | null>(read);
          return before !== null && before === after ? after : null;
        });
        const [x, y, w, h] = painted.split(",").map(Number);

        // 1. Inside the window, on all four sides, frame included.
        expect(x, `the board's left edge at ${at}`).toBeGreaterThanOrEqual(0);
        expect(y, `the board's top edge at ${at}`).toBeGreaterThanOrEqual(0);
        expect(x + w, `the board's right edge at ${at}`).toBeLessThanOrEqual(width);
        expect(y + h, `the board's bottom edge at ${at}`).toBeLessThanOrEqual(height);

        // 2. Clear of the chrome, which is the other half of "visible": a
        //    board whose edge is under the side panel is inside the window and
        //    still cut off.
        const chrome = JSON.parse(
          await browser.evaluate<string>(`JSON.stringify({
            top: document.querySelector('header.board-bar').getBoundingClientRect(),
            controls: document.querySelector('.board-controls').getBoundingClientRect(),
            tape: document.querySelector('.board-tape').getBoundingClientRect(),
          })`),
        ) as { top: DOMRect; controls: DOMRect; tape: DOMRect };
        const overlaps = (box: DOMRect) =>
          x < box.right && box.left < x + w && y < box.bottom && box.top < y + h;
        expect(overlaps(chrome.top), `the board under the top bar at ${at}`).toBe(false);
        expect(overlaps(chrome.controls), `the board under the controls at ${at}`).toBe(false);
        // The settled-purchase rail is the third piece of chrome and the
        // newest, which makes it the one most likely to be measured wrongly.
        // It is `display: none` in the bottom-bar layout, and an undisplayed
        // element's box is all zeros, so this assertion is trivially true
        // exactly where the rail is not on screen — which is the correct
        // answer there rather than a hole in the check.
        expect(overlaps(chrome.tape), `the board under the settled rail at ${at}`).toBe(false);

        // 3. And the document does not scroll, in either axis, which is the
        //    same claim from the page's side.
        const scroll = JSON.parse(
          await browser.evaluate<string>(`(() => {
            const el = document.documentElement;
            return JSON.stringify({
              scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
              scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
            });
          })()`),
        ) as Record<string, number>;
        expect(scroll.scrollWidth, `horizontal scrolling at ${at}`).toBeLessThanOrEqual(
          scroll.clientWidth,
        );
        expect(scroll.scrollHeight, `vertical scrolling at ${at}`).toBeLessThanOrEqual(
          scroll.clientHeight,
        );

        // 4. The frame is really there, read out of the rendered pixels rather
        //    than believed from the stylesheet — the same lesson as the focus
        //    ring above.
        const { data, info } = await sharp(await browser.screenshot())
          .raw()
          .toBuffer({ resolveWithObject: true });
        const channels = (px: number, py: number) => {
          const offset = (Math.round(py) * info.width + Math.round(px)) * info.channels;
          return [data[offset], data[offset + 1], data[offset + 2]];
        };
        const FRAME = token("frame");
        // The middle of each side, one pixel inside the frame's outer edge.
        const sides = {
          top: channels(x + w / 2, y + 1),
          bottom: channels(x + w / 2, y + h - 2),
          left: channels(x + 1, y + h / 2),
          right: channels(x + w - 2, y + h / 2),
        };
        for (const [side, sampled] of Object.entries(sides)) {
          const drift = Math.max(...sampled.map((value, index) => Math.abs(value - FRAME[index])));
          expect(
            drift,
            `the ${side} of the frame at ${at} sampled rgb(${sampled.join(",")}), which is not the board's frame`,
          ).toBeLessThanOrEqual(12);
        }
      }
    },
    240_000,
  );

  /**
   * A perfectly valid signature from the wrong key, over the real HTTP server.
   *
   * The route-level version of this already exists in `orders-api.test.ts`
   * (`refuses a stranger signing for themselves`). This is the same refusal
   * seen from where a wallet actually sits: a live server, a challenge asked
   * for over the wire, a real ed25519 signature over exactly the sentence that
   * server issued — and everything about it correct except whose key it is.
   *
   * It uses `testWallet` rather than a second injected browser wallet on
   * purpose: what has to be wrong is the KEY, and driving a browser to sign
   * with a wallet the hold does not belong to would take a second page just to
   * arrange a mismatch the server settles in one line.
   */
  it(
    "refuses a valid signature from a wallet that is not the buyer, and changes nothing",
    async () => {
      const buyer = testWallet();
      const stranger = testWallet();

      const reserved = await fetch(`${server.origin}/api/reserve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rect: { x: 500, y: 500, w: 10, h: 10 }, buyerPubkey: buyer.address }),
      });
      expect(reserved.status).toBe(201);
      const { id } = (await reserved.json()) as { id: string };

      const issued = await fetch(`${server.origin}/api/orders/${id}/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "attach" }),
      });
      expect(issued.status).toBe(200);
      const challenge = (await issued.json()) as { nonce: string; message: string };

      const png = await sharp({
        create: { width: 20, height: 20, channels: 3, background: { r: 9, g: 9, b: 9 } },
      })
        .png()
        .toBuffer();

      const form = new FormData();
      form.set("image", new Blob([new Uint8Array(png)], { type: "image/png" }), "block.png");
      form.set("link", "example.com");
      form.set("caption", "not mine");
      form.set("imageFit", "cover");
      form.set("nonce", challenge.nonce);
      // The address claimed is the BUYER's — public, off the board — while the
      // key that signed is the stranger's. That pairing is the whole attack.
      form.set("publicKey", buyer.address);
      form.set("signature", stranger.sign(challenge.message));

      const refused = await fetch(`${server.origin}/api/orders/${id}/content`, {
        method: "POST",
        body: form,
      });
      expect(refused.status).toBe(403);

      const row = await queryOne<{ status: string; caption: string | null; link: string | null }>(
        "SELECT status, caption, link FROM blocks WHERE id = $1",
        [id],
      );
      expect(row).toEqual({ status: "reserved", caption: null, link: null });
    },
    120_000,
  );
});
