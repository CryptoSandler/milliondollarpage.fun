import { readFileSync } from "node:fs";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execute, queryOne } from "../../lib/db";
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
 * The overlay's box, the seeded sale's box, and whether they meet.
 *
 * Read out of the page in one call because the two have to be measured in the
 * same frame: the board re-fits on a resize, and a sale computed from one
 * rectangle against an overlay measured after another is a comparison of two
 * different layouts.
 */
const OVERLAY_VS_SALE = `(() => {
  const c = document.querySelector("canvas");
  const [bx, by, bw] = c.dataset.boardRect.split(",").map(Number);
  /*
    The reported rectangle carries the 2px frame on every side, so the paper
    starts one frame in and the scale is the paper's width over the board's own
    1250. Everything below is in screen pixels.
  */
  const FRAME = 2;
  const scale = (bw - 2 * FRAME) / 1250;
  const sold = {
    left: bx + FRAME + 300 * scale,
    top: by + FRAME,
    right: bx + FRAME + 950 * scale,
    bottom: by + FRAME + 60 * scale,
  };
  const el = document.querySelector(".board-tools");
  const b = el && el.getBoundingClientRect();
  const tools = b && b.width > 0 && b.height > 0
    ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom }
    : null;
  const covers = !!tools && tools.left < sold.right && sold.left < tools.right &&
    tools.top < sold.bottom && sold.top < tools.bottom;
  /*
    Content wider than its box paints over the wall — unless the box CLIPS it.
    The first version of this check did not ask, and the strip made the
    difference matter: the register's scroller is deliberately wider than its
    own box, because that is what a ticker is, and it hides the excess with
    overflow-x. A box that scrolls or hides is a box that paints nothing
    outside itself, so only a visible overflow is a finding here.
  */
  const overflow = [];
  for (const root of document.querySelectorAll(".board-side")) {
    for (const node of root.querySelectorAll("*")) {
      const style = getComputedStyle(node);
      const clips = style.overflowX !== "visible" || style.overflowY !== "visible";
      if (!clips && node.scrollWidth > node.clientWidth + 1 && node.clientWidth > 0) {
        overflow.push((node.className.toString().split(" ")[0] || node.tagName) +
          ": " + node.scrollWidth + " wide in " + node.clientWidth);
      }
    }
  }
  return JSON.stringify({
    sold, tools, covers, overflow,
    rails: document.documentElement.dataset.rails,
  });
})()`;

type Edges = { left: number; top: number; right: number; bottom: number };
type OverlayReading = {
  sold: Edges;
  tools: Edges | null;
  covers: boolean;
  overflow: string[];
  rails: string;
};

