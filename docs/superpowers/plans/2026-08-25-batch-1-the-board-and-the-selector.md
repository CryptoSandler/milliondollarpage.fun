# Batch 1 — The Board and the Selector Implementation Plan

> **HISTORICAL. This plan was executed, and the product has since moved past it.**
> It is the record of what was planned and built in that batch, kept unrewritten
> because a plan edited after the fact is no longer evidence of anything.
>
> **What in it is now false:** the board is 1250×800 rather than 1000×1000; there is no block grid, no `BLOCK_PIXELS` and no minimum purchase, so `snapRect`, `presetRect` and `rectIsValid` no longer work the way the code in here does; the three counters have become the offer line plus a count of the pixels remaining; and the seeded board was retired rather than reworded.
>
> The current design is `DESIGN.md`; what a buyer is sold and what is still
> undecided is `SECURITY.md`. The spec this plan cites carries its own banner
> saying the same thing.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A board you can open in a local browser: a 1000×1000 grid with seeded blocks on it, a selector you can click or drag to pick a rectangle that snaps to the 10-pixel grid, a red overlay when that rectangle hits something already sold, a live "N pixels · $X" total, and the three counters. No wallet, no payment, no mint, no image upload.

**Architecture:** Next.js App Router over Postgres, no ORM. The board's occupancy is a set of rectangles in one `blocks` table, and non-overlap is a Postgres exclusion constraint over two `int4range` columns rather than anything the application checks. Every piece of geometry — snapping, intersection, zoom, pan, screen-to-board — lives in pure modules with unit tests; React is a thin shell that renders their output to a `<canvas>`.

**Tech Stack:** Next 16.3.2, React 19.2.8, TypeScript, Tailwind v4, `pg`, vitest 4, tsx, Neon Postgres.

**Spec:** [`docs/superpowers/specs/2026-08-25-milliondollarpage-design.md`](../specs/2026-08-25-milliondollarpage-design.md)

## Global Constraints

- **Every string in the repo is English** — code, comments, commits, docs, UI copy. No Spanish anywhere.
- **The author is CryptoSandler, and nobody else.** This repo is public. No other name, handle, or personal detail belongs in a commit, a file, or a comment. `git config user.name` and `user.email` are already set in this repo; do not override them, and do not let a tool add a co-author or a machine username. Check with `git log --format='%an <%ae>'` before pushing.
- **Reuse `pixelwar` and `outbid-tokens`, do not rewrite them.** Modules marked "copy from pixelwar" are copied from `~/proyectos/pixelwar` and adapted, not reimplemented from memory. Where the two ancestors disagree on a shared utility, `pixelwar`'s version wins.
- **No code, copy, assets, or CSS is taken from `1millionpixels.xyz`, `thewallsolana.com`, or `milliondollarsolanapage.com`.** They are competitors and one of them is the same product. Ideas only. See [`docs/references.md`](../../references.md).
- **The board is 1000×1000. The block grid is 10 pixels. The minimum purchase is 10×10.** These are `BOARD_PIXELS`, `BLOCK_PIXELS`, and the `blocks_min_size` constraint, and they are never re-derived by hand anywhere else.
- **No ORM.** Parameterised `pg` queries only; never string-interpolate a value into SQL.
- **The database is Neon, and there is no local Postgres.** The project `milliondollarpage` and its two branches already exist: `production` is the app database (`DATABASE_URL`), `tests` is a disposable copy the suite truncates (`TEST_DATABASE_URL`). Both use `sslmode=verify-full`. Both live in `.env.local` and nowhere else — not in `.env.example`, not in a commit, not in a comment, not in a shell command whose output you paste anywhere. **Never print a connection string.** If you need to identify a database, name its branch.
- **Required env vars have no defaults.** A missing `DATABASE_URL` is a startup failure, not a fallback.
- **Prices are not environment variables.** They live in the `settings` table. The only default in this batch is `price_per_pixel_usdc = 1000000` (one dollar, in USDC base units), seeded by migration.
- **This is Next 16, not the Next in your training data.** Before writing any route handler or page, read the relevant guide under `node_modules/next/dist/docs/`. The `AGENTS.md` block Next writes into the repo stays committed.
- **TDD.** Test first, watch it fail, implement minimally, watch it pass, commit.
- **No money, no keys, no chain in this batch.** If a task tempts you toward `@solana/*`, `@metaplex-foundation/*`, `sharp`, or Irys, it is out of scope — those are batches 4 and 5.

---

## File Structure

```
migrations/000_bootstrap.sql      A table for the harness to assert on
migrations/001_board.sql          blocks + settings, constraints, seeded price
scripts/migrate.mts               Migration runner; --test targets TEST_DATABASE_URL
scripts/seed-board.mts            Demo blocks, development only

src/lib/db.ts                     Pool, query, transaction (copy from pixelwar)
src/lib/config.ts                 Env readers that throw rather than default (copy from pixelwar)
src/lib/http.ts                   json() and NO_STORE only; no caller identity yet

src/lib/board/geometry.ts         Board constants, Rect, snapping, intersection — pure
src/lib/board/pricing.ts          USDC base units and formatting — pure
src/lib/board/selection.ts        Drag state to a validated selection — pure
src/lib/board/blocks.ts           listLiveBlocks(), boardStats(), sweepExpiredReservations()
src/lib/board/settings.ts         pricePerPixelBaseUnits()

src/lib/canvas/viewport.ts        Zoom/pan maths, screen<->board (copy from pixelwar)

src/app/api/board/route.ts        Blocks + stats + price, one fetch

src/app/page.tsx                  The board page
src/components/BoardCanvas.tsx    Canvas element, pointer handling, rendering
src/components/BoardCounters.tsx  The three counters and the current price
src/components/SelectionPanel.tsx Presets, running total, the Buy button's disabled state
src/components/InteractionLegend.tsx  Pointer legend and touch legend
```

`board/` answers "what is on the board and what may be selected"; `canvas/`
answers "where on screen is it". They are separate directories because the
selector's rules have nothing to do with zoom maths, and both are worth testing
without the other.

Every module under `board/` and `canvas/` is pure except `blocks.ts` and
`settings.ts`, which are the only two that touch Postgres. That split is what
makes the geometry testable without a database round trip.

---

### Task 1: Scaffold, the test harness, and the migration runner

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `.env.example`, `vitest.config.mts`, `vitest.setup.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/lib/db.ts`, `src/lib/config.ts`, `scripts/migrate.mts`, `migrations/000_bootstrap.sql`
- Test: `src/lib/__tests__/db.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pool()`, `query<T>(text, params): Promise<T[]>`, `queryOne<T>`, `execute(text, params): Promise<number>`, `transaction<T>(work)`, `isUniqueViolation(e): boolean`, `violatedConstraint(e): string`, `closePool()` from `src/lib/db.ts`. `truncateAll()` and `sameTarget(a, b)` from `vitest.setup.ts`. Scripts `dev`, `build`, `lint`, `test`, `db:migrate`, `db:migrate:test`, `db:up`, `db:seed`.

- [ ] **Step 1: Scaffold the Next app**

Run `npx create-next-app@16.3.2 . --typescript --tailwind --eslint --app --src-dir --no-import-alias`, answering no to Turbopack prompts if asked. Then add the dev dependencies this batch needs:

```bash
npm install pg
npm install -D @types/pg vitest tsx dotenv
```

Confirm `package.json` pins `next` at `16.3.2` and `react` at `19.2.8`.

- [ ] **Step 2: Copy `db.ts` and `config.ts` from pixelwar**

Copy `~/proyectos/pixelwar/src/lib/db.ts` verbatim, changing only the header comment so it describes this product: the guarantee it exists to protect here is that no two blocks ever occupy the same pixel, and that promise is a Postgres constraint rather than application logic.

Copy `~/proyectos/pixelwar/src/lib/config.ts` and delete every reader except the `required()` helper — this batch has no salt, no cookie secret, and no proxy configuration. Leave `required()` exported so later batches add to it.

- [ ] **Step 3: Write the migration runner and the bootstrap migration**

Copy `~/proyectos/pixelwar/scripts/migrate.mts` verbatim. Create `migrations/000_bootstrap.sql`:

```sql
-- Nothing structural yet; 001 carries the schema. This file exists so the
-- runner has a migration to apply and the harness has something to assert on.
CREATE TABLE IF NOT EXISTS bootstrap_check (
  ok BOOLEAN NOT NULL DEFAULT TRUE
);
```

Add to `package.json`:

```json
"db:migrate": "tsx scripts/migrate.mts",
"db:migrate:test": "tsx scripts/migrate.mts --test",
"db:up": "npm run db:migrate && npm run db:migrate:test",
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Copy the test harness from pixelwar**

Copy `~/proyectos/pixelwar/vitest.config.mts` and `~/proyectos/pixelwar/vitest.setup.ts` verbatim. Both are already correct for this project: one fork so tests that truncate shared tables cannot delete each other's fixtures mid-assertion, and a `sameTarget()` guard that refuses to run when `TEST_DATABASE_URL` and `DATABASE_URL` address the same database.

- [ ] **Step 5: Write the failing harness test**

Create `src/lib/__tests__/db.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { execute, query } from "../db";
import { sameTarget } from "../../../vitest.setup";

