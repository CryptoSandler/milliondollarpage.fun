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
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";
import sharp from "sharp";
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
/**
 * Whether two connection strings address the same database — host, port and
 * name only, because connecting as a different role still truncates the same
 * tables. Copied from `vitest.setup.ts` rather than imported: that module pulls
 * in vitest, which cannot be required from a plain script.
 *
 * An unparseable URL counts as a match. Refusing to run is the safe answer when
 * we cannot tell what we are pointed at.
 */
function sameTarget(a: string, b: string | undefined): boolean {
  if (b === undefined) return false;
  try {
    const key = (url: URL) =>
      `${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname.replace(/\/+$/, "")}`;
    return key(new URL(a)) === key(new URL(b));
  } catch {
    return true;
  }
}

if (sameTarget(DATABASE, process.env.DATABASE_URL)) {
  console.error(
    "TEST_DATABASE_URL and DATABASE_URL point at the same database. This script " +
      "truncates to seed a board; pointing it at the app database would delete real data.",
  );
  process.exit(1);
}

/**
 * REDIRECT THE SERVER'S DATABASE, and this line is the whole reason the first
 * run of this script produced four screenshots of an empty wall while the test
 * database genuinely held 140 purchases.
 *
 * `dev-server.ts` passes `process.env.DATABASE_URL` through to the `next dev`
 * it starts. Under vitest that is already the test database, because
 * `vitest.setup.ts` reassigns it. This script does not run under vitest, so
 * without this line the server it screenshots is pointed at the APP database —
 * which is empty, which is why the captures looked plausible and were useless.
 *
 * It is also the more serious half: a harness driving a browser against
 * production is one interaction away from writing to it. The guard above is
 * what makes that a refusal rather than a near miss.
 */
process.env.DATABASE_URL = DATABASE;

const OUT = process.argv[2];
if (!OUT) {
  console.error("usage: npx tsx scripts/capture-board.mts <out-dir>");
  process.exit(1);
}

/**
 * The three widths, and why these three.
 *
 * 1440 is the commonest laptop the board is looked at on and the width the fit
 * maths was first got wrong at. 1920 is where the panel stops being the
 * constraint and the board is limited by height instead — a different branch of
 * the same arithmetic, and the one where a register change is most likely to
 * leave the board smaller than it needs to be. 2560 is the third layout: the
 * one with side rails, which neither of the others shows at all.
 */
const WIDTHS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
  /*
    AND THE ONE WHERE THE LAYOUT IS A DIFFERENT LAYOUT. 2560×1440 is the
    narrowest 16:9 window the side rails reach — the chrome moves into the
    letterbox, the settled register stands up into a column and the strip along
    the bottom goes away — so leaving it out would ask the owner to judge an
    amendment at the two widths it does not change.
  */
  { name: "2560", width: 2560, height: 1440 },
  /*
    AND THE OWNER'S OWN MAC, which is the viewport the paired rails were built
    for: 120px of gap, which is the tools pair — controls left, the register
    ticking down the right — and not the full one.
  */
  { name: "2495", width: 2495, height: 1484 },
];

/**
 * A board with enough on it to judge the register, laid out from a fixed seed
 * so two captures taken a week apart are comparable.
 *
 * IT WRITES REAL ARTWORK, and the first version of this did not. It seeded 140
 * rectangles with no image bytes, so every one of them rendered as the
 * sold-fallback slab and four screenshots showed a wall of grey boxes — which
 * is an honest picture of the fallback state and no picture at all of the
 * register somebody was being asked to judge. The owner said "mmm" to it, which
 * was the correct response.
 *
 * The mix is what a living wall looks like: a few project wordmarks on the
 * largest rectangles, then pixel art, photographs and flat marks, each with a
 * caption, a link and a fit. Stored at BLOCK_PIXEL_SCALE the way image-plan.ts
 * specifies, so the composite and a zoomed block both get the resolution they
 * expect.
 *
 * The project tiles are wordmarks generated here. They stand for CryptoSandler's
 * projects; the real brand assets are not on this machine.
 */