/** A rectangle, as the two numbers a failure message needs on each axis. */
const edges = (e: Edges) =>
  `${Math.round(e.left)}–${Math.round(e.right)} × ${Math.round(e.top)}–${Math.round(e.bottom)}`;

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
  /*
    FOUND BY ITS ACCESSIBLE NAME, NOT BY ITS VISIBLE LABEL. The presets read
    `10×10` until 2026-09-03 and read `10` after it — the row is already a row
    of sizes and the second number was saying the same thing four times. Five
    tests in this file went red on that one change, all through this helper,
    which is the helper doing its job. `aria-label` is still `10×10`, it is what
    somebody operating this control by name would use, and it survives the
    visible label being shortened again.
  */
  const armed = await browser.evaluate<boolean>(
    `(() => { const b = [...document.querySelectorAll(".board-rail button")]
        .find((el) => /^\\d+×\\d+$/.test((el.getAttribute("aria-label") || "").trim()));
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
      /*
        THE ADDRESS IS ON SCREEN; DISCONNECT IS ONE PRESS AWAY. The connected
        control is a menu now — the truncated address is the summary and
        Disconnect is inside it — so this waits for the address, opens the menu,
        and then asks for the thing the menu holds. It used to wait for both at
        once, which was right when they were both in the panel side by side.
      */
      await waitFor("the connected wallet's address", () =>
        browser.evaluate<boolean>(
          `document.body.innerText.includes(${JSON.stringify(wallet.address.slice(0, 4))})`,
        ),
      );
      await browser.evaluate(
        `document.querySelector(".wallet-connect__menu").setAttribute("open", "")`,
      );
      expect(
        await browser.evaluate<boolean>(`document.body.innerText.includes("Disconnect")`),
        "the wallet menu does not hold a way to disconnect",
      ).toBe(true);

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

      /** The hash of the bytes the preview drew, captured at 3b and checked at the end. */
      let previewHash = "";

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

      /*
        3b. THE PREVIEW IS THE UPLOAD, and this is where that claim is checked.

        `ExactPreview` draws a Blob rather than a rendering of one: the form
        prepares the bytes the moment a file is picked, shows THOSE, and sends
        the same object. So the hash of what the buyer looked at, and the
        `image_sha256` the row ends up with, have to be one number — and the
        second half of that assertion is below, after the attach.

        Before this the form showed `URL.createObjectURL(draft.file)` — the
        buyer's own photograph at whatever size they picked it — and the
        shrinking happened at submit, so the first sight of what a rectangle
        would really carry was the confirmation screen.
      */
      await waitFor("the exact preview to have bytes to show", () =>
        browser.evaluate<boolean>(
          `!!document.querySelector(".exact-preview__zoom")?.style.backgroundImage?.includes("blob:")`,
        ),
      );
      previewHash = await browser.evaluate<string>(`(async () => {
        /* No regex here on purpose: a backslash inside a template literal that
           is itself inside a template literal loses a level every time this
           string is written, and the page ended up evaluating /^url("?/ —
           "Unterminated group". Slicing between the quotes cannot be escaped
           wrong. */
        const raw = document.querySelector(".exact-preview__zoom").style.backgroundImage;
        const url = raw.slice(raw.indexOf('"') + 1, raw.lastIndexOf('"'));
        const bytes = await (await fetch(url)).arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      })()`);
      expect(previewHash).toMatch(/^[0-9a-f]{64}$/);

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
        image_sha256: string | null;
      }>(
        `SELECT status, buyer_pubkey, caption, link, w, h, image_sha256
           FROM blocks
          WHERE buyer_pubkey = $1`,
        [wallet.address],
      );

      expect(row).not.toBeNull();
      expect(row!.status).toBe("paid");
      expect(row!.caption).toBe("a test block");
      expect(row!.link).toBe("https://example.com");
      expect({ w: row!.w, h: row!.h }).toEqual({ w: 10, h: 10 });

      /*
        AND THE OTHER HALF OF THE PREVIEW'S PROMISE. What the buyer looked at,
        what the browser uploaded and what the row stored are one number. A
        server that re-encoded anything on the way in would break this and
        nothing else in this suite would notice.
      */
      expect(row!.image_sha256).toBe(previewHash);
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
        /*
          NAMES THE COORDINATE WHEN IT IS OFF THE IMAGE. Sampling a pixel
          outside the screenshot used to come back as three `undefined`s and
          die inside `toString`, which reports a TypeError in a helper and says
          nothing about which control, which side, or which layout — twenty
          minutes of a gate to find out that one number was negative.
        */
        const hex = (x: number, y: number) => {
          const px = Math.round(x);
          const py = Math.round(y);
          if (px < 0 || py < 0 || px >= info.width || py >= info.height) {
            throw new Error(
              `sampled (${px}, ${py}) for ${what} in the ${layout}, which is outside the ` +
                `${info.width}×${info.height} screenshot — the control's box was ` +
                `${JSON.stringify(box)}`,
            );
          }
          const at = (py * info.width + px) * info.channels;
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
        /*
          CLOSER TO THE RING THAN TO THE SURFACE, rather than within N of the
          ring. The rail is centred with `translateX(-50%)`, so its controls sit
          on fractional coordinates and the ring is anti-aliased across two
          device pixels — a sample there came back #807b73, which is ink blended
          with the card and 87 points from either. A fixed tolerance either
          fails on that blend or is loosened until a CLIPPED side would pass
          too, and a clipped side is the whole point: it reads as the surface,
          which is 150-plus points from the ring.

          Comparing the two distances is immune to the blend and still fails
          hard on a clip, because a clipped pixel IS the surface — distance zero
          to the thing it must not be.
        */
        const SURFACE = token("card");
        const away = (from: [number, number, number], channels: number[]) =>
          Math.max(...channels.map((value, index) => Math.abs(value - from[index])));

        for (const [side, sampled] of Object.entries(sides)) {
          const channels = [1, 3, 5].map((at) => Number.parseInt(sampled.slice(at, at + 2), 16));
          const toRing = away(RING, channels);
          const toSurface = away(SURFACE, channels);
          expect(
            toRing,
            `${side} of ${what} in the ${layout} sampled ${sampled}: ${toRing} from the ring, ` +
              `${toSurface} from the surface — the ring is clipped there`,
          ).toBeLessThan(toSurface);
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

        /*
          1b. AND THE HEADER IS INSIDE IT TOO, WITHOUT CUTTING ITSELF.

          The board's right edge was guarded here and the bar above it was not,
          and the failure that produced this took the second form rather than
          the first: at 390 the header did NOT overflow the window — its
          children measured 10..380 inside 390 — while the counter clipped
          INSIDE its own box and printed `989,200 PIXELS LE`. So both are asked:
          nothing paints past the right edge, and nothing in there is wider than
          the box it is in. The second is what an ellipsis and a cut word look
          like from the outside.
        */
        const header = JSON.parse(
          await browser.evaluate<string>(`(() => {
            const h = document.querySelector("header.board-bar");
            const cut = [];
            if (h.getBoundingClientRect().right > innerWidth + 1) cut.push("the bar itself is past the right edge");
            for (const n of h.querySelectorAll("*")) {
              /*
                A BOX THAT IS SHOWING NOTHING CANNOT BE CUTTING ANYTHING, and at
                390 the header has one on purpose: the wallet's label goes
                visually-hidden — 1x1, clipped — so the button is icon-only and
                a screen reader still has a name to read. The first version of
                this check reported that label as 87 wide in 1 and failed a
                correct page. Same lesson as the rails' overflow detector next
                door: ask whether the box is displaying the content before
                accusing it of cutting it.

                (No backticks anywhere in this comment: it lives inside a
                template literal that is evaluated in the browser, and one
                closes the string. That has cost this repository five parse
                errors now.)
              */
              if (n.clientWidth > 1 && n.clientHeight > 1 && n.scrollWidth > n.clientWidth + 1) {
                cut.push((n.className.toString().split(" ")[0] || n.tagName) +
                  ": " + n.scrollWidth + " wide in " + n.clientWidth);
              }
            }
            return JSON.stringify(cut);
          })()`),
        ) as string[];
        expect(header, `the header is cutting itself at ${at}:\n  ` + header.join("\n  ")).toEqual([]);

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
   * NO CONTROL GROUP BREAKS TWO-AND-ONE, at any width a rail can be.
   *
   * Wrapping fills rows until it runs out, so a column narrow enough gives the
   * zoom trio as `−` and `Fit` with `+` alone underneath — a group that has
   * visibly broken rather than one that has been laid out. The rails are grids
   * now, and a grid cannot do that; this sweeps the rail across its whole range
   * and fails on any group whose rows are not all the same length except for
   * the last, and never on a last row of one where the row above it holds more
   * than two.
   */
  it(
    "never breaks a group of rail controls into a short last row", 
    async () => {
      const ROWS = `(() => {
        const out = {};
        for (const group of [".board-rail__presets", ".board-rail__zoom"]) {
          const el = document.querySelector(group);
          if (!el) continue;
          const rows = new Map();
          for (const b of el.querySelectorAll("button")) {
            const r = b.getBoundingClientRect();
            const key = Math.round(r.y);
            rows.set(key, (rows.get(key) ?? 0) + 1);
          }
          out[group] = [...rows.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
        }
        out.railW = getComputedStyle(document.documentElement).getPropertyValue("--rail-w");
        out.kind = document.documentElement.dataset.rails;
        return JSON.stringify(out);
      })()`;

      /*
        Every width a rail can be, driven by pinning `--rail-w` rather than by
        hunting viewports: the floor is 108 and the ceiling 288, and what is
        being checked is the LAYOUT at each of them, not which monitor produces
        it. The page is loaded once at a viewport that has a pair.
      */
      await browser.resize(3440, 1440);
      await browser.goto(`${server.origin}/?groups=1`);
      await waitFor("the board", async () =>
        browser.evaluate<string | null>(`document.querySelector('canvas')?.dataset.boardRect ?? null`),
      );
      expect(
        await browser.evaluate<string | null>(`document.documentElement.dataset.rails`),
      ).toBe("full");

      for (let railW = 200; railW <= 288; railW += 4) {
        await browser.evaluate(
          `document.documentElement.style.setProperty("--rail-w", "${railW}px")`,
        );
        await sleep(60);
        const reading = JSON.parse(await browser.evaluate<string>(ROWS)) as Record<
          string,
          number[] | string
        >;

        for (const group of [".board-rail__presets", ".board-rail__zoom"]) {
          const rows = reading[group] as number[];
          expect(rows?.length, `${group} has no rows at a ${railW}px rail`).toBeGreaterThan(0);
          /*
            THE FAILURE THIS NAMES is a last row shorter than the row above it
            by more than nothing while the group is more than one row — which is
            exactly `[2, 1]`. A group laid out in a grid is either one row, or
            rows of equal length, or equal rows with a deliberate full-width
            first cell, which reads as `[1, 2, 2]`.
          */
          const full = rows.slice(0, -1);
          const last = rows[rows.length - 1];
          const widest = Math.max(...rows);
          expect(
            rows.length === 1 || last === widest || full.every((n) => n === widest),
            `${group} is laid out as [${rows.join(", ")}] at a ${railW}px rail`,
          ).toBe(true);
          // And the zoom trio is one row at every width, which is the specific
          // shape the owner asked for.
          if (group === ".board-rail__zoom") {
            expect(rows, `the zoom trio at a ${railW}px rail`).toEqual([3]);
          }
        }
      }
    },
    240_000,
  );

  /**
   * THE THEME IS TWO STATES, THE SWITCH REMEMBERS, AND THE PANEL BELONGS TO
   * WHICHEVER ONE IS ON.
   *
   * THE THIRD CLAIM IS THE REVERSED ONE. It used to be "the panel is white in
   * both registers", which was DESIGN.md's first exception — a receipt is
   * white — and the owner reversed it on 2026-09-03: against a dark wall the
   * white box read as a card floating on the page rather than as part of the
   * strip. So the assertion is now the opposite and it is the stronger one: the
   * panel takes the REGISTER's own ground, which means it must differ between
   * the two themes, where the white one was identical in both.
   *
   * Three claims, one page load each, because they are three different things
   * that can each be true while the others are not.
   */
  it(
    "offers two themes, remembers the one chosen, and gives the panel the register it is in",
    async () => {
      await browser.resize(1440, 900);
      await browser.goto(`${server.origin}/?theme=1`);
      await waitFor("the board", async () =>
        browser.evaluate<string | null>(`document.querySelector('canvas')?.dataset.boardRect ?? null`),
      );

      // 1. NO "SYSTEM" ANYWHERE IN THE DOM, in any casing, and the control is a
      //    switch rather than a button with a word on it.
      const shape = JSON.parse(await browser.evaluate<string>(`(() => {
        const sw = document.querySelector(".theme-switch");
        return JSON.stringify({
          role: sw && sw.getAttribute("role"),
          checked: sw && sw.getAttribute("aria-checked"),
          text: sw ? sw.textContent.trim() : null,
          // Visible TEXT, not markup: the first version read innerHTML and
          // matched "system-ui" inside a font stack in the Next dev overlay's
          // own payload. What the rule is about is a theme called "system"
          // being offered to a reader, and offered means readable.
          saysSystem: /\bsystem\b/i.test(document.body.innerText),
          // And nothing anywhere still stores or names it as a choice.
          storedSystem: (() => { try { return localStorage.getItem("mdp-theme") === "system"; }
            catch (e) { return false; } })(),
          optionSystem: !!document.querySelector('[value="system"], [data-theme-choice="system"]'),
          stamped: document.documentElement.dataset.theme,
        });
      })()`)) as {
        role: string | null;
        checked: string | null;
        text: string | null;
        saysSystem: boolean;
        storedSystem: boolean;
        optionSystem: boolean;
        stamped: string;
      };
      expect(shape.role, "the theme control should be a switch").toBe("switch");
      /*
        NO WORD, WHICH IS NOT THE SAME AS NO CHARACTER. The knob carries a sun
        or a moon, and the rule the owner set is that the control is a switch
        rather than a button with a word on it — so what this refuses is a
        letter, not a glyph.
      */
      expect(
        /\p{Letter}/u.test(shape.text ?? ""),
        `the switch is carrying a word: ${JSON.stringify(shape.text)}`,
      ).toBe(false);
      expect(shape.saysSystem, "the word `system` is still readable on the page").toBe(false);
      expect(shape.storedSystem, "`system` is still a stored theme choice").toBe(false);
      expect(shape.optionSystem, "`system` is still offered as an option").toBe(false);
      // A reader who has never chosen gets dark, and the attribute is stamped
      // rather than absent — an absent one would let prefers-color-scheme in.
      expect(shape.stamped, "the default register").toBe("dark");
      expect(shape.checked, "the switch should read as on for dark").toBe("true");

      // 2. IT PERSISTS. Flip it, reload, and it is still where it was put.
      await browser.evaluate(`document.querySelector(".theme-switch").click()`);
      await sleep(300);
      expect(await browser.evaluate<string>(`document.documentElement.dataset.theme`)).toBe("light");
      await browser.goto(`${server.origin}/?theme=2`);
      await waitFor("the board again", async () =>
        browser.evaluate<string | null>(`document.querySelector('canvas')?.dataset.boardRect ?? null`),
      );
      expect(
        await browser.evaluate<string>(`document.documentElement.dataset.theme`),
        "the chosen register did not survive a reload",
      ).toBe("light");
      expect(
        await browser.evaluate<string>(`document.querySelector(".theme-switch").getAttribute("aria-checked")`),
      ).toBe("false");

      // 3. THE PANEL IS IN THE REGISTER, not a white island in both of them.
      const seen: Record<string, { background: string; colour: string; border: string; ground: string }> = {};
      for (const theme of ["light", "dark"] as const) {
        await browser.goto(`${server.origin}/?theme=panel-${theme}`);
        await browser.evaluate(
          `document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)})`,
        );
        await waitFor(`the board in ${theme}`, async () =>
          browser.evaluate<string | null>(`document.querySelector('canvas')?.dataset.boardRect ?? null`),
        );
        await selectARectangle(browser);

        const panel = JSON.parse(await browser.evaluate<string>(`(() => {
          const el = document.querySelector(".board-controls:not([hidden])");
          const s = getComputedStyle(el);
          return JSON.stringify({ background: s.backgroundColor, colour: s.color,
            border: s.borderTopWidth,
            ground: getComputedStyle(document.body).backgroundColor });
        })()`)) as { background: string; colour: string; border: string; ground: string };
        seen[theme] = panel;

        /*
          NO FILL AT ALL: the panel is an outline over the strip since
          2026-09-03. `transparent` computes as `rgba(0, 0, 0, 0)`, and the
          thing this asserts is that the panel is NOT painting a ground of its
          own — which is exactly what the white receipt did.
        */
        expect(panel.background, `the purchase panel in ${theme}`).toBe("rgba(0, 0, 0, 0)");
        // And it carries the hairline that says where it is, since it has no
        // tone step to say it with.
        expect(panel.border, `the purchase panel's rule in ${theme}`).toBe("1px");
        // Legible against the ground it is actually on, whichever that is.
        expect(panel.colour, `the panel's ink in ${theme}`).not.toBe(panel.ground);
      }

      /*
        AND THE TWO REGISTERS ARE DIFFERENT, which is the whole of the reversal
        in one assertion. The white receipt was IDENTICAL in both — that was its
        argument — so a panel that still measured the same in light and dark
        would mean the exception had quietly survived.
      */
      expect(seen.light.colour).not.toBe(seen.dark.colour);
    },
    240_000,
  );

  /**
   * THE WALLET CONTROL IS IN THE HEADER, IN BOTH REGISTERS AND ON A PHONE, AND
   * IT IS NOT IN THE PANEL.
   *
   * Three places it has to be and one it must not, plus the ratio the second
   * colour exception in DESIGN.md rests on: the violet against the bar it sits
   * on, sampled rather than believed.
   */
  it(
    "puts the wallet control in the header in both themes and at 390, and never in the panel",
    async () => {
      for (const [theme, width, height] of [
        ["dark", 1440, 900],
        ["light", 1440, 900],
        ["dark", 390, 844],
      ] as const) {
        const at = `${theme} at ${width}x${height}`;
        await browser.resize(width, height);
        await browser.goto(`${server.origin}/?wallet=${theme}-${width}`);
        await browser.evaluate(
          `document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)})`,
        );
        await waitFor(`the board, ${at}`, async () =>
          browser.evaluate<string | null>(`document.querySelector('canvas')?.dataset.boardRect ?? null`),
        );

        const where = JSON.parse(await browser.evaluate<string>(`(() => {
          const el = document.querySelector(".wallet-connect");
          if (!el) return JSON.stringify({ present: false });
          const b = el.getBoundingClientRect();
          const bar = document.querySelector("header.board-bar").getBoundingClientRect();
          const control = el.querySelector(".wallet-connect__button");
          const s = control && getComputedStyle(control);
          return JSON.stringify({
            present: true,
            inHeader: !!el.closest("header.board-bar"),
            inPanel: !!el.closest(".board-controls"),
            visible: b.width > 0 && b.height > 0,
            // After the wordmark: its left edge is past the wordmark's right.
            afterWordmark: b.left >= document.querySelector("header.board-bar h1").getBoundingClientRect().right,
            insideBar: b.top >= bar.top - 1 && b.bottom <= bar.bottom + 1,
            violet: s ? s.backgroundColor : null,
            ink: s ? s.color : null,
          });
        })()`)) as Record<string, unknown>;

        expect(where.present, `no wallet control at all, ${at}`).toBe(true);
        expect(where.inHeader, `the wallet control is not in the header, ${at}`).toBe(true);
        expect(where.inPanel, `the wallet control is inside the purchase panel, ${at}`).toBe(false);
        expect(where.visible, `the wallet control has no box, ${at}`).toBe(true);
        expect(where.afterWordmark, `the wallet control is before the wordmark, ${at}`).toBe(true);
        expect(where.insideBar, `the wallet control is outside the bar's own row, ${at}`).toBe(true);

        // THE VIOLET IS THE ONE THIS DOCUMENT DECIDED, read from the rendered
        // control rather than from the stylesheet — document, stylesheet,
        // pixel, the same loop every other colour assertion here closes.
        const expected = token("wallet", theme);
        expect(
          where.violet,
          `the wallet control's violet, ${at}`,
        ).toBe(`rgb(${expected.join(", ")})`);

        // And the panel, once there is one, contains no wallet control.
        if (width > 640) {
          await selectARectangle(browser);
          expect(
            await browser.evaluate<boolean>(
              `!!document.querySelector(".board-controls:not([hidden]) .wallet-connect")`,
            ),
            `the purchase panel is carrying a wallet control, ${at}`,
          ).toBe(false);
        }
      }
    },
    240_000,
  );

  /**
   * THE PRESET PILL'S SPACING, WITH THE REAL FONT AND WITH IT TAKEN AWAY.
   *
   * REPORTED FROM macOS: the presets touching each other in the rail, and not
   * touching on Windows. Not reproducible on this machine, which has one OS and
   * one font stack — so what is guarded is the PROPERTY that made it possible
   * rather than the platform that showed it. Measured before the fix, the pill
   * was computing `gap: 4px` (Tailwind's `gap-1` in the markup outranking this
   * stylesheet's `gap: 10px`, a utilities rule beating a components one) and a
   * 24px button around a 24.5px content box. Button widths moved 3.5px between
   * the real face and the fallback, which is enough to change where a wrapped
   * row breaks — four 24px pills four pixels apart on one machine, three rows on
   * another.
   *
   * So this measures the distance between consecutive buttons' boxes twice:
   * once with the fonts the page loads, and once with every family refused, so
   * the browser falls back to whatever it has. Both must clear 8px, and the
   * buttons must be the same height in both.
   */
  it(
    "keeps the preset buttons apart, with the real font and with none",
    async () => {
      const MEASURE = `(() => {
        const presets = document.querySelector(".board-rail__presets");
        const boxes = [...presets.querySelectorAll("button")].map((b) => {
          const r = b.getBoundingClientRect();
          return { text: b.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height };
        });
        const gaps = [];
        for (let i = 1; i < boxes.length; i += 1) {
          const a = boxes[i - 1], b = boxes[i];
          // Consecutive buttons are separated on exactly one axis: the next one
          // in the same row, or the first of the row under it.
          const stacked = b.y > a.y + a.h / 2;
          gaps.push({ between: a.text + " → " + b.text,
                      axis: stacked ? "row" : "column",
                      gap: stacked ? b.y - (a.y + a.h) : b.x - (a.x + a.w) });
        }
        return JSON.stringify({ gaps, heights: boxes.map((b) => b.h),
          font: getComputedStyle(boxes.length ? presets.querySelector("button") : presets).fontFamily });
      })()`;
      // Every family the page can ask for, refused. This is the platform
      // difference made reproducible: whatever the machine falls back to has
      // different metrics from the face `next/font` self-hosts.
      const NO_FONTS = `(() => { const s = document.createElement("style");
        s.textContent = "*{font-family:sans-serif!important}";
        document.head.appendChild(s); return true; })()`;

      type Reading = {
        gaps: { between: string; axis: string; gap: number }[];
        heights: number[];
        font: string;
      };

      for (const [width, height] of [
        [2495, 1484],
        [1920, 1080],
        [1440, 900],
      ] as const) {
        const at = `${width}x${height}`;
        await browser.resize(width, height);
        await browser.goto(`${server.origin}/?presets=${at}`);
        await waitFor(`the board at ${at}`, async () =>
          browser.evaluate<string | null>(`document.querySelector('canvas')?.dataset.boardRect ?? null`),
        );

        const real = JSON.parse(await browser.evaluate<string>(MEASURE)) as Reading;
        await browser.evaluate(NO_FONTS);
        await sleep(300);
        const fallback = JSON.parse(await browser.evaluate<string>(MEASURE)) as Reading;

        // The two passes really were two faces — otherwise this compares a
        // measurement with itself, which is the same failure the capture script
        // guards against between themes.
        expect(real.font, `the face did not change at ${at}`).not.toBe(fallback.font);

        for (const [what, reading] of [["real font", real], ["fallback", fallback]] as const) {
          expect(reading.gaps.length, `no preset buttons at ${at}`).toBeGreaterThan(2);
          for (const { between, axis, gap } of reading.gaps) {
            expect(
              gap,
              `${at}, ${what}: ${between} are ${gap.toFixed(1)}px apart across the ${axis}`,
            ).toBeGreaterThanOrEqual(8);
          }
          // And a height that does not come from the type: every button the
          // same, and never under the 26px floor.
          for (const h of reading.heights) {
            expect(h, `${at}, ${what}: a preset button is ${h}px tall`).toBeGreaterThanOrEqual(26);
          }
          expect(
            new Set(reading.heights.map((h) => h.toFixed(1))).size,
            `${at}, ${what}: the preset buttons are not all the same height`,
          ).toBe(1);
        }
      }
    },
    240_000,
  );

  /**
   * THE REGISTER IS A TICKER, and the only thing that makes it one is that it
   * moves.
   *
   * DESIGN.md's argument for showing settled purchases at all is that *the
   * thing that moves fast IS the evidence* — a row cannot pass without its
   * signature and nothing on it can be reversed. A register that has stopped is
   * a list, so this asserts the motion itself rather than the markup: the
   * track's transform at one moment against its transform a beat later.
   *
   * It also asserts the two things the motion must not cost. The wall does not
   * move under it — a ticker that reflowed the board would be paying for
   * evidence with the artwork — and the ticker does not stand on a purchase.
   */
  it(
    "runs the settled register as a ticker, pauses it for a reader, and moves no pixel of wall",
    async () => {
      await execute(
        `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                             payment_signature, caption)
         VALUES (300, 0, 650, 60, 'paid', 1000000, 39000000000, now(), 'ticker-top', 'Across the top'),
                (0, 400, 120, 90, 'paid', 1000000, 10800000000, now(), 'ticker-two', 'A second one')`,
      );

      for (const [width, height, where] of [
        [3440, 1440, "the rails"],
        [1920, 1080, "the strip along the bottom"],
        [1440, 900, "the strip along the bottom"],
      ] as const) {
        const at = `${width}x${height}`;
        await browser.resize(width, height);
        await browser.goto(`${server.origin}/?ticker=${at}`);
        const read = `document.querySelector('canvas')?.dataset.boardRect ?? null`;
        const settled = await waitFor(`the board's fit at ${at}`, async () => {
          const before = await browser.evaluate<string | null>(read);
          await sleep(150);
          const after = await browser.evaluate<string | null>(read);
          return before !== null && before === after ? after : null;
        });

        const transform = `getComputedStyle(document.querySelector(".board-tape__track")).transform`;
        const first = await browser.evaluate<string>(transform);
        await sleep(900);
        const second = await browser.evaluate<string>(transform);
        expect(
          second,
          `the register is not moving at ${at} (${where}): ${first} both times`,
        ).not.toBe(first);

        /*
          2. IT STOPS FOR A READER, and this drives the FOCUS half of that.

          One declaration pauses it — `.board-tape__scroller:hover .track,
          .board-tape__scroller:focus-within .track` — and only one half of it
          can be driven from a page. `:hover` is a real pointer position, not an
          event: a dispatched `mouseover` does not set it, which this test found
          by asserting it and getting `running`. Focus is the same rule reached
          through the door a script can actually open, and it is the half a
          keyboard reader depends on.
        */
        await browser.evaluate(`document.querySelector(".board-tape__scroller").focus()`);
        expect(
          await browser.evaluate<string>(
            `getComputedStyle(document.querySelector(".board-tape__track")).animationPlayState`,
          ),
          `the register did not pause for a reader at ${at}`,
        ).toBe("paused");
        await browser.evaluate(`document.querySelector(".board-tape__scroller").blur()`);

        // 3. AND THE WALL DID NOT MOVE while all that happened.
        const after = await browser.evaluate<string | null>(read);
        expect(after, `the board moved while the register ticked at ${at}`).toBe(settled);

        // 4. Nor does the register stand on artwork: it is in a rail, or it is
        //    the strip under the board.
        const reading = JSON.parse(await browser.evaluate<string>(`(() => {
          const c = document.querySelector("canvas");
          const [bx, by, bw, bh] = c.dataset.boardRect.split(",").map(Number);
          const t = document.querySelector(".board-tape").getBoundingClientRect();
          return JSON.stringify({ covers:
            t.left < bx + bw && bx < t.right && t.top < by + bh && by < t.bottom }); })()`,
        )) as { covers: boolean };
        expect(reading.covers, `the register is standing on the board at ${at}`).toBe(false);
      }
    },
    240_000,
  );

  /**
   * NOTHING STANDS ON THE WALL, AT ANY WIDTH.
   *
   * Settled by the owner on 2026-09-02, and it replaced an exemption plus a
   * mitigation: the preset pill used to stand on the board wherever the
   * letterbox was too narrow for a rail — which is every viewport here except
   * the ultrawide — and faded itself after two still seconds to make that
   * bearable. There is no exemption left, so this asks the same question at
   * every width instead of at the three that had a rail.
   *
   * It seeds a sale straight across the top-centre of the wall — the strip the
   * old overlay stood on — and derives where that purchase landed on screen
   * from the rectangle the renderer reports, so this is not the fit maths
   * checking itself.
   *
   * AND IT VALIDATES ITSELF IN THE NEGATIVE. A geometry test that has never
   * been seen to fail is a test that might be comparing two empty boxes, so the
   * last pass puts the tools back over the board by hand and requires the same
   * detector to say so. `~/.claude/GATES.md`: a guard is not a guard until it
   * has been seen to fail.
   */
  it(
    "never stands on a sold pixel, at any width",
    async () => {
      await execute(
        `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                             payment_signature, caption)
         VALUES (300, 0, 650, 60, 'paid', 1000000, 39000000000, now(), 'across-the-top',
                 'Across the top of the wall')`,
      );

      const covered: string[] = [];

      for (const [width, height, why] of [
        [1280, 800, "the strip"],
        [1440, 900, "the strip"],
        [1920, 1080, "the strip"],
        [2495, 1484, "the strip"],
        [390, 844, "the stacked strip"],
        [3440, 1440, "the rails"],
      ] as const) {
        const at = `${width}x${height}`;
        await browser.resize(width, height);
        await browser.goto(`${server.origin}/?overlay=${at}`);
        const read = `document.querySelector('canvas')?.dataset.boardRect ?? null`;
        await waitFor(`the board's fit at ${at} to settle`, async () => {
          const before = await browser.evaluate<string | null>(read);
          await sleep(150);
          const after = await browser.evaluate<string | null>(read);
          return before !== null && before === after ? after : null;
        });

        const reading = JSON.parse(await browser.evaluate<string>(OVERLAY_VS_SALE)) as OverlayReading;

        expect(reading.tools, `the board's tools are missing at ${at}`).not.toBeNull();
        /*
          AND NOTHING INSIDE EITHER RAIL OVERFLOWS IT. A box of the right size
          whose content paints outside it covers exactly as much artwork as a
          box of the wrong size, and this test measured only the box until a
          missing `flex-wrap` put a 369px row of presets in a 98px column and
          painted it across the wall. Overflow is the shape that failure takes.
        */
        expect(
          reading.overflow,
          `content is painting outside the rails at ${at}:\n  ` + reading.overflow.join("\n  "),
        ).toEqual([]);
        // And the layout really is the one this row is about: a rail that
        // silently failed to appear would pass the coverage check by putting
        // the chrome somewhere else entirely.
        expect(reading.rails, `${at} should be ${width > 3000 ? "railed" : "banded"}`).toBe(
          width > 3000 ? "full" : "off",
        );

        if (reading.covers) {
          covered.push(`${at} (${why}): tools ${edges(reading.tools!)}, sale ${edges(reading.sold)}`);
        }
      }

      expect(
        covered,
        "chrome is standing on artwork somebody bought:\n  " + covered.join("\n  "),
      ).toEqual([]);

      /*
        THE NEGATIVE. Put the tools back where they used to be — fixed, over the
        middle of the board — and the same reading must report a cover. If it
        does not, every assertion above was measuring nothing.
      */
      await browser.resize(1440, 900);
      await browser.goto(`${server.origin}/?overlay=negative`);
      await waitFor("the board at 1440x900", async () =>
        browser.evaluate<string | null>(`document.querySelector('canvas')?.dataset.boardRect ?? null`),
      );
      await browser.evaluate(
        `(() => { const el = document.querySelector(".board-tools");
          el.style.position = "fixed"; el.style.top = "60px"; el.style.left = "40%";
          el.style.zIndex = "50"; return true; })()`,
      );
      await sleep(200);
      const forced = JSON.parse(await browser.evaluate<string>(OVERLAY_VS_SALE)) as OverlayReading;
      expect(
        forced.covers,
        "the detector said nothing was covered with the tools parked on the sale — " +
          "every pass above was measuring nothing",
      ).toBe(true);
    },
    240_000,
  );

  /**
   * The one line that says how to start: there while nothing is drawn, gone the
   * moment something is.
   *
   * WHAT IT IS GUARDING. The line closes the hole the interaction legend left,
   * and the whole of its value is that it goes away — an instruction that is
   * still on screen after somebody has followed it is not an instruction, it is
   * furniture. So the absence is asserted as hard as the presence, and both are
   * asserted in both registers, because a line whose colour is only defined in
   * one theme is a line that is invisible in the other.
   *
   * IT SHARES THE PANEL'S BOX NOW rather than being a pill of its own. That is
   * a layout requirement rather than a tidy-up: the strip along the bottom is
   * measured into the chrome the board is fitted against, so the idle box and
   * the selected box have to be the same height or the wall refits under the
   * rectangle somebody has just drawn. So this asserts `hidden` rather than
   * absence — the box stays, its contents swap — and reads the colour off the
   * line itself and the ground off the panel that holds it.
   *
   * At 1440 and 390 it is in the strip; at 3440 it is at the foot of the left
   * rail. Both, because those are two different rules and the second one only
   * exists on monitors nobody develops on.
   */
  it(
    "shows one line of instruction until a rectangle is drawn, in both themes",
    async () => {
      const LINE = "Drag on the wall to choose your pixels";
      const grounds = new Map<string, { line: string; body: string }>();

      /*
        ALL THREE PLACEMENTS, because they are three rules. 1440 is the strip
        along the bottom, 3440 is the foot of the left rail, and 390 is the
        strip stacked into rows.
      */
      for (const [width, height] of [
        [1440, 900],
        [3440, 1440],
        [390, 844],
      ] as const) {
        for (const theme of ["light", "dark"] as const) {
          const at = `${theme} at ${width}x${height}`;
          await browser.resize(width, height);
          await browser.goto(`${server.origin}/?hint=${theme}-${width}`);
          await browser.evaluate(
            `document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)})`,
          );
          await waitFor(`the board at ${at}`, async () =>
            browser.evaluate<string | null>(
              `document.querySelector('canvas')?.dataset.boardRect ?? null`,
            ),
          );

          // 1. THERE, with its words, a real box, and this register's colours.
          const idle = JSON.parse(
            await waitFor(`the instruction line ${at}`, async () =>
              browser.evaluate<string | null>(
                `(() => { const el = document.querySelector(".board-hint");
                   const lead = document.querySelector(".board-hint__lead");
                   const box = document.querySelector(".board-controls");
                   if (!el || !lead || !box || el.hasAttribute("hidden")) return null;
                   const b = el.getBoundingClientRect();
                   return JSON.stringify({ text: lead.textContent.trim(), w: b.width, h: b.height,
                     colour: getComputedStyle(lead).color,
                     ground: getComputedStyle(box).backgroundColor,
                     stripGround: getComputedStyle(document.querySelector(".board-strip")).backgroundColor,
                     bodyGround: getComputedStyle(document.body).backgroundColor }); })()`,
              ),
            ),
          ) as {
            text: string;
            w: number;
            h: number;
            colour: string;
            ground: string;
            stripGround: string;
            bodyGround: string;
          };

          expect(idle.text, `the instruction line's words, ${at}`).toBe(LINE);
          expect(idle.w, `the line has no width, ${at}`).toBeGreaterThan(0);
          expect(idle.h, `the line has no height, ${at}`).toBeGreaterThan(0);
          // Painted rather than transparent: a rule defined in one register and
          // not the other is exactly how a line goes missing in one theme.
          expect(idle.colour, `the line's colour, ${at}`).not.toBe("rgba(0, 0, 0, 0)");
          /*
            THE GROUND IS THE STRIP'S NOW, and this assertion was reversed with
            the panel on 2026-09-03. It used to require the panel to paint a
            ground of its own — which it did, white, in both registers, as
            DESIGN.md's first exception. The panel is an outline over the strip
            since the owner reversed that, so the box under this line is
            deliberately transparent and the question worth asking moved one
            element out: the line has to be legible against whatever is actually
            behind it, which is the strip.
          */
          expect(idle.ground, `the line's own fill, ${at}`).toBe("rgba(0, 0, 0, 0)");
          expect(idle.stripGround, `the strip behind the line, ${at}`).not.toBe(
            "rgba(0, 0, 0, 0)",
          );
          expect(idle.colour, `the line against the strip, ${at}`).not.toBe(idle.stripGround);
          grounds.set(at, { line: `${idle.colour} on ${idle.ground}`, body: idle.bodyGround });

          // And the readout is NOT up: the two share a box and must never share
          // a moment.
          expect(
            await browser.evaluate<boolean>(
              `!!document.querySelector(".board-controls .selection-panel")
                 && !document.querySelector(".board-controls .selection-panel")
                      .closest("[hidden]")`,
            ),
            `the purchase readout is up with nothing selected, ${at}`,
          ).toBe(false);

          // 2. GONE, the moment there is a rectangle — hidden rather than
          // removed, because the box it is in is what holds the strip's height.
          await selectARectangle(browser);
          expect(
            await browser.evaluate<boolean>(
              `document.querySelector(".board-hint").hasAttribute("hidden")`,
            ),
            `the instruction line survived a selection, ${at}`,
          ).toBe(true);
        }
      }

      /*
        AND THE TWO PASSES WERE REALLY TWO REGISTERS — asked of the BODY, not of
        the line.

        This used to require the line's own colours to differ between themes,
        and that stopped being true when it moved inside the purchase panel:
        `DECISIONS.md`, "the purchase panel is white in both registers, because
        it is the receipt". The line is dark-on-white in both, deliberately. So
        the sameness is asserted as the exception it is, and the proof that two
        registers really ran comes from the page's own ground, which does
        differ. Headless Chrome follows the machine's preference — this one
        prefers dark — so a pair of passes that both ran dark would otherwise
        say nothing about light.
      */
      for (const [width, height] of [
        [1440, 900],
        [3440, 1440],
        [390, 844],
      ] as const) {
        const light = grounds.get(`light at ${width}x${height}`);
        const dark = grounds.get(`dark at ${width}x${height}`);
        expect(
          light?.body,
          `both passes at ${width} painted the same page ground (${light?.body}) — ` +
            "this compared a register with itself",
        ).not.toBe(dark?.body);
        /*
          REVERSED WITH THE PANEL, 2026-09-03. This required the line to read
          the SAME in both registers, because it sat inside the receipt and a
          receipt was white in both. The owner reversed that exception, so the
          line now takes whichever register it is in — and requiring them to
          MATCH is now the assertion that would catch the exception creeping
          back.
        */
        expect(
          light?.line,
          `the instruction line reads ${light?.line} in both registers at ${width} — ` +
            "the panel is an outline over the strip now, so it should read the register it is in",
        ).not.toBe(dark?.line);
      }
    },
    240_000,
  );

  /**
   * The hover card at the board's extreme edges, where the rails are.
   *
   * WHY THE EDGE AND NOWHERE ELSE. The card follows the pointer, so it is the
   * one piece of chrome whose position is an argument rather than a rule, and
   * the argument only fails at the ends: anywhere in the middle of a 2170px
   * board every placement fits and every rule looks right. `viewport.test.ts`
   * pins the arithmetic across the whole width; this pins that the arithmetic
   * is what the browser actually applies, against the rails' real boxes.
   *
   * It hovers a rectangle sitting on the last ten pixels of the board and one
   * sitting on the first ten, at both widths where the rails exist, and asks
   * for the card's own rectangle. What it must never be is over a rail.
   */
  it(
    "keeps the hover card off both side rails, at the board's extreme edges",
    async () => {
      // Two rectangles, one against each edge of a 1250-wide board. They have
      // no bytes, so the card renders its "no picture" state — which is the
      // state that matters here, because position is what is being asserted.
      await execute(
        `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                             payment_signature, caption)
         VALUES (1240, 300, 10, 10, 'paid', 1000000, 100000000, now(), 'edge-right', 'The right edge'),
                (0, 300, 10, 10, 'paid', 1000000, 100000000, now(), 'edge-left', 'The left edge')`,
      );

      for (const [width, height] of [
        [3440, 1440],
        [3840, 2160],
      ] as const) {
        const at = `${width}x${height}`;
        await browser.resize(width, height);
        await browser.goto(`${server.origin}/?hover=${at}`);
        const read = `document.querySelector('canvas')?.dataset.boardRect ?? null`;
        await waitFor(`the board's fit at ${at} to settle`, async () => {
          const before = await browser.evaluate<string | null>(read);
          await sleep(150);
          const after = await browser.evaluate<string | null>(read);
          return before !== null && before === after ? after : null;
        });
        expect(
          await browser.evaluate<string | null>(`document.documentElement.dataset.rails`),
          `the rails should be on at ${at} — without them this asserts nothing`,
        ).toBe("full");

        for (const [edge, boardX] of [
          ["right", 1245],
          ["left", 5],
        ] as const) {
          /*
            The pointer goes on the rectangle itself, in board coordinates
            converted through the rectangle the renderer reports. Picking a
            screen coordinate directly would be this test deciding where the
            board is, which is the thing it is checking.
          */
          const moved = await browser.evaluate<boolean>(`(() => {
            const c = document.querySelector("canvas");
            const [bx, by, bw, bh] = c.dataset.boardRect.split(",").map(Number);
            const x = bx + (${boardX} / 1250) * bw;
            const y = by + (305 / 800) * bh;
            c.dispatchEvent(new PointerEvent("pointermove", {
              clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true,
            }));
            return true;
          })()`);
          expect(moved).toBe(true);

          const card = await waitFor(`the hover card at the ${edge} edge, ${at}`, async () => {
            const box = await browser.evaluate<string | null>(
              `(() => { const el = document.querySelector(".floating-card.fixed");
                 if (!el) return null; const b = el.getBoundingClientRect();
                 return JSON.stringify({ left: b.left, right: b.right, width: b.width }); })()`,
            );
            return box;
          });
          const { left, right, width: cardWidth } = JSON.parse(card) as {
            left: number;
            right: number;
            width: number;
          };

          const rails = JSON.parse(
            await browser.evaluate<string>(`JSON.stringify({
              left: document.querySelector('.board-side--left').getBoundingClientRect(),
              right: document.querySelector('.board-side--right').getBoundingClientRect(),
            })`),
          ) as { left: DOMRect; right: DOMRect };

          expect(cardWidth, `the hover card has no width at the ${edge} edge, ${at}`).toBeGreaterThan(0);
          expect(
            left,
            `the hover card at the ${edge} edge of ${at} starts at ${left}, over the left rail`,
          ).toBeGreaterThanOrEqual(rails.left.right);
          expect(
            right,
            `the hover card at the ${edge} edge of ${at} ends at ${right}, over the right rail`,
          ).toBeLessThanOrEqual(rails.right.left);
        }
      }
    },
    240_000,
  );

  /**
   * THE NEGATIVE THE SIDE RAILS ARE ALLOWED ON: the board is never narrower
   * because a rail is there.
   *
   * WHY IT IS NEGATIVE. Everything else about the amendment is a thing that
   * appears — a column, a register standing up, a thumbnail — and every one of
   * those can be judged by looking. The claim it rests on cannot: it is that
   * the wall did not pay for any of it. So this asserts the absence, at a
   * viewport where the rails are on, and it does it by measuring the SAME
   * window twice rather than two viewports once. `?rails=off` is what makes
   * that possible; see `rails-boot.ts` for why it exists.
   *
   * 2560×1440 is the narrowest 16:9 window the rails reach at all — DESIGN.md
   * puts the gap there at 186px against a 180px floor — which makes it the
   * viewport where the guarantee is closest to failing and therefore the one
   * worth asserting. 3440×1440 is the same claim where the rail is at its
   * ceiling and the leftover goes back to being wall.
   */
  it(
    "never narrows the board to make room for a side rail",
    async () => {
      for (const [width, height] of [
        [3440, 1440],
        [3840, 2160],
      ] as const) {
        const at = `${width}x${height}`;
        const settled = async () => {
          const read = `document.querySelector('canvas')?.dataset.boardRect ?? null`;
          const painted = await waitFor(`the board's fit at ${at} to settle`, async () => {
            const before = await browser.evaluate<string | null>(read);
            await sleep(150);
            const after = await browser.evaluate<string | null>(read);
            return before !== null && before === after ? after : null;
          });
          return painted.split(",").map(Number);
        };

        await browser.resize(width, height);

        await browser.goto(`${server.origin}/?rails=off`);
        expect(
          await browser.evaluate<string | null>(`document.documentElement.dataset.rails`),
          `?rails=off should have turned the rails off at ${at}`,
        ).toBe("off");
        const [, , withoutW, withoutH] = await settled();

        await browser.goto(`${server.origin}/?rails=on-${at}`);
        expect(
          await browser.evaluate<string | null>(`document.documentElement.dataset.rails`),
          `the rails should be on at ${at} — if they are not, this test is measuring one layout twice`,
        ).toBe("full");
        const [x, , withW, withH] = await settled();

        // 1. THE CLAIM. Not "about the same": the rail is sized from a gap the
        //    board could not have used, so the board is fitted to MORE height
        //    than before and comes out strictly larger in both dimensions.
        expect(
          withW,
          `the board is ${withW}px wide with the rails at ${at} and ${withoutW}px without them`,
        ).toBeGreaterThanOrEqual(withoutW);
        expect(
          withH,
          `the board is ${withH}px tall with the rails at ${at} and ${withoutH}px without them`,
        ).toBeGreaterThanOrEqual(withoutH);

        // 2. AND THE RAIL IS REALLY THERE, beside the board rather than over
        //    it. A layout that quietly failed to draw the rails would satisfy
        //    the assertion above by being the layout it was compared with.
        const rails = JSON.parse(
          await browser.evaluate<string>(`JSON.stringify({
            left: document.querySelector('.board-side--left').getBoundingClientRect(),
            right: document.querySelector('.board-side--right').getBoundingClientRect(),
          })`),
        ) as { left: DOMRect; right: DOMRect };
        expect(rails.left.width, `the left rail at ${at}`).toBeGreaterThan(0);
        expect(rails.right.width, `the right rail at ${at}`).toBeGreaterThan(0);
        expect(rails.left.right, `the left rail reaching over the board at ${at}`).toBeLessThanOrEqual(x);
        expect(rails.right.left, `the right rail reaching over the board at ${at}`).toBeGreaterThanOrEqual(x + withW);

        // 3. And the settled register is IN the right rail rather than still
        //    along the bottom, which is where the board's extra height comes
        //    from. Its box has to be inside the rail's.
        const tape = JSON.parse(
          await browser.evaluate<string>(
            `JSON.stringify(document.querySelector('.board-tape').getBoundingClientRect())`,
          ),
        ) as DOMRect;
        expect(tape.left, `the settled register at ${at}`).toBeGreaterThanOrEqual(rails.right.left);
        expect(tape.bottom, `the settled register at ${at}`).toBeLessThanOrEqual(height);
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

  /**
   * TWO GESTURES ON A SOLD RECTANGLE, and the only place they can be told
   * apart is a real browser.
   *
   * `DECISIONS.md`, "Reversed: resting on a rectangle shows a tooltip again":
   * hovering shows ONE LINE and clicking opens the FULL CARD. Everything about
   * that lives in pointer events, React state and CSS at once — the canvas
   * decides what a click landed on, BoardView decides which of the two is
   * showing, and the stylesheet decides whether the thing that is showing can
   * be clicked through. A unit test of any one of those three passes while the
   * feature is broken.
   *
   * IT ASKS THE RENDERER WHERE THE BOARD IS rather than sweeping the canvas for
   * it. `data-board-rect` is the box the canvas just painted with — the same
   * number the fit guard above reads — so a board coordinate becomes a screen
   * coordinate without a second copy of `viewport.ts` living in a test, and a
   * second copy that agreed with the first would prove nothing about the first.
   *
   * The sweep this replaced worked and was unusable: two animation frames per
   * probe over a grid of a thousand points is half a minute of wall clock
   * before it reaches a rectangle at board y=200, and it spent the whole 120s
   * budget the first time it ran here.
   *
   * `setPointerCapture` is stubbed because a synthetic pointer has no capture
   * to take and the real one throws `NotFoundError` on it. Nothing else about
   * the events is faked.
   */
  it(
    "shows one line on hover, the whole card on a click, and closes on Escape",
    async () => {
      await execute(
        `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                             buyer_pubkey, payment_signature, caption)
         VALUES (200, 200, 300, 200, 'paid', $1, $2, now(), $3, $4, $5)`,
        [1_000_000, 300 * 200 * 1_000_000, testWallet().address, "sig-hover", "A caption to read"],
      );

      await browser.goto(`${server.origin}/`);
      await waitFor("the board to report where it painted", () =>
        browser.evaluate<boolean>("!!document.querySelector('canvas')?.dataset.boardRect"),
      );

      await browser.evaluate(`(() => {
        Element.prototype.setPointerCapture = function () {};
        Element.prototype.releasePointerCapture = function () {};
        // A board coordinate, as a point on the glass. The canvas publishes the
        // box it painted; 1250x800 is the board's own size.
        window.__board = function (bx, by) {
          const c = document.querySelector("canvas");
          const box = c.getBoundingClientRect();
          const [x, y, w, h] = c.dataset.boardRect.split(",").map(Number);
          return { c, clientX: box.left + x + (bx / 1250) * w, clientY: box.top + y + (by / 800) * h };
        };
        window.__at = function (type, bx, by) {
          const p = window.__board(bx, by);
          p.c.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, composed: true, pointerId: 1,
            pointerType: "mouse", isPrimary: true, button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: p.clientX, clientY: p.clientY,
          }));
        };
        window.__frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      })()`);

      // The middle of the rectangle seeded above, and a corner of bare wall.
      const ON = "350, 300";
      const OFF = "40, 40";

      await browser.evaluate(`(async () => { window.__at("pointermove", ${ON}); await window.__frame(); })()`);

      await waitFor("a tooltip on the rectangle under the pointer", () =>
        browser.evaluate<boolean>(`!!document.querySelector(".floating-card")`),
      );

      /*
        THE CAPTION ARRIVES AFTER THE TOOLTIP DOES, and waiting for it is the
        difference between this test and a flake. The board's payload carries no
        words at all — resting on a rectangle is what asks for them — so the
        first frame of the tooltip says the size and the price, and the caption
        replaces it one request later. The pointer has not moved, so nothing but
        that request is outstanding.
      */
      await waitFor("the caption to reach the tooltip", () =>
        browser.evaluate<boolean>(
          `document.querySelector(".floating-card")?.textContent === "A caption to read"`,
        ),
      );

      const settled = await browser.evaluate<{
        text: string;
        width: number;
        pointerEvents: string;
        isCard: boolean;
      }>(`(() => {
        const tip = document.querySelector(".floating-card");
        return { text: tip.textContent,
                 width: Math.round(tip.getBoundingClientRect().width),
                 pointerEvents: getComputedStyle(tip).pointerEvents,
                 isCard: !!tip.querySelector(".block-card-thumb") };
      })()`);

      // The caption the buyer wrote, and nothing else.
      expect(settled.text).toBe("A caption to read");
      // NOT the card: no thumbnail, and it cannot be clicked through to.
      expect(settled.isCard).toBe(false);
      expect(settled.pointerEvents).toBe("none");
      // Never wider than the card it replaced. `HOVER_CARD_W` is 224.
      expect(settled.width).toBeLessThanOrEqual(224);

      const card = await browser.evaluate<{
        thumb: boolean;
        link: boolean;
        pointerEvents: string;
        focused: boolean;
        text: string;
      } | null>(`(async () => {
        window.__at("pointerdown", ${ON});
        window.__at("pointerup", ${ON});
        await window.__frame(); await window.__frame();
        const card = document.querySelector('[role="dialog"]');
        if (!card) return null;
        return { thumb: !!card.querySelector(".block-card-thumb"),
                 link: !!card.querySelector('a[href^="/go/"]'),
                 pointerEvents: getComputedStyle(card).pointerEvents,
                 focused: document.activeElement === card,
                 text: card.textContent };
      })()`);

      expect(card).not.toBeNull();
      expect(card!.thumb).toBe(true);
      expect(card!.text).toContain("A caption to read");
      expect(card!.text).toContain("Sold");
      // The whole reason a click is worth having: the card can be reached.
      expect(card!.pointerEvents).toBe("auto");
      expect(card!.focused).toBe(true);

      const afterEscape = await browser.evaluate<boolean>(`(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await window.__frame(); await window.__frame();
        return !!document.querySelector('[role="dialog"]');
      })()`);
      expect(afterEscape).toBe(false);

      // And a click on bare wall closes it too, which is the gesture most
      // people will actually use.
      const afterBareWall = await browser.evaluate<{ opened: boolean; closed: boolean }>(`(async () => {
        window.__at("pointerdown", ${ON});
        window.__at("pointerup", ${ON});
        await window.__frame(); await window.__frame();
        const opened = !!document.querySelector('[role="dialog"]');
        window.__at("pointerdown", ${OFF});
        window.__at("pointerup", ${OFF});
        await window.__frame(); await window.__frame();
        return { opened, closed: !document.querySelector('[role="dialog"]') };
      })()`);
      expect(afterBareWall).toEqual({ opened: true, closed: true });
    },
    120_000,
  );

  /**
   * ONE CAPTION AT A TIME, AND NONE WHEN THE POINTER IS OFF THE WALL.
   *
   * Photographed on the preview wall on 2026-09-03: `Cape Verde`, `Colombia`
   * and `Germany` all lit at once with the pointer on none of them. The chip is
   * drawn by the canvas for any rectangle whose words are in the cache, and the
   * cache stopped being "the one under the pointer" when `keepDetail` began
   * asking for every rectangle in view so the composite could know its fit.
   *
   * THE ASSERTION IS THE WALL ITSELF, not a count of chips. A canvas exposes
   * nothing of what it has drawn, so this takes the board's own pixels with the
   * pointer away, hovers three rectangles in turn, moves away again, and
   * requires the pixels to be what they were. A chip that stuck would change
   * them; nothing else on an idle board can. That is a stronger claim than
   * "at most one" and it is the one that was actually broken.
   */
  it(
    "draws one caption at a time, and leaves none behind when the pointer goes",
    async () => {
      const wallet = testWallet().address;
      const seeded: { x: number; y: number; caption: string }[] = [
        { x: 100, y: 100, caption: "Cape Verde" },
        { x: 300, y: 100, caption: "Colombia" },
        { x: 500, y: 100, caption: "Germany" },
      ];
      for (const [i, block] of seeded.entries()) {
        await execute(
          `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                               buyer_pubkey, payment_signature, caption)
           VALUES ($1, $2, 140, 100, 'paid', $3, $4, now(), $5, $6, $7)`,
          [block.x, block.y, 1_000_000, 140 * 100 * 1_000_000, wallet, `sig-chip-${i}`, block.caption],
        );
      }

      await browser.goto(`${server.origin}/`);
      await waitFor("the board to report where it painted", () =>
        browser.evaluate<boolean>("!!document.querySelector('canvas')?.dataset.boardRect"),
      );

      await browser.evaluate(`(() => {
        Element.prototype.setPointerCapture = function () {};
        Element.prototype.releasePointerCapture = function () {};
        window.__board = function (bx, by) {
          const c = document.querySelector("canvas");
          const box = c.getBoundingClientRect();
          const [x, y, w, h] = c.dataset.boardRect.split(",").map(Number);
          return { c, clientX: box.left + x + (bx / 1250) * w, clientY: box.top + y + (by / 800) * h };
        };
        window.__at = function (type, bx, by) {
          const p = window.__board(bx, by);
          p.c.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, composed: true, pointerId: 1,
            pointerType: "mouse", isPrimary: true, button: 0, buttons: 0,
            clientX: p.clientX, clientY: p.clientY,
          }));
        };
        window.__frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        // Bare wall, well clear of everything seeded above.
        window.__away = async () => { window.__at("pointermove", 1100, 700); await window.__frame(); await window.__frame(); };
        window.__wall = () => document.querySelector("canvas").toDataURL("image/png").length
          + ":" + document.querySelector("canvas").toDataURL("image/png").slice(-256);
      })()`);

      // The wall with nothing under the pointer, before any hovering at all.
      await browser.evaluate(`window.__away()`);
      const before = await browser.evaluate<string>(`window.__wall()`);

      // Each rectangle in turn, waiting for its caption to arrive and be drawn.
      const lit: string[] = [];
      for (const block of seeded) {
        await browser.evaluate(
          `(async () => { window.__at("pointermove", ${block.x + 70}, ${block.y + 50}); await window.__frame(); })()`,
        );
        await waitFor(`the tooltip for ${block.caption}`, () =>
          browser.evaluate<boolean>(
            `document.querySelector(".floating-card")?.textContent === ${JSON.stringify(block.caption)}`,
          ),
        );
        lit.push(
          await browser.evaluate<string>(
            `String(document.querySelectorAll(".floating-card").length)`,
          ),
        );
      }

      // Never two of them, at any point in that walk.
      expect(lit).toEqual(["1", "1", "1"]);

      await browser.evaluate(`window.__away()`);
      // The tooltip goes with the pointer.
      expect(
        await browser.evaluate<number>(`document.querySelectorAll(".floating-card").length`),
      ).toBe(0);

      // And so does every chip: the wall is the wall it was.
      expect(await browser.evaluate<string>(`window.__wall()`)).toBe(before);
    },
    120_000,
  );
});