describe("the test harness", () => {
  it("is pointed at a database that is not the app database", () => {
    expect(sameTarget(process.env.TEST_DATABASE_URL!, process.env.DATABASE_URL)).toBe(false);
  });

  it("reaches Postgres and sees the bootstrap migration", async () => {
    const rows = await query<{ ok: boolean }>("SELECT TRUE AS ok FROM bootstrap_check LIMIT 1");
    expect(rows).toEqual([]);
    await execute("INSERT INTO bootstrap_check (ok) VALUES (TRUE)");
    const after = await query<{ ok: boolean }>("SELECT ok FROM bootstrap_check");
    expect(after).toEqual([{ ok: true }]);
  });

  it("truncates between tests", async () => {
    const rows = await query("SELECT ok FROM bootstrap_check");
    expect(rows).toEqual([]);
  });
});
```

Note what the third test is for: it passes only because `beforeEach(truncateAll)` ran after the second test inserted a row. If truncation ever breaks, this is the test that says so.

- [ ] **Step 6: Run the test to verify it fails**

```bash
npm test -- src/lib/__tests__/db.test.ts
```

Expected: FAIL. Either `TEST_DATABASE_URL is not set` (before you create `.env.local`), or `relation "bootstrap_check" does not exist` (before you migrate).

- [ ] **Step 7: Migrate — Neon is already provisioned**

**This is already done; do not redo it.** The Neon project `milliondollarpage` exists in the `CryptoSandler` org with two branches — `production` (the app database) and `tests`, branched from it. `.env.local` already holds both pooled connection strings with `sslmode=verify-full`, and `.gitignore` already ignores `.env*` while un-ignoring `.env.example`.

Three things you must NOT do:

1. **Do not print, echo, `cat`, or log either connection string**, and do not paste one into a commit, a comment, a test, or a report. Refer to them as `production` and `tests`.
2. **Do not let `create-next-app` overwrite `.gitignore`.** It writes its own. After scaffolding, confirm the env rules survived: `grep -n '^\.env\*$' .gitignore && grep -n '^!\.env\.example$' .gitignore`. If they are gone, restore them before running anything else, and check `git status` shows `.env.local` as ignored rather than untracked.
3. **Do not run `neon` CLI commands that write files** into the repo.

Write `.env.example` with the same two variable names, no values, and a comment on each saying what breaks without it.

Verify the guard is real before you migrate — this must print nothing:

```bash
git status --porcelain --ignored=no | grep -F '.env.local'
```

Then: `npm run db:up`

- [ ] **Step 8: Run the test to verify it passes**

```bash
npm test -- src/lib/__tests__/db.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Scaffold the app, the migration runner, and a harness that refuses production"
```

---

### Task 2: Board geometry

**Files:**
- Create: `src/lib/board/geometry.ts`
- Test: `src/lib/board/__tests__/geometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BOARD_PIXELS = 1000`, `BLOCK_PIXELS = 10`, `TOTAL_PIXELS = 1_000_000`, `type Point = { x: number; y: number }`, `type Rect = { x: number; y: number; w: number; h: number }`, `snapRect(a: Point, b: Point): Rect`, `presetRect(at: Point, size: number): Rect`, `rectPixels(r: Rect): number`, `rectsIntersect(a: Rect, b: Rect): boolean`, `rectIsValid(r: Rect): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/board/__tests__/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BLOCK_PIXELS,
  BOARD_PIXELS,
  TOTAL_PIXELS,
  presetRect,
  rectIsValid,
  rectPixels,
  rectsIntersect,
  snapRect,
} from "../geometry";

describe("board constants", () => {
  it("is a million pixels of ten-pixel blocks", () => {
    expect(BOARD_PIXELS).toBe(1000);
    expect(BLOCK_PIXELS).toBe(10);
    expect(TOTAL_PIXELS).toBe(1_000_000);
  });
});

describe("snapRect", () => {
  it("turns a single point into one 10x10 block", () => {
    expect(snapRect({ x: 3, y: 7 }, { x: 3, y: 7 })).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });

  it("snaps outward so a drag always covers every cell it touched", () => {
    expect(snapRect({ x: 9, y: 9 }, { x: 11, y: 11 })).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });

  it("does not care which corner the drag started from", () => {
    const forward = snapRect({ x: 100, y: 100 }, { x: 249, y: 349 });
    const backward = snapRect({ x: 249, y: 349 }, { x: 100, y: 100 });
    expect(forward).toEqual(backward);
    expect(forward).toEqual({ x: 100, y: 100, w: 150, h: 250 });
  });

  it("clamps a drag that leaves the board", () => {
    expect(snapRect({ x: 995, y: 995 }, { x: 5000, y: -40 })).toEqual({
      x: 990,
      y: 0,
      w: 10,
      h: 1000,
    });
  });
});

describe("presetRect", () => {
  it("anchors the preset at the block under the pointer", () => {
    expect(presetRect({ x: 34, y: 56 }, 100)).toEqual({ x: 30, y: 50, w: 100, h: 100 });
  });

  it("slides a preset back onto the board rather than cropping it", () => {
    expect(presetRect({ x: 980, y: 980 }, 100)).toEqual({ x: 900, y: 900, w: 100, h: 100 });
  });
});

describe("rectPixels", () => {
  it("counts pixels, not blocks", () => {
    expect(rectPixels({ x: 0, y: 0, w: 20, h: 20 })).toBe(400);
  });
});

describe("rectsIntersect", () => {
  const base = { x: 100, y: 100, w: 100, h: 100 };

  it("is false for rectangles that only share an edge", () => {
    // This is the case a Postgres `box` column gets wrong, which is why the
    // schema uses two int4ranges. The rule has to be the same on both sides.
    expect(rectsIntersect(base, { x: 200, y: 100, w: 100, h: 100 })).toBe(false);
    expect(rectsIntersect(base, { x: 100, y: 200, w: 100, h: 100 })).toBe(false);
  });

  it("is false for rectangles that only share a corner", () => {
    expect(rectsIntersect(base, { x: 200, y: 200, w: 100, h: 100 })).toBe(false);
  });

  it("is true for a one-block overlap", () => {
    expect(rectsIntersect(base, { x: 190, y: 190, w: 100, h: 100 })).toBe(true);
  });

  it("is true when one rectangle contains the other", () => {
    expect(rectsIntersect(base, { x: 120, y: 120, w: 10, h: 10 })).toBe(true);
  });

  it("is symmetric", () => {
    const other = { x: 150, y: 150, w: 100, h: 100 };
    expect(rectsIntersect(base, other)).toBe(rectsIntersect(other, base));
  });
});