/* ------------------------------------------------------------------ artwork */

/** CryptoSandler's projects, as wordmark tiles. Placeholders, not real logos. */
const PROJECTS = [
  { name: "nftraffle", bg: "#1b1f3b", fg: "#f5c518", caption: "nftraffle — one ticket, one NFT" },
  { name: "pixelwar", bg: "#0f2f24", fg: "#3ee87f", caption: "pixelwar.fun — claim your tile" },
  { name: "kolscan", bg: "#2a1030", fg: "#e879f9", caption: "kolscanhispano — quién mueve el mercado" },
  { name: "bidoor", bg: "#3a1408", fg: "#ff8a3d", caption: "bidoor.lol — the last bid wins" },
  { name: "mdp", bg: "#101820", fg: "#eef2f7", caption: "milliondollarpage.fun" },
];

type Project = { name: string; bg: string; fg: string; caption: string };

async function wordmark(project: Project, w: number, h: number): Promise<Buffer> {
  const fontSize = Math.max(9, Math.min(h * 0.42, (w / Math.max(4, project.name.length)) * 1.5));
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="${project.bg}"/>
    <rect x="${w * 0.04}" y="${h * 0.04}" width="${w * 0.92}" height="${h * 0.92}"
          fill="none" stroke="${project.fg}" stroke-opacity="0.35" stroke-width="${Math.max(1, w * 0.012)}"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
          font-family="Helvetica, Arial, sans-serif" font-weight="700"
          font-size="${fontSize}" fill="${project.fg}">${project.name}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Hard-edged pixel art, drawn at one image pixel per pattern cell. */
async function pixelArt(w: number, h: number, seedFn: () => number): Promise<Buffer> {
  const cols = Math.max(3, Math.min(24, Math.round(w / 6)));
  const rows = Math.max(3, Math.min(24, Math.round(h / 6)));
  const palettes = [
    ["#0b0f14", "#22d3ee", "#7c3aed", "#f8fafc"],
    ["#1a0b2e", "#ff2e88", "#ffd166", "#06d6a0"],
    ["#08160f", "#2ce08a", "#0ea5e9", "#eab308"],
    ["#2b0a0a", "#ef4444", "#f97316", "#fde68a"],
  ];
  const palette = palettes[Math.floor(seedFn() * palettes.length)];
  const mode = Math.floor(seedFn() * 4);

  const px = Buffer.alloc(cols * rows * 3);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      let index;
      if (mode === 0) index = (x + y) % palette.length;                    // diagonal bands
      else if (mode === 1) index = ((x >> 1) ^ (y >> 1)) % palette.length; // blocky xor
      else if (mode === 2) index = Math.floor(seedFn() * palette.length);  // noise
      else index = Math.abs(x - cols / 2) + Math.abs(y - rows / 2) < cols / 3 ? 1 : 0; // a lozenge
      const hex = palette[index];
      const at = (y * cols + x) * 3;
      px[at] = parseInt(hex.slice(1, 3), 16);
      px[at + 1] = parseInt(hex.slice(3, 5), 16);
      px[at + 2] = parseInt(hex.slice(5, 7), 16);
    }
  }
  return sharp(px, { raw: { width: cols, height: rows, channels: 3 } }).png().toBuffer();
}