describe("rectIsValid", () => {
  it("accepts the minimum block", () => {
    expect(rectIsValid({ x: 0, y: 0, w: 10, h: 10 })).toBe(true);
  });

  it("rejects anything smaller than a block", () => {
    expect(rectIsValid({ x: 0, y: 0, w: 10, h: 0 })).toBe(false);
    expect(rectIsValid({ x: 0, y: 0, w: 5, h: 10 })).toBe(false);
  });

  it("rejects anything off the grid", () => {
    expect(rectIsValid({ x: 5, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it("rejects anything that leaves the board", () => {
    expect(rectIsValid({ x: 990, y: 0, w: 20, h: 10 })).toBe(false);
    expect(rectIsValid({ x: -10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/board/__tests__/geometry.test.ts
```

Expected: FAIL, "Failed to resolve import ../geometry".

- [ ] **Step 3: Write the implementation**

Create `src/lib/board/geometry.ts`:

```ts
/**
 * The board's shape, and every rule about what counts as a rectangle on it.
 *
 * Pure on purpose. Snapping and intersection are the two places where an
 * off-by-one is invisible in the browser and expensive in the database, so
 * they are unit tested rather than eyeballed against a canvas.
 *
 * One rule matters more than the rest: rectangles are HALF-OPEN. A block at
 * x=0 with w=10 covers pixels 0..9 and does not touch pixel 10. Postgres
 * enforces the same thing with int4range, and the two definitions must never
 * drift apart — if they do, the browser and the database disagree about
 * whether two neighbouring blocks collide.
 */

export const BOARD_PIXELS = 1000;
export const BLOCK_PIXELS = 10;
export const TOTAL_PIXELS = BOARD_PIXELS * BOARD_PIXELS;

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

function clampToBoard(value: number): number {
  return Math.min(BOARD_PIXELS - 1, Math.max(0, Math.floor(value)));
}

function blockStart(pixel: number): number {
  return Math.floor(pixel / BLOCK_PIXELS) * BLOCK_PIXELS;
}

/**
 * The smallest grid-aligned rectangle covering both points.
 *
 * Snaps OUTWARD: a drag that clips one pixel of a block selects the whole
 * block. Anything else would let a buyer pay for a rectangle that does not
 * contain what they dragged over.
 */
export function snapRect(a: Point, b: Point): Rect {
  const ax = clampToBoard(a.x);
  const ay = clampToBoard(a.y);
  const bx = clampToBoard(b.x);
  const by = clampToBoard(b.y);

  const x = blockStart(Math.min(ax, bx));
  const y = blockStart(Math.min(ay, by));
  const right = blockStart(Math.max(ax, bx)) + BLOCK_PIXELS;
  const bottom = blockStart(Math.max(ay, by)) + BLOCK_PIXELS;

  return { x, y, w: right - x, h: bottom - y };
}

/**
 * A fixed-size preset anchored at the block under the pointer.
 *
 * Near an edge the preset SLIDES back onto the board rather than shrinking:
 * a 100×100 preset always buys 10,000 pixels, or the buyer would silently pay
 * for a different rectangle than the one the button named.
 */
export function presetRect(at: Point, size: number): Rect {
  const maxStart = BOARD_PIXELS - size;
  const x = Math.min(maxStart, blockStart(clampToBoard(at.x)));
  const y = Math.min(maxStart, blockStart(clampToBoard(at.y)));
  return { x: Math.max(0, x), y: Math.max(0, y), w: size, h: size };
}

export function rectPixels(rect: Rect): number {
  return rect.w * rect.h;
}

/** Half-open intersection: sharing an edge or a corner is not overlapping. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectIsValid(rect: Rect): boolean {
  const { x, y, w, h } = rect;
  if (w < BLOCK_PIXELS || h < BLOCK_PIXELS) return false;
  if (x % BLOCK_PIXELS !== 0 || y % BLOCK_PIXELS !== 0) return false;
  if (w % BLOCK_PIXELS !== 0 || h % BLOCK_PIXELS !== 0) return false;
  if (x < 0 || y < 0) return false;
  return x + w <= BOARD_PIXELS && y + h <= BOARD_PIXELS;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/lib/board/__tests__/geometry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/board/geometry.ts src/lib/board/__tests__/geometry.test.ts
git commit -m "Define the board's geometry, half-open on both sides of the wire"
```

---

### Task 3: The schema, and the constraint that makes double-selling impossible

**Files:**
- Create: `migrations/001_board.sql`
- Test: `src/lib/board/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: `query`, `execute` from `src/lib/db.ts`.
- Produces: tables `blocks` and `settings`. `blocks` columns: `id uuid`, `x`, `y`, `w`, `h` integers, `x_range`/`y_range` generated `int4range`, `status text`, `caption text`, `link text`, `image_fit text`, `buyer_pubkey text`, `price_per_pixel_usdc bigint`, `total_usdc bigint`, `expires_at timestamptz`, `created_at timestamptz`, `minted_at timestamptz`, `removed_reason text`. Constraint names `blocks_no_overlap`, `blocks_on_grid`, `blocks_min_size`, `blocks_in_bounds`, `blocks_caption_length`, `blocks_status_known`.

**Note for the implementer:** every statement in this migration was executed against Postgres 16 before this plan was written. The behaviours the test asserts are observed, not assumed — including that a `box` column would have got the adjacency case wrong, which is why there is no `box` column.

- [ ] **Step 1: Write the failing test**

Create `src/lib/board/__tests__/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { execute, query } from "../../db";

type Inserted = { x: number; y: number; w: number; h: number; x_range: string; y_range: string };

async function insertBlock(
  x: number,
  y: number,
  w: number,
  h: number,
  status = "minted",
): Promise<void> {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc)
     VALUES ($1, $2, $3, $4, $5, 1000000, $6)`,
    [x, y, w, h, status, w * h * 1000000],
  );
}

async function errorCodeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error) {
    return (error as { code?: string }).code ?? "no code";
  }
  return "no error";
}

describe("the blocks table", () => {
  it("derives its ranges from x, y, w and h so they cannot drift", async () => {
    await insertBlock(0, 0, 10, 10);
    const rows = await query<Inserted>("SELECT x, y, w, h, x_range, y_range FROM blocks");
    expect(rows[0].x_range).toBe("[0,10)");
    expect(rows[0].y_range).toBe("[0,10)");
  });

  it("accepts blocks that share an edge", async () => {
    await insertBlock(0, 0, 10, 10);
    await insertBlock(10, 0, 10, 10);
    await insertBlock(0, 10, 10, 10);
    const rows = await query("SELECT id FROM blocks");
    expect(rows).toHaveLength(3);
  });

  it("refuses blocks that actually overlap", async () => {
    await insertBlock(0, 0, 20, 20);
    expect(await errorCodeOf(() => insertBlock(10, 10, 20, 20))).toBe("23P01");
  });

  it("refuses a reservation that overlaps a minted block", async () => {
    await insertBlock(0, 0, 20, 20, "minted");
    expect(await errorCodeOf(() => insertBlock(0, 0, 10, 10, "reserved"))).toBe("23P01");
  });

  it("frees a removed block's rectangle for someone else", async () => {
    await insertBlock(0, 0, 20, 20, "removed");
    await insertBlock(0, 0, 20, 20, "minted");
    const rows = await query("SELECT id FROM blocks WHERE status = 'minted'");
    expect(rows).toHaveLength(1);
  });

  it("refuses blocks that are off the grid", async () => {
    expect(await errorCodeOf(() => insertBlock(5, 0, 10, 10))).toBe("23514");
  });

  it("refuses blocks smaller than one block", async () => {
    // A zero-height row would also produce an EMPTY int4range, and an empty
    // range conflicts with nothing — so this check is what keeps the overlap
    // constraint meaningful, not merely what keeps the UI tidy.
    expect(await errorCodeOf(() => insertBlock(0, 0, 10, 0))).toBe("23514");
  });

  it("refuses blocks that leave the board", async () => {
    expect(await errorCodeOf(() => insertBlock(990, 0, 20, 10))).toBe("23514");
  });

  it("refuses a caption longer than 32 characters", async () => {
    const code = await errorCodeOf(() =>
      execute(
        `INSERT INTO blocks (x, y, w, h, status, caption, price_per_pixel_usdc, total_usdc)
         VALUES (0, 0, 10, 10, 'minted', $1, 1000000, 100000000)`,
        ["x".repeat(33)],
      ),
    );
    expect(code).toBe("23514");
  });

  it("refuses a status nobody defined", async () => {
    expect(await errorCodeOf(() => insertBlock(0, 0, 10, 10, "sold"))).toBe("23514");
  });
});

describe("the settings table", () => {
  it("ships one dollar per pixel, in USDC base units", async () => {
    const rows = await query<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'price_per_pixel_usdc'",
    );
    expect(rows[0].value).toBe("1000000");
  });
});
```

Note: the settings test reads a row that `truncateAll()` deletes between tests. Add `settings` to the harness's exclusion list in `vitest.setup.ts` in Step 3.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/board/__tests__/schema.test.ts
```

Expected: FAIL, `relation "blocks" does not exist`.

- [ ] **Step 3: Write the migration and keep settings out of the truncation**

Create `migrations/001_board.sql`:

```sql
-- The board.
--
-- Non-overlap is a database invariant, not application logic: the exclusion
-- constraint below is the only thing standing between us and selling the same
-- pixels twice, and it holds under concurrency without a lock we have to
-- remember to take.
--
-- Two int4range columns rather than one box column, deliberately. Postgres's
-- `box &&` reports two boxes that merely share an EDGE as overlapping, and on
-- a full board every block touches its neighbours — a box constraint would
-- have rejected the second block ever sold. int4range is half-open and exact.
-- The ranges are GENERATED from x/y/w/h so the two representations can never
-- disagree.

CREATE TABLE blocks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  x                     integer NOT NULL,
  y                     integer NOT NULL,
  w                     integer NOT NULL,
  h                     integer NOT NULL,
  x_range               int4range GENERATED ALWAYS AS (int4range(x, x + w)) STORED,
  y_range               int4range GENERATED ALWAYS AS (int4range(y, y + h)) STORED,

  status                text NOT NULL,
  buyer_pubkey          text,
  price_per_pixel_usdc  bigint NOT NULL,
  total_usdc            bigint NOT NULL,

  caption               text,
  link                  text,
  image_fit             text,

  expires_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  minted_at             timestamptz,
  removed_reason        text,

  CONSTRAINT blocks_status_known CHECK (status IN ('reserved', 'paid', 'minted', 'removed')),
  CONSTRAINT blocks_on_grid CHECK (x % 10 = 0 AND y % 10 = 0 AND w % 10 = 0 AND h % 10 = 0),
  CONSTRAINT blocks_min_size CHECK (w >= 10 AND h >= 10),
  CONSTRAINT blocks_in_bounds CHECK (x >= 0 AND y >= 0 AND x + w <= 1000 AND y + h <= 1000),
  CONSTRAINT blocks_caption_length CHECK (caption IS NULL OR char_length(caption) <= 32),
  CONSTRAINT blocks_image_fit_known CHECK (image_fit IS NULL OR image_fit IN ('contain', 'cover'))
);

-- 'removed' is absent on purpose: a moderated block's rectangle goes back on
-- sale, so it must stop conflicting with anything.
ALTER TABLE blocks ADD CONSTRAINT blocks_no_overlap
  EXCLUDE USING gist (x_range WITH &&, y_range WITH &&)
  WHERE (status IN ('reserved', 'paid', 'minted'));

-- Reservations are swept by expiry; a paid order has expires_at nulled and is
-- therefore invisible to this index, which is the point.
CREATE INDEX blocks_live_reservations ON blocks (expires_at)
  WHERE status = 'reserved';

CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- The one default this batch is allowed: one dollar per pixel, in USDC base
-- units. Every other price arrives with the admin console.
INSERT INTO settings (key, value) VALUES ('price_per_pixel_usdc', '1000000');
```

Then edit `vitest.setup.ts` so `truncateAll()` leaves seeded reference data alone. Change the query to:

```ts
  const tables = await query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN ('schema_migrations', 'settings')`,
  );
```

and update the doc comment above it to say that `settings` is excluded because it holds migration-seeded defaults, not test fixtures — a test that needs a different price writes one and puts it back.

- [ ] **Step 4: Apply the migration and run the test**

```bash
npm run db:up
npm test -- src/lib/board/__tests__/schema.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add migrations/001_board.sql src/lib/board/__tests__/schema.test.ts vitest.setup.ts
git commit -m "Make selling the same pixels twice a database error"
```

---

### Task 4: Reading the board

**Files:**
- Create: `src/lib/board/blocks.ts`, `src/lib/board/settings.ts`
- Test: `src/lib/board/__tests__/blocks.test.ts`

**Interfaces:**
- Consumes: `query`, `execute` from `src/lib/db.ts`; `Rect`, `TOTAL_PIXELS` from `src/lib/board/geometry.ts`.
- Produces:
  - `type LiveBlock = { id: string; x: number; y: number; w: number; h: number; status: "reserved" | "paid" | "minted"; caption: string | null; link: string | null }`
  - `listLiveBlocks(): Promise<LiveBlock[]>`
  - `type BoardStats = { pixelsSold: number; blocksSold: number; percentSold: number }`
  - `boardStats(): Promise<BoardStats>`
  - `sweepExpiredReservations(): Promise<number>`
  - `pricePerPixelBaseUnits(): Promise<number>` from `settings.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/board/__tests__/blocks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { execute } from "../../db";
import { boardStats, listLiveBlocks, sweepExpiredReservations } from "../blocks";
import { pricePerPixelBaseUnits } from "../settings";

async function insert(
  x: number,
  y: number,
  w: number,
  h: number,
  status: string,
  expiresAt: string | null = null,
): Promise<void> {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc)
     VALUES ($1, $2, $3, $4, $5, $6, 1000000, $7)`,
    [x, y, w, h, status, expiresAt, w * h * 1000000],
  );
}

describe("listLiveBlocks", () => {
  it("returns nothing for an empty board", async () => {
    expect(await listLiveBlocks()).toEqual([]);
  });

  it("includes reserved, paid and minted blocks, because all three hold pixels", async () => {
    await insert(0, 0, 10, 10, "reserved", "2999-01-01T00:00:00Z");
    await insert(10, 0, 10, 10, "paid");
    await insert(20, 0, 10, 10, "minted");
    const blocks = await listLiveBlocks();
    expect(blocks.map((b) => b.status).sort()).toEqual(["minted", "paid", "reserved"]);
  });

  it("excludes removed blocks, whose pixels are for sale again", async () => {
    await insert(0, 0, 10, 10, "removed");
    expect(await listLiveBlocks()).toEqual([]);
  });

  it("excludes reservations that have already expired", async () => {
    await insert(0, 0, 10, 10, "reserved", "2000-01-01T00:00:00Z");
    expect(await listLiveBlocks()).toEqual([]);
  });

  it("returns coordinates a canvas can draw without further arithmetic", async () => {
    await insert(120, 340, 50, 20, "minted");
    const [block] = await listLiveBlocks();
    expect(block).toMatchObject({ x: 120, y: 340, w: 50, h: 20 });
  });
});

describe("boardStats", () => {
  it("reports an empty board honestly", async () => {
    expect(await boardStats()).toEqual({ pixelsSold: 0, blocksSold: 0, percentSold: 0 });
  });

  it("counts paid and minted pixels, but not reservations", async () => {
    await insert(0, 0, 100, 100, "minted");
    await insert(100, 0, 100, 100, "paid");
    await insert(200, 0, 100, 100, "reserved", "2999-01-01T00:00:00Z");
    const stats = await boardStats();
    expect(stats.pixelsSold).toBe(20_000);
    expect(stats.blocksSold).toBe(2);
    expect(stats.percentSold).toBeCloseTo(2, 10);
  });

  it("keeps enough precision for the four-decimal counter", async () => {
    await insert(0, 0, 10, 10, "minted");
    expect((await boardStats()).percentSold).toBeCloseTo(0.01, 10);
  });
});

describe("sweepExpiredReservations", () => {
  it("deletes expired reservations and reports how many", async () => {
    await insert(0, 0, 10, 10, "reserved", "2000-01-01T00:00:00Z");
    expect(await sweepExpiredReservations()).toBe(1);
    expect(await listLiveBlocks()).toEqual([]);
  });

  it("never touches a live reservation", async () => {
    await insert(0, 0, 10, 10, "reserved", "2999-01-01T00:00:00Z");
    expect(await sweepExpiredReservations()).toBe(0);
  });

  it("never touches a paid order, whose expiry is null", async () => {
    await insert(0, 0, 10, 10, "paid", null);
    expect(await sweepExpiredReservations()).toBe(0);
  });

  it("frees the rectangle it swept", async () => {
    await insert(0, 0, 10, 10, "reserved", "2000-01-01T00:00:00Z");
    await sweepExpiredReservations();
    await insert(0, 0, 10, 10, "minted");
    expect(await listLiveBlocks()).toHaveLength(1);
  });
});

describe("pricePerPixelBaseUnits", () => {
  it("reads the seeded dollar", async () => {
    expect(await pricePerPixelBaseUnits()).toBe(1_000_000);
  });

  it("reads a changed price", async () => {
    await execute("UPDATE settings SET value = '2500000' WHERE key = 'price_per_pixel_usdc'");
    try {
      expect(await pricePerPixelBaseUnits()).toBe(2_500_000);
    } finally {
      await execute("UPDATE settings SET value = '1000000' WHERE key = 'price_per_pixel_usdc'");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/board/__tests__/blocks.test.ts
```

Expected: FAIL, "Failed to resolve import ../blocks".

- [ ] **Step 3: Write the implementation**

Create `src/lib/board/blocks.ts`:

```ts
import { execute, query } from "../db";
import { TOTAL_PIXELS } from "./geometry";

/**
 * Reading the board.
 *
 * "Live" means a rectangle somebody currently holds: reserved, paid, or
 * minted. Those are exactly the three states the overlap constraint covers,
 * and the selector must refuse the same rectangles the database would, or a
 * buyer gets to the end of a purchase before finding out.
 *
 * An expired reservation is not live even though it is still a row. Expiry is
 * a clock comparison rather than a status, so it is applied in every read
 * rather than depending on the sweep having run recently.
 */

export type LiveStatus = "reserved" | "paid" | "minted";

export type LiveBlock = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  status: LiveStatus;
  caption: string | null;
  link: string | null;
};

const LIVE = `status IN ('reserved', 'paid', 'minted')
              AND (status <> 'reserved' OR (expires_at IS NOT NULL AND expires_at > now()))`;

export async function listLiveBlocks(): Promise<LiveBlock[]> {
  return query<LiveBlock>(
    `SELECT id, x, y, w, h, status, caption, link
       FROM blocks
      WHERE ${LIVE}
      ORDER BY created_at`,
  );
}

export type BoardStats = { pixelsSold: number; blocksSold: number; percentSold: number };

/**
 * Sold means paid or minted. A reservation is not a sale — counting one would
 * make the headline number tick up and back down as reservations expire.
 */
export async function boardStats(): Promise<BoardStats> {
  const rows = await query<{ pixels: string; blocks: string }>(
    `SELECT COALESCE(SUM(w * h), 0)::text AS pixels, COUNT(*)::text AS blocks
       FROM blocks
      WHERE status IN ('paid', 'minted')`,
  );
  const pixelsSold = Number(rows[0]?.pixels ?? 0);
  return {
    pixelsSold,
    blocksSold: Number(rows[0]?.blocks ?? 0),
    percentSold: (pixelsSold / TOTAL_PIXELS) * 100,
  };
}

/**
 * Deletes reservations whose window has closed.
 *
 * Correctness does not depend on this running: every read already filters
 * expired reservations out, and the reservation path will call this inside its
 * own transaction before inserting. This exists so the table does not grow a
 * tail of dead rows.
 */
export async function sweepExpiredReservations(): Promise<number> {
  return execute(
    `DELETE FROM blocks
      WHERE status = 'reserved' AND (expires_at IS NULL OR expires_at <= now())`,
  );
}
```

Create `src/lib/board/settings.ts`:

```ts
import { queryOne } from "../db";

/**
 * Settings live in the database, not the environment, because the admin
 * console has to change them without a redeploy. There is no fallback here on
 * purpose: the price is seeded by migration 001, so a missing row means the
 * database is not the one we think it is, and guessing a dollar would sell
 * pixels at a price nobody set.
 */

export class SettingMissing extends Error {
  constructor(key: string) {
    super(`Setting "${key}" is not in the settings table. Migration 001 seeds it.`);
    this.name = "SettingMissing";
  }
}

async function setting(key: string): Promise<string> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", [key]);
  if (!row) throw new SettingMissing(key);
  return row.value;
}

/** USDC base units per pixel. USDC has six decimals, so 1_000_000 is one dollar. */
export async function pricePerPixelBaseUnits(): Promise<number> {
  return Number(await setting("price_per_pixel_usdc"));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/lib/board/__tests__/blocks.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/board/blocks.ts src/lib/board/settings.ts src/lib/board/__tests__/blocks.test.ts
git commit -m "Read the board, and agree with the constraint about what holds pixels"
```

---

### Task 5: Pricing

**Files:**
- Create: `src/lib/board/pricing.ts`
- Test: `src/lib/board/__tests__/pricing.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `USDC_DECIMALS = 6`, `totalBaseUnits(pixels: number, perPixel: number): number`, `formatUsdc(baseUnits: number): string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/board/__tests__/pricing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatUsdc, totalBaseUnits, USDC_DECIMALS } from "../pricing";

describe("totalBaseUnits", () => {
  it("multiplies in base units, never in dollars", () => {
    expect(USDC_DECIMALS).toBe(6);
    expect(totalBaseUnits(100, 1_000_000)).toBe(100_000_000);
  });

  it("costs nothing for nothing", () => {
    expect(totalBaseUnits(0, 1_000_000)).toBe(0);
  });

  it("handles a price that is not a whole dollar", () => {
    expect(totalBaseUnits(400, 2_500_000)).toBe(1_000_000_000);
  });
});

describe("formatUsdc", () => {
  it("drops the decimals on a whole number of dollars", () => {
    expect(formatUsdc(100_000_000)).toBe("$100");
  });

  it("groups thousands", () => {
    expect(formatUsdc(10_000_000_000)).toBe("$10,000");
  });

  it("shows cents when there are any", () => {
    expect(formatUsdc(1_250_000)).toBe("$1.25");
  });

  it("does not round a fraction of a cent away silently", () => {
    expect(formatUsdc(1_234_567)).toBe("$1.234567");
  });

  it("formats zero", () => {
    expect(formatUsdc(0)).toBe("$0");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/board/__tests__/pricing.test.ts
```

Expected: FAIL, "Failed to resolve import ../pricing".

- [ ] **Step 3: Write the implementation**

Create `src/lib/board/pricing.ts`:

```ts
/**
 * Money, in integer base units, always.
 *
 * A price of $1 is 1_000_000, not 1. Nothing here converts to a float and
 * back: 0.1 + 0.2 is a famous joke everywhere except in a checkout, and the
 * number the buyer is asked to send has to be the number we compute.
 */

export const USDC_DECIMALS = 6;

export function totalBaseUnits(pixels: number, perPixel: number): number {
  return pixels * perPixel;
}

/**
 * Base units as display text.
 *
 * Whole dollars lose the decimals, because "$100.00" beside "$10,000.00" is
 * noise on a board where most prices are round. A fraction of a cent is shown
 * in full rather than rounded: if a price ever has one, hiding it would make
 * the displayed total disagree with the amount actually charged.
 */
export function formatUsdc(baseUnits: number): string {
  const dollars = Math.floor(baseUnits / 10 ** USDC_DECIMALS);
  const fraction = baseUnits % 10 ** USDC_DECIMALS;
  const grouped = dollars.toLocaleString("en-US");

  if (fraction === 0) return `$${grouped}`;

  const digits = fraction.toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  const padded = digits.length < 2 ? digits.padEnd(2, "0") : digits;
  return `$${grouped}.${padded}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/lib/board/__tests__/pricing.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/board/pricing.ts src/lib/board/__tests__/pricing.test.ts
git commit -m "Price a rectangle without ever touching a float"
```

---

### Task 6: The selection model

**Files:**
- Create: `src/lib/board/selection.ts`
- Test: `src/lib/board/__tests__/selection.test.ts`

**Interfaces:**
- Consumes: `Point`, `Rect`, `snapRect`, `presetRect`, `rectIsValid`, `rectsIntersect`, `rectPixels` from `./geometry`; `LiveBlock` from `./blocks`; `totalBaseUnits` from `./pricing`.
- Produces:
  - `PRESETS: readonly { size: number; label: string }[]`
  - `type Selection = { rect: Rect; pixels: number; totalBaseUnits: number; collidesWith: string[]; buyable: boolean }`
  - `describeSelection(rect: Rect, blocks: LiveBlock[], perPixel: number): Selection`
  - `selectionFromDrag(from: Point, to: Point, blocks: LiveBlock[], perPixel: number): Selection`
  - `selectionFromPreset(at: Point, size: number, blocks: LiveBlock[], perPixel: number): Selection`

- [ ] **Step 1: Write the failing test**

Create `src/lib/board/__tests__/selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LiveBlock } from "../blocks";
import {
  PRESETS,
  describeSelection,
  selectionFromDrag,
  selectionFromPreset,
} from "../selection";

const DOLLAR = 1_000_000;

function sold(x: number, y: number, w: number, h: number, id = "sold-1"): LiveBlock {
  return { id, x, y, w, h, status: "minted", caption: null, link: null };
}

describe("PRESETS", () => {
  it("offers the four sizes the home page advertises", () => {
    expect(PRESETS.map((p) => p.size)).toEqual([10, 20, 50, 100]);
  });

  it("labels each one by its dimensions", () => {
    expect(PRESETS.map((p) => p.label)).toEqual(["10×10", "20×20", "50×50", "100×100"]);
  });
});

describe("describeSelection", () => {
  it("prices an empty rectangle and calls it buyable", () => {
    const selection = describeSelection({ x: 0, y: 0, w: 20, h: 20 }, [], DOLLAR);
    expect(selection.pixels).toBe(400);
    expect(selection.totalBaseUnits).toBe(400_000_000);
    expect(selection.collidesWith).toEqual([]);
    expect(selection.buyable).toBe(true);
  });

  it("names every block the selection overlaps, so the canvas can mask them", () => {
    const blocks = [sold(0, 0, 10, 10, "a"), sold(10, 0, 10, 10, "b"), sold(500, 500, 10, 10, "c")];
    const selection = describeSelection({ x: 0, y: 0, w: 20, h: 20 }, blocks, DOLLAR);
    expect(selection.collidesWith.sort()).toEqual(["a", "b"]);
    expect(selection.buyable).toBe(false);
  });

  it("does not collide with a block it merely touches", () => {
    const selection = describeSelection({ x: 0, y: 0, w: 10, h: 10 }, [sold(10, 0, 10, 10)], DOLLAR);
    expect(selection.collidesWith).toEqual([]);
    expect(selection.buyable).toBe(true);
  });

  it("is unbuyable when the rectangle itself is invalid, collision or not", () => {
    expect(describeSelection({ x: 5, y: 0, w: 10, h: 10 }, [], DOLLAR).buyable).toBe(false);
    expect(describeSelection({ x: 0, y: 0, w: 0, h: 10 }, [], DOLLAR).buyable).toBe(false);
  });

  it("still reports the price of an unbuyable selection, so the panel can show it", () => {
    const selection = describeSelection({ x: 0, y: 0, w: 20, h: 20 }, [sold(0, 0, 10, 10)], DOLLAR);
    expect(selection.totalBaseUnits).toBe(400_000_000);
    expect(selection.buyable).toBe(false);
  });

  it("uses the price it is given rather than assuming a dollar", () => {
    const selection = describeSelection({ x: 0, y: 0, w: 10, h: 10 }, [], 2_500_000);
    expect(selection.totalBaseUnits).toBe(250_000_000);
  });
});

describe("selectionFromDrag", () => {
  it("snaps the drag before doing anything else", () => {
    const selection = selectionFromDrag({ x: 3, y: 3 }, { x: 11, y: 11 }, [], DOLLAR);
    expect(selection.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    expect(selection.pixels).toBe(400);
  });

  it("finds collisions against the snapped rectangle, not the raw drag", () => {
    // The drag never enters the sold block, but the snapped rectangle does.
    const selection = selectionFromDrag({ x: 0, y: 0 }, { x: 5, y: 5 }, [sold(0, 0, 10, 10)], DOLLAR);
    expect(selection.buyable).toBe(false);
  });
});

describe("selectionFromPreset", () => {
  it("places the preset under the pointer", () => {
    const selection = selectionFromPreset({ x: 34, y: 56 }, 100, [], DOLLAR);
    expect(selection.rect).toEqual({ x: 30, y: 50, w: 100, h: 100 });
  });

  it("keeps a preset whole near the edge", () => {
    const selection = selectionFromPreset({ x: 995, y: 995 }, 100, [], DOLLAR);
    expect(selection.rect).toEqual({ x: 900, y: 900, w: 100, h: 100 });
    expect(selection.pixels).toBe(10_000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/board/__tests__/selection.test.ts
```

Expected: FAIL, "Failed to resolve import ../selection".

- [ ] **Step 3: Write the implementation**

Create `src/lib/board/selection.ts`:

```ts
import type { LiveBlock } from "./blocks";
import {
  type Point,
  type Rect,
  presetRect,
  rectIsValid,
  rectPixels,
  rectsIntersect,
  snapRect,
} from "./geometry";
import { totalBaseUnits } from "./pricing";

/**
 * What the buyer has currently selected, and whether it can be bought.
 *
 * Pure, and it returns the IDs of the blocks it collides with rather than a
 * boolean, because the canvas paints those blocks red. "Why can't I select
 * here" is answered by the drawing, not by an error message — see
 * docs/references.md, where the same idea is taken from a competitor's
 * selector.
 *
 * `buyable` folds together two different refusals: the rectangle is malformed,
 * or the rectangle is taken. The panel does not care which; the canvas does.
 */

export const PRESETS = [
  { size: 10, label: "10×10" },
  { size: 20, label: "20×20" },
  { size: 50, label: "50×50" },
  { size: 100, label: "100×100" },
] as const;

export type Selection = {
  rect: Rect;
  pixels: number;
  totalBaseUnits: number;
  collidesWith: string[];
  buyable: boolean;
};

export function describeSelection(rect: Rect, blocks: LiveBlock[], perPixel: number): Selection {
  const collidesWith = blocks.filter((block) => rectsIntersect(rect, block)).map((block) => block.id);
  const pixels = rectPixels(rect);

  return {
    rect,
    pixels,
    totalBaseUnits: totalBaseUnits(pixels, perPixel),
    collidesWith,
    buyable: rectIsValid(rect) && collidesWith.length === 0,
  };
}

export function selectionFromDrag(
  from: Point,
  to: Point,
  blocks: LiveBlock[],
  perPixel: number,
): Selection {
  return describeSelection(snapRect(from, to), blocks, perPixel);
}

export function selectionFromPreset(
  at: Point,
  size: number,
  blocks: LiveBlock[],
  perPixel: number,
): Selection {
  return describeSelection(presetRect(at, size), blocks, perPixel);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/lib/board/__tests__/selection.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/board/selection.ts src/lib/board/__tests__/selection.test.ts
git commit -m "Decide what is selected, and which blocks turn red"
```

---

### Task 7: Viewport maths

**Files:**
- Create: `src/lib/canvas/viewport.ts`
- Test: `src/lib/canvas/__tests__/viewport.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Size`, `type Viewport = { centreX: number; centreY: number; scale: number }`, `TAP_SLOP_PX`, `isTap(totalMovement)`, `boardToScreen(v, screen, board)`, `screenToBoard(v, screen, point)`, `zoomAt(v, screen, point, factor, limits)`, `panBy(v, dxBoard, dyBoard)`, `clampToBoard(v, board)`.

- [ ] **Step 1: Copy the module from pixelwar**

Copy `~/proyectos/pixelwar/src/lib/canvas/viewport.ts` verbatim, then make two changes:

1. Delete `pixelAt`. This board selects rectangles of blocks, not single pixels, and `snapRect` in `geometry.ts` is what turns a pointer into a selection. Leaving a second, subtly different screen-to-board rounding path in the codebase is how the two drift.
2. Update the header comment to say what it is for here: a 1000×1000 board that has to be readable zoomed out to fit a laptop and zoomed in far enough to pick one 10-pixel block.

Copy `~/proyectos/pixelwar/src/lib/canvas/__tests__/viewport.test.ts` and delete the `pixelAt` tests. Keep every other test exactly as it is — the zoom-about-a-point invariant is the one that breaks silently.

- [ ] **Step 2: Run the test to verify it passes**

```bash
npm test -- src/lib/canvas/__tests__/viewport.test.ts
```

Expected: PASS. This task copies working, tested code, so the test passes immediately; the failing-first cycle does not apply to a verbatim copy.

- [ ] **Step 3: Add the test this board needs that pixelwar's did not**

Append to `src/lib/canvas/__tests__/viewport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { screenToBoard, zoomAt } from "../viewport";

describe("the whole board fits and a single block is reachable", () => {
  const screen = { width: 900, height: 900 };

  it("shows all 1000 pixels at a scale that fits a laptop", () => {
    const fitted = { centreX: 500, centreY: 500, scale: 900 / 1000 };
    const topLeft = screenToBoard(fitted, screen, { x: 0, y: 0 });
    const bottomRight = screenToBoard(fitted, screen, { x: 900, y: 900 });
    expect(topLeft).toEqual({ x: 0, y: 0 });
    expect(bottomRight).toEqual({ x: 1000, y: 1000 });
  });

  it("keeps the point under the cursor still while zooming in", () => {
    const before = { centreX: 500, centreY: 500, scale: 0.9 };
    const cursor = { x: 200, y: 700 };
    const under = screenToBoard(before, screen, cursor);
    const after = zoomAt(before, screen, cursor, 4, { min: 0.1, max: 40 });
    expect(screenToBoard(after, screen, cursor).x).toBeCloseTo(under.x, 9);
    expect(screenToBoard(after, screen, cursor).y).toBeCloseTo(under.y, 9);
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/lib/canvas/__tests__/viewport.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/
git commit -m "Bring pixelwar's viewport maths across, minus the single-pixel path"
```

---

### Task 8: The board endpoint

**Files:**
- Create: `src/lib/http.ts`, `src/app/api/board/route.ts`
- Test: `src/app/api/__tests__/board.test.ts`

**Interfaces:**
- Consumes: `listLiveBlocks`, `boardStats` from `src/lib/board/blocks.ts`; `pricePerPixelBaseUnits` from `src/lib/board/settings.ts`.
- Produces: `json(body, init)` and `NO_STORE` from `src/lib/http.ts`. `GET` from the route, returning `{ blocks: LiveBlock[], stats: BoardStats, pricePerPixelBaseUnits: number }`.

**Why one endpoint and not three:** the page needs all three on first paint, and three round trips from a cold Neon connection is three cold starts. Splitting them is a later problem, when the composite image gives the blocks their own cache lifetime.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/__tests__/board.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { execute } from "../../../lib/db";
import { GET } from "../board/route";

async function insert(x: number, y: number, w: number, h: number, status: string): Promise<void> {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, caption, link, price_per_pixel_usdc, total_usdc)
     VALUES ($1, $2, $3, $4, $5, 'A caption', 'https://example.com', 1000000, $6)`,
    [x, y, w, h, status, w * h * 1000000],
  );
}

describe("GET /api/board", () => {
  it("serves an empty board without failing", async () => {
    const body = await (await GET()).json();
    expect(body.blocks).toEqual([]);
    expect(body.stats).toEqual({ pixelsSold: 0, blocksSold: 0, percentSold: 0 });
    expect(body.pricePerPixelBaseUnits).toBe(1_000_000);
  });

  it("serves the blocks a canvas needs to draw, with their hover text", async () => {
    await insert(120, 340, 50, 20, "minted");
    const body = await (await GET()).json();
    expect(body.blocks).toHaveLength(1);
    expect(body.blocks[0]).toMatchObject({
      x: 120,
      y: 340,
      w: 50,
      h: 20,
      caption: "A caption",
      link: "https://example.com",
    });
  });

  it("counts sold pixels in the stats", async () => {
    await insert(0, 0, 100, 100, "minted");
    const body = await (await GET()).json();
    expect(body.stats.pixelsSold).toBe(10_000);
    expect(body.stats.percentSold).toBeCloseTo(1, 10);
  });

  it("is never cached, because a reservation changes the board within seconds", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/app/api/__tests__/board.test.ts
```

Expected: FAIL, "Failed to resolve import ../board/route".

- [ ] **Step 3: Write the implementation**

Create `src/lib/http.ts`:

```ts
/**
 * Response helpers.
 *
 * This is the trimmed version of pixelwar's http.ts: caller identity, IP
 * hashing and the painter cookie arrive with rate limiting in a later batch.
 * Only the two things this batch actually uses live here.
 */

export const NO_STORE = { "cache-control": "no-store" };

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}
```

Create `src/app/api/board/route.ts`:

```ts
import { boardStats, listLiveBlocks } from "../../../lib/board/blocks";
import { pricePerPixelBaseUnits } from "../../../lib/board/settings";
import { NO_STORE, json } from "../../../lib/http";

/**
 * Everything the board page needs on first paint, in one round trip.
 *
 * Never cached: a reservation appears and expires within half an hour, and a
 * stale board is a buyer dragging over pixels somebody already holds.
 */
export async function GET(): Promise<Response> {
  const [blocks, stats, price] = await Promise.all([
    listLiveBlocks(),
    boardStats(),
    pricePerPixelBaseUnits(),
  ]);

  return json({ blocks, stats, pricePerPixelBaseUnits: price }, { headers: NO_STORE });
}
```

Check the Next 16 route-handler guide in `node_modules/next/dist/docs/` before finalising the signature; if this version requires a `Request` parameter or a route segment config for dynamic rendering, follow the guide and adjust the test's call accordingly.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/app/api/__tests__/board.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/http.ts src/app/api/board/route.ts src/app/api/__tests__/board.test.ts
git commit -m "Serve the board, its counters and its price in one round trip"
```

---

### Task 9: The seed script

**Files:**
- Create: `scripts/seed-board.mts`
- Test: `src/lib/board/__tests__/seed.test.ts`
- Modify: `package.json` (add `db:seed`)

**Interfaces:**
- Consumes: `Rect` from `src/lib/board/geometry.ts`.
- Produces: `SEED_BLOCKS: readonly (Rect & { caption: string; link: string })[]` exported from `scripts/seed-board.mts` so the test can assert on it without running the script.

**Why this task exists:** an empty board cannot demonstrate a collision, and a collision is half of what this batch is supposed to make visible.

- [ ] **Step 1: Write the failing test**

Create `src/lib/board/__tests__/seed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SEED_BLOCKS } from "../../../../scripts/seed-board.mts";
import { rectIsValid, rectsIntersect } from "../geometry";

describe("the seed blocks", () => {
  it("gives the board enough to look at", () => {
    expect(SEED_BLOCKS.length).toBeGreaterThanOrEqual(6);
  });

  it("are all valid rectangles, so the migration's checks cannot reject them", () => {
    for (const block of SEED_BLOCKS) {
      expect(rectIsValid(block), `${block.caption} is not a valid rectangle`).toBe(true);
    }
  });

  it("do not overlap each other, so the exclusion constraint cannot reject them", () => {
    for (let i = 0; i < SEED_BLOCKS.length; i++) {
      for (let j = i + 1; j < SEED_BLOCKS.length; j++) {
        const a = SEED_BLOCKS[i];
        const b = SEED_BLOCKS[j];
        expect(rectsIntersect(a, b), `${a.caption} overlaps ${b.caption}`).toBe(false);
      }
    }
  });

  it("include at least one pair that shares an edge, which must be legal", () => {
    const touching = SEED_BLOCKS.some((a) =>
      SEED_BLOCKS.some((b) => a !== b && a.x + a.w === b.x && a.y === b.y && a.h === b.h),
    );
    expect(touching).toBe(true);
  });

  it("have captions within the 32-character limit", () => {
    for (const block of SEED_BLOCKS) {
      expect(block.caption.length).toBeLessThanOrEqual(32);
    }
  });

  it("link somewhere over https", () => {
    for (const block of SEED_BLOCKS) {
      expect(block.link.startsWith("https://")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/board/__tests__/seed.test.ts
```

Expected: FAIL, cannot resolve `scripts/seed-board.mts`.

- [ ] **Step 3: Write the seed script**

Create `scripts/seed-board.mts`:

```ts
import { config } from "dotenv";
import { Pool } from "pg";

/**
 * Demo blocks, for development only.
 *
 * These exist so a local board has something on it: without sold blocks there
 * is no collision to see, and the red overlay is half of what this batch is
 * for. The rectangles deliberately include a touching pair, because "two
 * blocks may share an edge" is the rule most likely to be broken by accident.
 *
 * SEED_BLOCKS is exported so the test suite can check the rectangles are legal
 * without connecting to a database or running this script.
 */

export const SEED_BLOCKS = [
  { x: 0, y: 0, w: 100, h: 100, caption: "Top left corner", link: "https://example.com/1" },
  { x: 100, y: 0, w: 100, h: 100, caption: "Right beside it", link: "https://example.com/2" },
  { x: 300, y: 120, w: 200, h: 50, caption: "A wide banner", link: "https://example.com/3" },
  { x: 640, y: 300, w: 60, h: 60, caption: "A small square", link: "https://example.com/4" },
  { x: 200, y: 400, w: 10, h: 10, caption: "The minimum block", link: "https://example.com/5" },
  { x: 800, y: 700, w: 200, h: 300, caption: "Bottom right", link: "https://example.com/6" },
  { x: 450, y: 600, w: 120, h: 120, caption: "Middle of nowhere", link: "https://example.com/7" },
] as const;

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
// database, because the test suite imports it for SEED_BLOCKS.
if (process.argv[1]?.endsWith("seed-board.mts")) await main();
```

Add to `package.json`: `"db:seed": "tsx scripts/seed-board.mts"`.

- [ ] **Step 4: Run the test to verify it passes, then seed**

```bash
npm test -- src/lib/board/__tests__/seed.test.ts
npm run db:seed
```

Expected: PASS, 6 tests. Then `seeded 7 block(s)`.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-board.mts src/lib/board/__tests__/seed.test.ts package.json
git commit -m "Seed a board worth looking at, including two blocks that touch"
```

---

### Task 10: The canvas

**Files:**
- Create: `src/components/BoardCanvas.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `LiveBlock` from `src/lib/board/blocks.ts`; `Selection`, `selectionFromDrag`, `selectionFromPreset` from `src/lib/board/selection.ts`; `BOARD_PIXELS`, `BLOCK_PIXELS` from `src/lib/board/geometry.ts`; the whole of `src/lib/canvas/viewport.ts`.
- Produces: `<BoardCanvas blocks activePreset perPixel onSelectionChange onHoverChange />` where `onSelectionChange: (selection: Selection | null) => void` and `onHoverChange: (block: LiveBlock | null) => void`.

**On testing:** this component has no unit test, and that is deliberate rather than an omission. Every decision it makes — what rectangle a drag produces, whether that rectangle collides, where a screen point lands on the board — already has a unit test in Tasks 2, 6 and 7. What is left is drawing calls and pointer plumbing, which a jsdom test would assert about a mock rather than about anything real. It is verified by running the app in Task 12, against a written checklist.

- [ ] **Step 1: Write the component**

Create `src/components/BoardCanvas.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveBlock } from "../lib/board/blocks";
import { BLOCK_PIXELS, BOARD_PIXELS, type Point } from "../lib/board/geometry";
import { type Selection, selectionFromDrag, selectionFromPreset } from "../lib/board/selection";
import {
  type Viewport,
  boardToScreen,
  clampToBoard,
  isTap,
  panBy,
  screenToBoard,
  zoomAt,
} from "../lib/canvas/viewport";

const ZOOM_LIMITS = { min: 0.2, max: 20 };
const GRID_VISIBLE_ABOVE = 4;

const COLOURS = {
  ground: "#12121a",
  gridLine: "#1f1f2b",
  sold: "#3a3a4d",
  soldEdge: "#4c4c63",
  selection: "#4ade80",
  collision: "#ef4444",
};

type Props = {
  blocks: LiveBlock[];
  activePreset: number | null;
  perPixel: number;
  onSelectionChange: (selection: Selection | null) => void;
  onHoverChange: (block: LiveBlock | null) => void;
};

type Drag =
  | { kind: "none" }
  | { kind: "select"; from: Point; to: Point; movement: number }
  | { kind: "pan"; last: Point; movement: number };

export default function BoardCanvas({
  blocks,
  activePreset,
  perPixel,
  onSelectionChange,
  onHoverChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<Viewport>({
    centreX: BOARD_PIXELS / 2,
    centreY: BOARD_PIXELS / 2,
    scale: 0.6,
  });
  const [selection, setSelection] = useState<Selection | null>(null);
  const drag = useRef<Drag>({ kind: "none" });

  const publish = useCallback(
    (next: Selection | null) => {
      setSelection(next);
      onSelectionChange(next);
    },
    [onSelectionChange],
  );

  // Draw. Everything here is a rectangle; nothing here decides anything.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const screen = { width, height };
    const origin = boardToScreen(viewport, screen, { x: 0, y: 0 });
    const scale = viewport.scale;

    context.fillStyle = COLOURS.ground;
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#0b0b12";
    context.fillRect(origin.x, origin.y, BOARD_PIXELS * scale, BOARD_PIXELS * scale);

    if (scale > GRID_VISIBLE_ABOVE / BLOCK_PIXELS) {
      context.strokeStyle = COLOURS.gridLine;
      context.lineWidth = 1;
      context.beginPath();
      for (let p = 0; p <= BOARD_PIXELS; p += BLOCK_PIXELS) {
        const sx = origin.x + p * scale;
        const sy = origin.y + p * scale;
        context.moveTo(sx, origin.y);
        context.lineTo(sx, origin.y + BOARD_PIXELS * scale);
        context.moveTo(origin.x, sy);
        context.lineTo(origin.x + BOARD_PIXELS * scale, sy);
      }
      context.stroke();
    }

    const colliding = new Set(selection?.collidesWith ?? []);
    for (const block of blocks) {
      const x = origin.x + block.x * scale;
      const y = origin.y + block.y * scale;
      context.fillStyle = colliding.has(block.id) ? COLOURS.collision : COLOURS.sold;
      context.fillRect(x, y, block.w * scale, block.h * scale);
      context.strokeStyle = COLOURS.soldEdge;
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, y + 0.5, block.w * scale - 1, block.h * scale - 1);
    }

    if (selection) {
      const { rect } = selection;
      const x = origin.x + rect.x * scale;
      const y = origin.y + rect.y * scale;
      context.strokeStyle = selection.buyable ? COLOURS.selection : COLOURS.collision;
      context.lineWidth = 2;
      context.strokeRect(x, y, rect.w * scale, rect.h * scale);
      context.fillStyle = selection.buyable ? "rgba(74,222,128,0.18)" : "rgba(239,68,68,0.18)";
      context.fillRect(x, y, rect.w * scale, rect.h * scale);
    }
  }, [blocks, selection, viewport]);

  function pointerBoard(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return screenToBoard(
      viewport,
      { width: rect.width, height: rect.height },
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
    );
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = pointerBoard(event);

    // Shift-drag pans, plain drag selects. The legend says so on screen.
    if (event.shiftKey || event.button === 1) {
      drag.current = { kind: "pan", last: { x: event.clientX, y: event.clientY }, movement: 0 };
      return;
    }

    if (activePreset !== null) {
      publish(selectionFromPreset(at, activePreset, blocks, perPixel));
      drag.current = { kind: "none" };
      return;
    }

    drag.current = { kind: "select", from: at, to: at, movement: 0 };
    publish(selectionFromDrag(at, at, blocks, perPixel));
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const at = pointerBoard(event);
    const current = drag.current;

    if (current.kind === "none") {
      const hovered = blocks.find(
        (b) => at.x >= b.x && at.x < b.x + b.w && at.y >= b.y && at.y < b.y + b.h,
      );
      onHoverChange(hovered ?? null);
      if (activePreset !== null) {
        publish(selectionFromPreset(at, activePreset, blocks, perPixel));
      }
      return;
    }

    if (current.kind === "pan") {
      const dx = event.clientX - current.last.x;
      const dy = event.clientY - current.last.y;
      drag.current = {
        kind: "pan",
        last: { x: event.clientX, y: event.clientY },
        movement: current.movement + Math.abs(dx) + Math.abs(dy),
      };
      setViewport((v) =>
        clampToBoard(panBy(v, -dx / v.scale, -dy / v.scale), {
          width: BOARD_PIXELS,
          height: BOARD_PIXELS,
        }),
      );
      return;
    }

    drag.current = {
      kind: "select",
      from: current.from,
      to: at,
      movement: current.movement + 1,
    };
    publish(selectionFromDrag(current.from, at, blocks, perPixel));
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const current = drag.current;
    drag.current = { kind: "none" };

    // A pan that barely moved was a tap on the canvas, not a drag; clear the
    // selection so tapping empty space deselects rather than doing nothing.
    if (current.kind === "pan" && isTap(current.movement)) publish(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    setViewport((v) =>
      zoomAt(v, { width: rect.width, height: rect.height }, point, factor, ZOOM_LIMITS),
    );
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") publish(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [publish]);

  return (
    <canvas
      ref={canvasRef}
      className="board-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => onHoverChange(null)}
      onWheel={onWheel}
    />
  );
}
```

Add to `src/app/globals.css`:

```css
.board-canvas {
  width: 100%;
  aspect-ratio: 1 / 1;
  max-height: 80vh;
  display: block;
  touch-action: none;
  cursor: crosshair;
  border-radius: 0.5rem;
}
```

`touch-action: none` is load-bearing: without it the browser scrolls the page instead of delivering the pointermove events a drag needs.

- [ ] **Step 2: Check it compiles and the suite still passes**

```bash
npx tsc --noEmit
npm run lint
npm test
```

Expected: no type errors, no lint errors, every test from Tasks 1–9 still passing.

- [ ] **Step 3: Commit**

```bash
git add src/components/BoardCanvas.tsx src/app/globals.css
git commit -m "Draw the board, the selection, and the blocks it would collide with"
```

---

### Task 11: The counters, the presets, and the legend

**Files:**
- Create: `src/components/BoardCounters.tsx`, `src/components/SelectionPanel.tsx`, `src/components/InteractionLegend.tsx`

**Interfaces:**
- Consumes: `BoardStats` from `src/lib/board/blocks.ts`; `Selection`, `PRESETS` from `src/lib/board/selection.ts`; `formatUsdc` from `src/lib/board/pricing.ts`; `TOTAL_PIXELS` from `src/lib/board/geometry.ts`.
- Produces: `<BoardCounters stats perPixel />`, `<SelectionPanel selection activePreset onPresetChange onClear />`, `<InteractionLegend />`.

- [ ] **Step 1: Write the three components**

Create `src/components/BoardCounters.tsx`:

```tsx
import { TOTAL_PIXELS } from "../lib/board/geometry";
import type { BoardStats } from "../lib/board/blocks";
import { formatUsdc } from "../lib/board/pricing";

/**
 * Three numbers, not one.
 *
 * Early on, "0.0300% complete" is a more motivating number than "300 sold",
 * and the block count says something neither of the others does: how many
 * separate people are on the board.
 */
export default function BoardCounters({
  stats,
  perPixel,
}: {
  stats: BoardStats;
  perPixel: number;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
      <p className="text-2xl font-semibold tabular-nums">
        {stats.pixelsSold.toLocaleString("en-US")}
        <span className="text-neutral-500"> / {TOTAL_PIXELS.toLocaleString("en-US")} pixels sold</span>
      </p>
      <p className="text-sm tabular-nums text-neutral-400">
        {stats.percentSold.toFixed(4)}% complete
      </p>
      <p className="text-sm tabular-nums text-neutral-400">
        {stats.blocksSold.toLocaleString("en-US")} blocks
      </p>
      <p className="text-sm tabular-nums text-neutral-400">
        Current price {formatUsdc(perPixel)} per pixel
      </p>
    </div>
  );
}
```

Create `src/components/SelectionPanel.tsx`:

```tsx
"use client";

import { PRESETS, type Selection } from "../lib/board/selection";
import { formatUsdc } from "../lib/board/pricing";

/**
 * The running total, and the presets beside it.
 *
 * The presets carry their own price so nobody has to do arithmetic to find out
 * what a 50×50 costs. The Buy button is disabled rather than hidden when the
 * selection collides: the canvas has already painted the offending blocks red,
 * and this only has to agree with it.
 */
export default function SelectionPanel({
  selection,
  perPixel,
  activePreset,
  onPresetChange,
  onClear,
}: {
  selection: Selection | null;
  perPixel: number;
  activePreset: number | null;
  onPresetChange: (size: number | null) => void;
  onClear: () => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.size}
            type="button"
            onClick={() => onPresetChange(activePreset === preset.size ? null : preset.size)}
            className={`rounded border px-3 py-2 text-sm ${
              activePreset === preset.size
                ? "border-emerald-400 bg-emerald-400/10"
                : "border-neutral-700 hover:border-neutral-500"
            }`}
          >
            <span className="font-medium">{preset.label}</span>
            <span className="ml-2 text-neutral-400 tabular-nums">
              {(preset.size * preset.size).toLocaleString("en-US")} px ·{" "}
              {formatUsdc(preset.size * preset.size * perPixel)}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            onPresetChange(null);
            onClear();
          }}
          className="rounded border border-neutral-700 px-3 py-2 text-sm hover:border-neutral-500"
        >
          Freehand
        </button>
      </div>

      {selection === null ? (
        <p className="text-sm text-neutral-400">
          Nothing selected. Click a block to start, or drag to outline a bigger one.
        </p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <p className="text-lg tabular-nums">
            {selection.rect.w} × {selection.rect.h} at ({selection.rect.x}, {selection.rect.y})
          </p>
          <p className="text-lg tabular-nums">
            {selection.pixels.toLocaleString("en-US")} pixels ·{" "}
            <span className="font-semibold">{formatUsdc(selection.totalBaseUnits)}</span>
          </p>
          {selection.collidesWith.length > 0 && (
            <p className="text-sm text-red-400">
              Part of this rectangle already belongs to someone. The blocks in red are not for sale.
            </p>
          )}
          <button
            type="button"
            disabled={!selection.buyable}
            className="rounded bg-emerald-500 px-4 py-2 font-medium text-black disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            Buy these pixels
          </button>
        </div>
      )}
    </section>
  );
}
```

The Buy button does nothing in this batch. It is here because its disabled state is one of the things this batch is meant to demonstrate; wiring it up is batch 3.

Create `src/components/InteractionLegend.tsx`:

```tsx
/**
 * How to drive the board, stated on the board.
 *
 * A drag-to-size selector is not discoverable, and neither is shift-to-pan.
 * Two legends rather than one: a pointer has modifiers and a wheel, a
 * touchscreen has neither.
 */
export default function InteractionLegend() {
  return (
    <div className="flex flex-col gap-1 text-xs text-neutral-500">
      <p className="hidden sm:block">
        scroll · zoom &nbsp;|&nbsp; shift-drag · pan &nbsp;|&nbsp; drag · select &nbsp;|&nbsp; click ·
        one block &nbsp;|&nbsp; esc · clear
      </p>
      <p className="sm:hidden">Pinch to zoom · drag to pan · tap to select a block</p>
    </div>
  );
}
```

- [ ] **Step 2: Check it compiles**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/BoardCounters.tsx src/components/SelectionPanel.tsx src/components/InteractionLegend.tsx
git commit -m "Show what is selected, what it costs, and how to drive the board"
```

---

### Task 12: Wire the page, and verify the batch by using it

**Files:**
- Modify: `src/app/page.tsx`, `src/app/layout.tsx`
- Create: `src/components/BoardView.tsx`

**Interfaces:**
- Consumes: everything from Tasks 8, 10 and 11.
- Produces: a working page at `/`.

- [ ] **Step 1: Write the client view that holds the shared state**

Create `src/components/BoardView.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { BoardStats, LiveBlock } from "../lib/board/blocks";
import type { Selection } from "../lib/board/selection";
import BoardCanvas from "./BoardCanvas";
import BoardCounters from "./BoardCounters";
import InteractionLegend from "./InteractionLegend";
import SelectionPanel from "./SelectionPanel";

type BoardPayload = {
  blocks: LiveBlock[];
  stats: BoardStats;
  pricePerPixelBaseUnits: number;
};

export default function BoardView({ initial }: { initial: BoardPayload }) {
  const [board] = useState(initial);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [hovered, setHovered] = useState<LiveBlock | null>(null);

  const clear = useCallback(() => setSelection(null), []);

  useEffect(() => {
    setSelection(null);
  }, [activePreset]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">milliondollarpage.fun</h1>
        <BoardCounters stats={board.stats} perPixel={board.pricePerPixelBaseUnits} />
      </header>

      <div className="relative">
        <BoardCanvas
          blocks={board.blocks}
          activePreset={activePreset}
          perPixel={board.pricePerPixelBaseUnits}
          onSelectionChange={setSelection}
          onHoverChange={setHovered}
        />
        {hovered && (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/80 px-3 py-2 text-sm">
            <p className="font-medium">{hovered.caption ?? "Untitled block"}</p>
            <p className="text-neutral-400">{hovered.link}</p>
          </div>
        )}
      </div>

      <InteractionLegend />

      <SelectionPanel
        selection={selection}
        perPixel={board.pricePerPixelBaseUnits}
        activePreset={activePreset}
        onPresetChange={setActivePreset}
        onClear={clear}
      />
    </main>
  );
}
```

- [ ] **Step 2: Wire the page**

Replace `src/app/page.tsx`:

```tsx
import BoardView from "../components/BoardView";
import { boardStats, listLiveBlocks } from "../lib/board/blocks";
import { pricePerPixelBaseUnits } from "../lib/board/settings";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [blocks, stats, perPixel] = await Promise.all([
    listLiveBlocks(),
    boardStats(),
    pricePerPixelBaseUnits(),
  ]);

  return <BoardView initial={{ blocks, stats, pricePerPixelBaseUnits: perPixel }} />;
}
```

The page reads the database directly rather than fetching its own API route — a server component calling `fetch` against itself is a round trip through the network stack for data it could have queried. `/api/board` exists for the client-side refresh that batch 3 adds.

Set the page title and a dark background in `src/app/layout.tsx`: title `milliondollarpage.fun`, description `One million pixels on one canvas. Buy a block, own it, sell it.`

- [ ] **Step 3: Run it**

```bash
npm run dev
```

Open `http://localhost:3000`.

- [ ] **Step 4: Verify the batch against this checklist**

Every line must be true before this batch is done. Anything that fails is a bug in Tasks 2–11, not something to note and move past.

- [ ] The board renders as a dark square with a visible 10-pixel grid when zoomed in.
- [ ] Seven grey blocks are visible, including two that sit flush against each other with no gap and no error.
- [ ] The counters read `108,100 / 1,000,000 pixels sold`, `10.8100% complete`, `7 blocks`, `Current price $1 per pixel`.
- [ ] Scrolling zooms, and whatever was under the cursor stays under the cursor.
- [ ] Shift-drag pans, and the board cannot be lost off-screen.
- [ ] Clicking empty space selects exactly one 10×10 block and the panel reads `10 × 10 at (x, y)`, `100 pixels · $100`.
- [ ] Dragging outlines a bigger rectangle that snaps outward to the grid as it moves.
- [ ] The running total updates continuously during the drag.
- [ ] Dragging across a seeded block turns that block **red** and the selection outline red.
- [ ] The Buy button is disabled whenever anything is red, and enabled otherwise.
- [ ] Pressing Escape clears the selection.
- [ ] Clicking a preset then moving the pointer slides a fixed-size square around the board.
- [ ] A preset near the right or bottom edge stays whole and slides back onto the board.
- [ ] Hovering a seeded block shows its caption and link.
- [ ] The legend is visible, and shows the touch variant when the window is narrow.

- [ ] **Step 5: Run the whole suite and commit**

```bash
npm test
npx tsc --noEmit
npm run lint
```

Expected: every test passing, no type errors, no lint errors.

```bash
git add -A
git commit -m "Wire the board page, and make batch 1 something you can use"
```

---

## What this batch deliberately does not do

Named here so a reviewer does not file them as gaps:

- **No composite PNG.** Blocks render as flat rectangles because no block has an image yet. The `sharp` compositing path in spec §4 arrives with the first real purchase, in batch 5.
- **No reservation.** The Buy button is inert. `blocks` can hold a `reserved` row and every read already handles it, but nothing creates one until batch 3.
- **No polling.** The board is fetched once, server-side. Live refresh arrives with reservations, when the board can actually change under a viewer.
- **No wallet, no payment, no mint, no upload, no admin, no reports.** Batches 4 through 8.
- **No rate limiting.** Nothing here writes, so there is nothing to limit. It arrives with `/api/reserve` in batch 3, copied from `outbid-tokens`.