/** A photograph, in the only way this machine can make one: smooth and noisy. */
async function photograph(w: number, h: number, seedFn: () => number): Promise<Buffer> {
  const hue = Math.floor(seedFn() * 360);
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},55%,62%)"/>
      <stop offset="45%" stop-color="hsl(${(hue + 40) % 360},48%,44%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 200) % 360},40%,22%)"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${w * 0.7}" cy="${h * 0.3}" r="${Math.min(w, h) * 0.28}" fill="hsl(${(hue + 90) % 360},60%,70%)" opacity="0.55"/>
    <ellipse cx="${w * 0.25}" cy="${h * 0.75}" rx="${w * 0.35}" ry="${h * 0.22}" fill="hsl(${(hue + 300) % 360},50%,30%)" opacity="0.5"/>
  </svg>`;
  const base = await sharp(Buffer.from(svg)).blur(Math.max(0.4, Math.min(w, h) / 90)).png().toBuffer();
  const grain = await sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
      noise: { type: "gaussian", mean: 128, sigma: 16 },
    },
  }).png().toBuffer();
  return sharp(base).composite([{ input: grain, blend: "overlay" }]).png().toBuffer();
}

/** One strong flat colour with a mark on it — a logo nobody drew carefully. */
async function flat(w: number, h: number, seedFn: () => number): Promise<Buffer> {
  const colours = ["#ef4444", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#f8fafc", "#0b0f14", "#f97316"];
  const bg = colours[Math.floor(seedFn() * colours.length)];
  const fg = colours[Math.floor(seedFn() * colours.length)];
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="${bg}"/>
    <circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.3}" fill="${fg}"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const CAPTIONS = [
  "Ship fast. Break nothing.", "we do audits", "gm", "buy the dip, keep the pixels",
  "gnomes were here", "gato feliz", "gone forever, and that is the point",
  "gm from Buenos Aires", "gg", "wagmi but literally", "not financial advice",
  "one pixel at a time", "for Mia", "hola mundo", "still up",
];
const LINKS = [
  "https://example.com", "https://example.org/blog", "https://example.net/mint",
  "https://example.com/gallery", "https://example.org",
];

type Rect = { x: number; y: number; w: number; h: number };

/*
  One deterministic stream for the whole fixture — the layout AND the artwork
  draw from it in order, so the same wall comes back every run. It is named
  `lcg` rather than `seed` because `seed()` below is the function that writes
  the wall, and two things called seed in one file is how the first version of
  this failed to compile.
*/
let lcg = 20260901;
const next = () => (lcg = (lcg * 1103515245 + 12345) % 2147483648) / 2147483648;

function layout(): Rect[] {
  const placed: Rect[] = [];
  const hits = (r: Rect) =>
    placed.some((p) => r.x < p.x + p.w && p.x < r.x + r.w && r.y < p.y + p.h && p.y < r.y + r.h);

  for (let i = 0; i < 150; i += 1) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const w = Math.max(6, Math.round(next() ** 2.0 * 270));
      const h = Math.max(6, Math.round(next() ** 2.0 * 180));
      const candidate = {
        x: Math.round(next() * (BOARD_WIDTH - w)),
        y: Math.round(next() * (BOARD_HEIGHT - h)),
        w,
        h,
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
    let projectAt = 0;
    for (const [index, rect] of rects.entries()) {
      const scale = Math.min(4, 1024 / Math.max(rect.w, rect.h));
      const tw = Math.max(1, Math.round(rect.w * scale));
      const th = Math.max(1, Math.round(rect.h * scale));

      const roll = next();
      let bytes: Buffer;
      let caption: string;
      if (projectAt < PROJECTS.length && rect.w * rect.h > 12_000) {
        const project = PROJECTS[projectAt++];
        bytes = await wordmark(project, tw, th);
        caption = project.caption;
      } else if (roll < 0.5) {
        bytes = await pixelArt(tw, th, next);
        caption = CAPTIONS[Math.floor(next() * CAPTIONS.length)];
      } else if (roll < 0.72) {
        bytes = await photograph(tw, th, next);
        caption = CAPTIONS[Math.floor(next() * CAPTIONS.length)];
      } else {
        bytes = await flat(tw, th, next);
        caption = CAPTIONS[Math.floor(next() * CAPTIONS.length)];
      }

      await pool.query(
        `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                             payment_signature, pending_image, pending_image_mime,
                             image_sha256, is_animated, caption, link, image_fit)
         VALUES ($1,$2,$3,$4,'paid',1000000,$5, now() - make_interval(mins => $6), $7,$8,'image/png',
                 $9, false, $10, $11, $12)`,
        [
          rect.x, rect.y, rect.w, rect.h, rect.w * rect.h * 1_000_000, index,
          `capture${index}`.padEnd(88, "Kq2xVn7"),
          bytes,
          createHash("sha256").update(bytes).digest("hex"),
          caption.slice(0, 32),
          LINKS[Math.floor(next() * LINKS.length)],
          next() < 0.75 ? "contain" : "cover",
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
    /*
      EIGHT SHOTS: two themes, two states, two widths.

      Each pass STAMPS its theme rather than letting one of them be the default.
      A default is whatever the machine happens to prefer, and this machine's
      headless Chrome prefers dark — which is how a sibling script measured the
      dark theme twice and reported a flawless 0.0px over a comparison it had
      never made. What each pass RESOLVED to is recorded and checked at the end.
      See `~/.claude/GATES.md`, "A comparison names both states".
    */
    const resolved = new Map<string, string>();

    for (const state of ["empty", "full"] as const) {
      await seed(state === "full" ? layout() : []);

      for (const theme of ["light", "dark"] as const)
      for (const size of WIDTHS) {
        await browser.resize(size.width, size.height);
        // A DIFFERENT URL PER CAPTURE, and it is not decoration. The first
        // version navigated to the same origin four times, and Chrome served
        // the later visits from its own cache — so the "full" captures came
        // back byte-for-byte identical to the "empty" ones while the database
        // genuinely held 140 purchases. A screenshot that silently shows the
        // previous state is the worst possible output from this script: it is
        // evidence, and it was wrong.
        await browser.goto(`${server.origin}/?capture=${theme}-${state}-${size.name}`);
        await browser.evaluate(
          `document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)})`,
        );

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

        /*
          FREEZE EVERY ANIMATION AT ITS FIRST FRAME BEFORE SHOOTING.

          The settled rail rolls, so a screenshot catches it wherever it happens
          to be — which put the newest sale half off the left edge of the first
          capture and made the one treatment the gate was meant to judge
          unreadable. It also made two runs of this script incomparable, which
          is worse: a before/after pair has to differ only by the thing being
          decided.

          `animation: none` rather than `animation-play-state: paused`, because
          paused holds the current offset and none returns the track to
          translateX(0) — the rail's designed state, newest first.
        */
        await browser.evaluate(`(() => {
          const style = document.createElement("style");
          style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
          document.head.appendChild(style);
          return true;
        })()`);
        await sleep(150);

        // What this pass actually resolved to, read off the page rather than
        // assumed from what was asked for.
        const face = await browser.evaluate<string>(
          `getComputedStyle(document.querySelector("header.board-bar h1")).fontFamily`,
        );
        const ground = await browser.evaluate<string>(
          `getComputedStyle(document.body).backgroundColor`,
        );
        resolved.set(`${theme}-${state}-${size.name}`, `${ground} · ${face}`);

        const name = `board-${theme}-${state}-${size.name}.png`;
        await writeFile(join(OUT, name), await browser.screenshot());
        console.log(`wrote ${name.padEnd(30)} ${ground}  ${face.split(",")[0]}`);
      }
    }
    /*
      The two themes must have resolved to different things at every state and
      width. If they did not, these are eight screenshots of one theme and the
      pair somebody is about to compare is a pair of identical pictures.
    */
    for (const state of ["empty", "full"]) {
      for (const size of WIDTHS) {
        const light = resolved.get(`light-${state}-${size.name}`);
        const dark = resolved.get(`dark-${state}-${size.name}`);
        if (light === dark) {
          throw new Error(
            `Both themes resolved to the same thing at ${state}/${size.name}:\n` +
              `  ${light}\n` +
              "These captures compare a state with itself. See ~/.claude/GATES.md.",
          );
        }
      }
    }
    console.log("\n  both themes resolved differently at every state and width.");
  } finally {
    await browser.close();
    await server.stop();
  }
}

await main();
