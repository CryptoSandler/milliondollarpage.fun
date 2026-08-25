# Batch 2 — Reservations and Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A buyer can pick a rectangle, hold it for 30 minutes, supply an image, link and caption that are validated before any money is asked for, see a final confirmation of everything that is about to become permanent, and watch the hold expire. No wallet, no USDC, no chain, no Arweave — the payment verifier is a stub that a human toggles.

**Architecture:** Everything hangs off one invariant: a rectangle is held by a row in `blocks`, and non-overlap is a Postgres exclusion constraint rather than anything the application checks. The reservation endpoint sweeps expired holds and inserts the new one **inside a single transaction**, so the sweep and the constraint see the same snapshot. Content is validated and held server-side before payment, so a rejected image never costs anyone money. The state machine is `reserved → paid`, and the moment an order is paid its expiry is nulled and it never expires again.

**Tech Stack:** Next 16.3.2, React 19.2.8, TypeScript, Tailwind v4, `pg`, `sharp` (image inspection only), vitest 4, tsx, Neon Postgres.

**Spec:** [`docs/superpowers/specs/2026-08-25-milliondollarpage-design.md`](../specs/2026-08-25-milliondollarpage-design.md)

**Predecessor:** [`docs/superpowers/plans/2026-08-25-batch-1-the-board-and-the-selector.md`](2026-08-25-batch-1-the-board-and-the-selector.md) — merged to `main`. Read its "What this batch deliberately does not do" section; several of those absences end here.

## Global Constraints

- **Every string in the repo is English** — code, comments, commits, docs, UI copy. No Spanish anywhere.
- **The author is CryptoSandler, and nobody else.** This repo is public and pushed to github.com/CryptoSandler/milliondollarpage.fun. `git config user.name` and `user.email` are already set in this repo; do not override them, and do not let a tool add a co-author or a machine username. Check `git log --format='%an <%ae>'` before pushing.
- **No copy, code, assets, or CSS from `1millionpixels.xyz`, `thewallsolana.com`, or `milliondollarsolanapage.com`.** One of them is the same product. Ideas only. This already went wrong once: a string in batch 1's selector had to be rewritten in review because it echoed one of theirs. Every UI string you write is yours. See [`docs/references.md`](../../references.md).
- **The board is 1000×1000, the block grid is 10 pixels, the minimum purchase is 10×10.** Use `BOARD_PIXELS`, `BLOCK_PIXELS` and `rectIsValid` from `src/lib/board/geometry.ts`. Never re-derive them.
- **Rectangles are half-open on both sides of the wire.** `rectsIntersect` in TypeScript and `int4range` in Postgres already agree; a differential test over 65,536 pairs confirmed it. Nothing in this batch may introduce a fourth definition.
- **No ORM.** Parameterised `pg` queries only; never string-interpolate a value into SQL.
- **The database is Neon.** Branches `production` (`DATABASE_URL`) and `tests` (`TEST_DATABASE_URL`) already exist, both `sslmode=verify-full`, both in `.env.local` and nowhere else. **Never print, echo, log or paste a connection string, host or role name.** Name a database by its branch.
- **Required env vars have no defaults.** A missing `DATABASE_URL` or `RATE_LIMIT_SALT` is a startup failure.
- **Prices are not environment variables.** They live in `settings`. This batch reads `price_per_pixel_usdc`; it does not add an admin UI.
- **No money moves in this batch, and no private key exists yet.** If a task tempts you toward `@solana/*`, `@metaplex-foundation/*`, Irys, or a wallet adapter, it is out of scope — batches 3 and 4.
- **This is Next 16, not the Next in your training data.** Before writing any route handler or page, read the relevant guide under `node_modules/next/dist/docs/`. The `AGENTS.md` block Next writes stays committed.
- **`npx tsc --noEmit`, `npm run lint` and `npm test` must all be clean at the end of every task.** Run them; do not assume. A review in batch 1 reported "clean" without running `tsc` and a real error survived two tasks.
- **TDD.** Test first, watch it fail, implement minimally, watch it pass, commit.

---

## File Structure

```
migrations/002_orders.sql            The nine spec columns, plus held image bytes

src/lib/board/reserve.ts             reserveRect(): sweep + insert, one transaction
src/lib/board/content.ts             Validating an image, a link and a caption
src/lib/board/orders.ts              Reading and transitioning one order
src/lib/board/payment-stub.ts        The stand-in verifier this batch ships behind

src/lib/callers/client-ip.ts         clientIp + hashIp (copy from pixelwar)
src/lib/callers/limits.ts            Per-caller ceilings on reservation creation

src/app/api/reserve/route.ts         POST: hold a rectangle
src/app/api/orders/[id]/route.ts     GET: one order's state, for polling
src/app/api/orders/[id]/content/route.ts   POST: image, link, caption
src/app/api/orders/[id]/confirm/route.ts   POST: the stubbed payment step

src/components/PurchaseDialog.tsx    The four-step flow container
src/components/ContentForm.tsx       Image, link, caption, fit
src/components/ConfirmationStep.tsx  Everything that is about to become permanent
src/components/HoldTimer.tsx         The countdown, and what happens when it ends
```

`board/` keeps answering "what is on the board and what may be bought"; the new
`callers/` answers "who is asking and how often". They are separate because a
rate limit has nothing to do with a rectangle, and both are worth testing without
the other.

---

### Task 1: Migration 002 — the columns an order needs

**Files:**
- Create: `migrations/002_orders.sql`
- Test: `src/lib/board/__tests__/orders-schema.test.ts`

**Interfaces:**
- Consumes: the `blocks` table from `migrations/001_board.sql`.
- Produces: on `blocks` — `payment_fraction integer`, `payment_signature text UNIQUE`, `image_arweave_id text`, `metadata_arweave_id text`, `image_sha256 text`, `is_animated boolean NOT NULL DEFAULT false`, `mint_address text UNIQUE`, `owner_wallet text`, `removed_at timestamptz`, plus `pending_image bytea`, `pending_image_mime text` and `ip_hash text`. Constraint names `blocks_payment_signature_unique`, `blocks_mint_address_unique`, `blocks_paid_never_expires`, `blocks_sha256_shape`.

**Two additions beyond the spec's nine, both deliberate — say so in your commit message:**
`pending_image` and `pending_image_mime` hold the validated image bytes between validation and the Arweave upload that arrives in a later batch. The spec says the server "validates and holds the bytes"; it does not say where. A `bytea` column is the simplest thing that works without introducing a storage service, which was an explicit project constraint. They are nulled once `image_arweave_id` is set.

- [ ] **Step 1: Write the failing test**

Create `src/lib/board/__tests__/orders-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { execute, query } from "../../db";

async function insertReserved(x: number, y: number, extra = "", params: unknown[] = []) {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at${extra ? ", " + extra : ""})
     VALUES ($1, $2, 10, 10, 'reserved', 1000000, 100000000, now() + interval '30 minutes'${
       extra ? ", " + extra.split(", ").map((_, i) => `$${i + 3}`).join(", ") : ""
     })`,
    [x, y, ...params],
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

describe("migration 002", () => {
  it("adds every column an order needs", async () => {
    const rows = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'blocks'`,
    );
    const names = rows.map((r) => r.column_name);
    for (const expected of [
      "payment_fraction",
      "payment_signature",
      "image_arweave_id",
      "metadata_arweave_id",
      "image_sha256",
      "is_animated",
      "mint_address",
      "owner_wallet",
      "removed_at",
      "pending_image",
      "pending_image_mime",
    ]) {
      expect(names, `missing column ${expected}`).toContain(expected);
    }
  });

  it("refuses to let one payment settle two orders", async () => {
    await insertReserved(0, 0, "payment_signature", ["sig-abc"]);
    expect(await errorCodeOf(() => insertReserved(20, 0, "payment_signature", ["sig-abc"]))).toBe(
      "23505",
    );
  });

  it("refuses two blocks claiming the same mint", async () => {
    await insertReserved(0, 0, "mint_address", ["mint-abc"]);
    expect(await errorCodeOf(() => insertReserved(20, 0, "mint_address", ["mint-abc"]))).toBe(
      "23505",
    );
  });

  it("allows many orders with no signature and no mint yet", async () => {
    await insertReserved(0, 0);
    await insertReserved(20, 0);
    await insertReserved(40, 0);
    const rows = await query("SELECT id FROM blocks");
    expect(rows).toHaveLength(3);
  });

  it("defaults is_animated to false rather than null", async () => {
    await insertReserved(0, 0);
    const rows = await query<{ is_animated: boolean }>("SELECT is_animated FROM blocks");
    expect(rows[0].is_animated).toBe(false);
  });

  it("forbids a paid order that still has an expiry", async () => {
    // A paid order must never expire. This is the invariant the whole retry
    // story rests on, so the database enforces it rather than trusting callers.
    const code = await errorCodeOf(() =>
      execute(
        `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at)
         VALUES (0, 0, 10, 10, 'paid', 1000000, 100000000, now() + interval '30 minutes')`,
      ),
    );
    expect(code).toBe("23514");
  });

  it("allows a paid order with a null expiry", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at)
       VALUES (0, 0, 10, 10, 'paid', 1000000, 100000000, NULL)`,
    );
    const rows = await query("SELECT id FROM blocks WHERE status = 'paid'");
    expect(rows).toHaveLength(1);
  });

  it("requires a reserved order to carry an expiry", async () => {
    const code = await errorCodeOf(() =>
      execute(
        `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at)
         VALUES (0, 0, 10, 10, 'reserved', 1000000, 100000000, NULL)`,
      ),
    );
    expect(code).toBe("23514");
  });

  it("rejects a malformed image hash", async () => {
    const code = await errorCodeOf(() =>
      insertReserved(0, 0, "image_sha256", ["not-a-hash"]),
    );
    expect(code).toBe("23514");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/board/__tests__/orders-schema.test.ts
```

Expected: FAIL, `column "payment_fraction" does not exist` (or the first missing-column assertion).

- [ ] **Step 3: Write the migration**

Create `migrations/002_orders.sql`:

```sql
-- What an order needs on top of a rectangle.
--
-- Batch 1 shipped a blocks table that could hold a rectangle and nothing else.
-- These are the columns the purchase, the payment and the mint fill in. The
-- chain-side ones (arweave ids, mint address, owner) are unused until a later
-- batch and are added now so the shape of a row stops changing under us.

ALTER TABLE blocks
  ADD COLUMN payment_fraction     integer,
  ADD COLUMN payment_signature    text,
  ADD COLUMN image_arweave_id     text,
  ADD COLUMN metadata_arweave_id  text,
  ADD COLUMN image_sha256         text,
  ADD COLUMN is_animated          boolean NOT NULL DEFAULT false,
  ADD COLUMN mint_address         text,
  ADD COLUMN owner_wallet         text,
  ADD COLUMN removed_at           timestamptz,
  -- Not in the spec's column list, and deliberate: the validated image has to
  -- live somewhere between "validated, before payment" and "uploaded to
  -- Arweave, after payment", and a bytea column is the simplest thing that
  -- does that without introducing a storage service. Nulled once
  -- image_arweave_id is set.
  ADD COLUMN pending_image        bytea,
  ADD COLUMN pending_image_mime   text,
  -- Which caller created the hold, as a salted hash. Never a raw IP. Task 2
  -- uses it to stop one caller holding the whole board.
  ADD COLUMN ip_hash              text;

-- One transfer settles one order. Without this, a replayed signature could
-- mark a second rectangle paid for free.
ALTER TABLE blocks ADD CONSTRAINT blocks_payment_signature_unique UNIQUE (payment_signature);

-- One asset per block, and one block per asset.
ALTER TABLE blocks ADD CONSTRAINT blocks_mint_address_unique UNIQUE (mint_address);

-- The invariant the retry story rests on: a reservation expires, a paid order
-- never does. Enforced here rather than trusted to callers, because the cost of
-- getting it wrong is somebody who paid losing their rectangle to the sweep.
ALTER TABLE blocks ADD CONSTRAINT blocks_paid_never_expires CHECK (
  (status = 'reserved' AND expires_at IS NOT NULL)
  OR (status <> 'reserved' AND expires_at IS NULL)
);

-- A sha256 is 64 lowercase hex characters or it is not a sha256.
ALTER TABLE blocks ADD CONSTRAINT blocks_sha256_shape CHECK (
  image_sha256 IS NULL OR image_sha256 ~ '^[0-9a-f]{64}$'
);

CREATE INDEX blocks_buyer_pubkey ON blocks (buyer_pubkey) WHERE buyer_pubkey IS NOT NULL;
CREATE INDEX blocks_ip_hash_live ON blocks (ip_hash) WHERE status = 'reserved';
```

**A note the implementer must act on:** `blocks_paid_never_expires` applies to
existing rows. The seven seeded demo blocks are `minted` with a null
`expires_at`, so they satisfy it. If the migration fails on existing data, do
not weaken the constraint — report BLOCKED and say which rows violate it.

- [ ] **Step 4: Apply and run the test**

```bash
npm run db:up
npm test -- src/lib/board/__tests__/orders-schema.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Confirm the batch 1 suite still passes**

```bash
npm test
npx tsc --noEmit
npm run lint
```

Expected: every batch 1 test still green (88 before this task), tsc and lint clean.

- [ ] **Step 6: Commit**

```bash
git add migrations/002_orders.sql src/lib/board/__tests__/orders-schema.test.ts
git commit -m "Give a block the columns an order fills in, and forbid a paid order that expires"
```

---

### Task 2: Who is calling, and how often

**Files:**
- Create: `src/lib/callers/client-ip.ts`, `src/lib/callers/limits.ts`
- Modify: `src/lib/config.ts`, `.env.example`
- Test: `src/lib/callers/__tests__/client-ip.test.ts`, `src/lib/callers/__tests__/limits.test.ts`

**Interfaces:**
- Consumes: `query`, `execute` from `src/lib/db.ts`; `required` from `src/lib/config.ts`.
- Produces:
  - `clientIp(request: Request): { ok: true; ip: string; source: string } | { ok: false; reason: string }`
  - `hashIp(ip: string): string`
  - `rateLimitSalt()`, `trustedProxyHops()`, `allowUntrustedClientIp()` added to `src/lib/config.ts`
  - `type LimitDecision = { ok: true } | { ok: false; reason: string; message: string; retryAt: string }`
  - `checkReservationLimits(ipHash: string): Promise<LimitDecision>`
  - `RESERVATION_LIMITS = { liveHoldsPerCaller: 3, createdPerWindow: 20, windowMinutes: 60 }`

- [ ] **Step 1: Copy the caller-identity module from pixelwar**

Copy `~/proyectos/pixelwar/src/lib/paint/client-ip.ts` to `src/lib/callers/client-ip.ts`, and its test to `src/lib/callers/__tests__/client-ip.test.ts`. Copy them verbatim except:

1. Drop `subnetKey` and its tests. That exists for a per-subnet paint burst cap this product does not have; a second unused identity derivation is dead code a reviewer will flag.
2. The `required()` helper it needs already exists in `src/lib/config.ts`. Add `rateLimitSalt()`, `trustedProxyHops()`, `allowUntrustedClientIp()` and `trustedPlatformHeader()` to that file, copying their bodies and their explanatory comments from `~/proyectos/pixelwar/src/lib/config.ts`.
3. Update the module header to say what it protects here: reservation creation, which is free and holds a rectangle, and is therefore the cheapest thing on this site to abuse.

Add `RATE_LIMIT_SALT` to `.env.example` with a comment saying what breaks without it, and generate one into `.env.local` with `openssl rand -hex 32`. **Do not print the value.**

- [ ] **Step 2: Run the copied test**

```bash
npm test -- src/lib/callers/__tests__/client-ip.test.ts
```

Expected: PASS. This is tested code copied verbatim, so the failing-first cycle does not apply to it.

- [ ] **Step 3: Write the failing test for the limits**

Create `src/lib/callers/__tests__/limits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { execute, query } from "../../db";
import { RESERVATION_LIMITS, checkReservationLimits } from "../limits";

const CALLER = "a".repeat(64);
const OTHER = "b".repeat(64);

async function hold(ipHash: string, x: number, minutesLeft: number): Promise<void> {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at, ip_hash)
     VALUES ($1, 0, 10, 10, 'reserved', 1000000, 100000000, now() + ($2 || ' minutes')::interval, $3)`,
    [x, String(minutesLeft), ipHash],
  );
}

describe("checkReservationLimits", () => {
  it("allows a caller with nothing outstanding", async () => {
    expect(await checkReservationLimits(CALLER)).toEqual({ ok: true });
  });

  it("allows a caller right up to the live-hold ceiling", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller - 1; i++) {
      await hold(CALLER, i * 20, 30);
    }
    expect(await checkReservationLimits(CALLER)).toEqual({ ok: true });
  });

  it("refuses a caller already holding the maximum", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      await hold(CALLER, i * 20, 30);
    }
    const decision = await checkReservationLimits(CALLER);
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toBe("too_many_live");
      expect(Date.parse(decision.retryAt)).toBeGreaterThan(Date.now());
    }
  });

  it("does not count another caller's holds against this one", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      await hold(OTHER, i * 20, 30);
    }
    expect(await checkReservationLimits(CALLER)).toEqual({ ok: true });
  });

  it("sweeps expired holds first, so a blocked caller unblocks itself by waiting", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      await hold(CALLER, i * 20, -5);
    }
    expect(await checkReservationLimits(CALLER)).toEqual({ ok: true });
    const left = await query("SELECT id FROM blocks WHERE status = 'reserved'");
    expect(left, "the expired holds should be gone, not merely ignored").toEqual([]);
  });

  it("counts a paid order against nothing, because it is no longer a hold", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at, ip_hash)
       VALUES (0, 0, 10, 10, 'paid', 1000000, 100000000, NULL, $1)`,
      [CALLER],
    );
    expect(await checkReservationLimits(CALLER)).toEqual({ ok: true });
  });
});
```

This test uses the `ip_hash` column added by migration 002 in Task 1.

- [ ] **Step 4: Run the test to verify it fails, then implement**

```bash
npm test -- src/lib/callers/__tests__/limits.test.ts
```

Expected: FAIL, cannot resolve `../limits`.

Create `src/lib/callers/limits.ts`:

```ts
import { execute, query } from "../db";

/**
 * Ceilings on reservation creation.
 *
 * Creating a hold is free and takes a rectangle off the board for half an hour,
 * which makes it the cheapest thing on this site to abuse: a script could hold
 * the whole board indefinitely for nothing.
 *
 * Every check sweeps expired holds FIRST, and that matters more than it looks.
 * Both the allow and the deny path go through the same sweep, so a caller who
 * has filled the limit unblocks itself simply by waiting, with no cleanup job
 * in the loop. The sweep is also what stops an attacker from holding a limit
 * past its own expiry window.
 */

export const RESERVATION_LIMITS = {
  /** Unpaid holds one caller may have at the same time. */
  liveHoldsPerCaller: 3,
  /** Holds one caller may create within the rolling window below. */
  createdPerWindow: 20,
  windowMinutes: 60,
} as const;

export type LimitDecision =
  | { ok: true }
  | { ok: false; reason: "too_many_live" | "too_many_recent"; message: string; retryAt: string };

async function sweepExpiredHolds(): Promise<void> {
  await execute(
    `DELETE FROM blocks
      WHERE status = 'reserved' AND (expires_at IS NULL OR expires_at <= now())`,
  );
}

export async function checkReservationLimits(ipHash: string): Promise<LimitDecision> {
  await sweepExpiredHolds();

  const live = await query<{ count: string; next_expiry: Date | null }>(
    `SELECT COUNT(*)::text AS count, MIN(expires_at) AS next_expiry
       FROM blocks
      WHERE status = 'reserved' AND ip_hash = $1`,
    [ipHash],
  );

  if (Number(live[0]?.count ?? 0) >= RESERVATION_LIMITS.liveHoldsPerCaller) {
    const next = live[0]?.next_expiry;
    return {
      ok: false,
      reason: "too_many_live",
      message: `You are already holding ${RESERVATION_LIMITS.liveHoldsPerCaller} rectangles. Finish one or let a hold expire.`,
      retryAt: (next ?? new Date(Date.now() + 60_000)).toISOString(),
    };
  }

  const recent = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM blocks
      WHERE ip_hash = $1 AND created_at > now() - ($2 || ' minutes')::interval`,
    [ipHash, String(RESERVATION_LIMITS.windowMinutes)],
  );

  if (Number(recent[0]?.count ?? 0) >= RESERVATION_LIMITS.createdPerWindow) {
    return {
      ok: false,
      reason: "too_many_recent",
      message: "Too many holds started recently. Try again later.",
      retryAt: new Date(Date.now() + RESERVATION_LIMITS.windowMinutes * 60_000).toISOString(),
    };
  }

  return { ok: true };
}
```

- [ ] **Step 5: Run both tests to verify they pass**

```bash
npm test -- src/lib/callers/
npx tsc --noEmit
npm run lint
```

Expected: PASS, 6 limit tests plus the copied client-ip tests. tsc and lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/callers/ src/lib/config.ts migrations/002_orders.sql .env.example
git commit -m "Know who is asking, and stop one caller holding the whole board"
```

---

### Task 3: The reservation — sweep and insert in one transaction

**Files:**
- Create: `src/lib/board/reserve.ts`
- Test: `src/lib/board/__tests__/reserve.test.ts`

**Interfaces:**
- Consumes: `transaction`, `query` from `src/lib/db.ts`; `Rect`, `rectIsValid`, `rectPixels` from `src/lib/board/geometry.ts`; `totalBaseUnits` from `src/lib/board/pricing.ts`.
- Produces:
  - `RESERVATION_MINUTES = 30`
  - `FRACTION_MIN = 1`, `FRACTION_MAX = 999_999`
  - `class RectangleTaken extends Error`, `class RectangleInvalid extends Error`
  - `type Reservation = { id: string; rect: Rect; pixels: number; pricePerPixelBaseUnits: number; totalBaseUnits: number; paymentBaseUnits: number; expiresAt: string }`
  - `reserveRect(rect: Rect, buyerPubkey: string, ipHash: string): Promise<Reservation>`

**This is the most important task in the batch.** Everything else is plumbing around this one function. Two properties have to hold simultaneously: an expired hold must not block a new reservation, and two callers racing for overlapping rectangles must not both succeed.

- [ ] **Step 1: Write the failing test**

Create `src/lib/board/__tests__/reserve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { execute, query } from "../../db";
import { RectangleInvalid, RectangleTaken, reserveRect } from "../reserve";

const BUYER = "BuyerPubkey1111111111111111111111111111111";
const CALLER = "c".repeat(64);

async function seedBlock(x: number, y: number, status: string, minutesLeft: number | null) {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, expires_at)
     VALUES ($1, $2, 20, 20, $3, 1000000, 400000000,
             CASE WHEN $4::text IS NULL THEN NULL ELSE now() + ($4 || ' minutes')::interval END)`,
    [x, y, status, minutesLeft === null ? null : String(minutesLeft)],
  );
}

describe("reserveRect", () => {
  it("holds a free rectangle and prices it from settings", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, BUYER, CALLER);
    expect(held.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    expect(held.pixels).toBe(400);
    expect(held.pricePerPixelBaseUnits).toBe(1_000_000);
    expect(held.totalBaseUnits).toBe(400_000_000);
    expect(Date.parse(held.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("gives the hold a payment amount that is not round", async () => {
    // The fraction is how an incoming transfer is attributed to an order, so a
    // round amount is exactly the one that cannot be attributed.
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    expect(held.paymentBaseUnits).toBeGreaterThan(held.totalBaseUnits);
    expect(held.paymentBaseUnits - held.totalBaseUnits).toBeGreaterThanOrEqual(1);
    expect(held.paymentBaseUnits - held.totalBaseUnits).toBeLessThanOrEqual(999_999);
  });

  it("snapshots the price so a settings change cannot move a live hold", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    await execute("UPDATE settings SET value = '5000000' WHERE key = 'price_per_pixel_usdc'");
    try {
      const rows = await query<{ price_per_pixel_usdc: string }>(
        "SELECT price_per_pixel_usdc FROM blocks WHERE id = $1",
        [held.id],
      );
      expect(Number(rows[0].price_per_pixel_usdc)).toBe(1_000_000);
    } finally {
      await execute("UPDATE settings SET value = '1000000' WHERE key = 'price_per_pixel_usdc'");
    }
  });

  it("binds the hold to the buyer's pubkey and the caller's hash", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const rows = await query<{ buyer_pubkey: string; ip_hash: string }>(
      "SELECT buyer_pubkey, ip_hash FROM blocks WHERE id = $1",
      [held.id],
    );
    expect(rows[0].buyer_pubkey).toBe(BUYER);
    expect(rows[0].ip_hash).toBe(CALLER);
  });

  it("refuses a rectangle overlapping a minted block", async () => {
    await seedBlock(0, 0, "minted", null);
    await expect(reserveRect({ x: 10, y: 10, w: 20, h: 20 }, BUYER, CALLER)).rejects.toBeInstanceOf(
      RectangleTaken,
    );
  });

  it("refuses a rectangle overlapping a live hold", async () => {
    await seedBlock(0, 0, "reserved", 30);
    await expect(reserveRect({ x: 10, y: 10, w: 20, h: 20 }, BUYER, CALLER)).rejects.toBeInstanceOf(
      RectangleTaken,
    );
  });

  it("refuses a rectangle overlapping a paid order, which never expires", async () => {
    await seedBlock(0, 0, "paid", null);
    await expect(reserveRect({ x: 10, y: 10, w: 20, h: 20 }, BUYER, CALLER)).rejects.toBeInstanceOf(
      RectangleTaken,
    );
  });

  it("ALLOWS a rectangle over an EXPIRED hold, sweeping it in the same transaction", async () => {
    // The whole reason the sweep lives inside the insert's transaction.
    await seedBlock(0, 0, "reserved", -1);
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, BUYER, CALLER);
    expect(held.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    const rows = await query("SELECT id FROM blocks WHERE status = 'reserved'");
    expect(rows, "the expired hold should be gone, and only the new one left").toHaveLength(1);
  });

  it("allows a rectangle flush against a sold block, because edges do not overlap", async () => {
    await seedBlock(0, 0, "minted", null);
    const held = await reserveRect({ x: 20, y: 0, w: 20, h: 20 }, BUYER, CALLER);
    expect(held.rect.x).toBe(20);
  });

  it("allows a rectangle over a removed block, whose pixels are for sale again", async () => {
    await seedBlock(0, 0, "removed", null);
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, BUYER, CALLER);
    expect(held.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });

  it("refuses a malformed rectangle before touching the database", async () => {
    await expect(reserveRect({ x: 5, y: 0, w: 10, h: 10 }, BUYER, CALLER)).rejects.toBeInstanceOf(
      RectangleInvalid,
    );
    await expect(reserveRect({ x: 0, y: 0, w: 0, h: 10 }, BUYER, CALLER)).rejects.toBeInstanceOf(
      RectangleInvalid,
    );
    await expect(
      reserveRect({ x: 990, y: 0, w: 20, h: 10 }, BUYER, CALLER),
    ).rejects.toBeInstanceOf(RectangleInvalid);
  });

  it("lets exactly one of two concurrent overlapping reservations win", async () => {
    // The constraint, not the application, is what makes this true.
    const results = await Promise.allSettled([
      reserveRect({ x: 100, y: 100, w: 50, h: 50 }, BUYER, CALLER),
      reserveRect({ x: 120, y: 120, w: 50, h: 50 }, BUYER, CALLER),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(RectangleTaken);
  });

  it("lets both of two concurrent NON-overlapping reservations win", async () => {
    const results = await Promise.allSettled([
      reserveRect({ x: 100, y: 100, w: 50, h: 50 }, BUYER, CALLER),
      reserveRect({ x: 200, y: 200, w: 50, h: 50 }, BUYER, CALLER),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/board/__tests__/reserve.test.ts
```

Expected: FAIL, cannot resolve `../reserve`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/board/reserve.ts`:

```ts
import { randomInt } from "node:crypto";
import { transaction } from "../db";
import { type Rect, rectIsValid, rectPixels } from "./geometry";
import { totalBaseUnits } from "./pricing";

/**
 * Holding a rectangle.
 *
 * The sweep and the insert run inside ONE transaction, and that is the whole
 * design. An exclusion constraint cannot reference now(), so expiry cannot live
 * in its predicate — an expired-but-unswept hold still blocks the constraint.
 * Sweeping in a separate statement beforehand would leave a window in which
 * another transaction re-creates the hold we just deleted. Inside one
 * transaction, the sweep and the constraint see the same snapshot.
 *
 * Concurrency is not handled here. Two callers racing for overlapping
 * rectangles both reach the INSERT, and Postgres refuses one of them with
 * 23P01. That refusal IS the correctness argument; there is no lock to
 * remember to take, and no check-then-act window to lose.
 */

export const RESERVATION_MINUTES = 30;

/**
 * Payment attribution, inherited from the sibling project.
 *
 * A transfer arriving at the treasury says nothing about who it is for. Every
 * order gets a unique fraction added to its total, and that fraction is what
 * identifies it. Drawn from 1..999,999 and never zero, because a round amount
 * is precisely the one that cannot be attributed.
 */
export const FRACTION_MIN = 1;
export const FRACTION_MAX = 999_999;

export class RectangleTaken extends Error {
  constructor() {
    super("Those pixels are no longer available.");
    this.name = "RectangleTaken";
  }
}

export class RectangleInvalid extends Error {
  constructor() {
    super("That is not a rectangle this board can sell.");
    this.name = "RectangleInvalid";
  }
}

export type Reservation = {
  id: string;
  rect: Rect;
  pixels: number;
  pricePerPixelBaseUnits: number;
  totalBaseUnits: number;
  paymentBaseUnits: number;
  expiresAt: string;
};

export async function reserveRect(
  rect: Rect,
  buyerPubkey: string,
  ipHash: string,
): Promise<Reservation> {
  // Checked before opening a transaction: a malformed rectangle is the
  // caller's mistake, not a race, and the database's CHECK constraints would
  // report it as a generic 23514 with no useful message.
  if (!rectIsValid(rect)) throw new RectangleInvalid();

  const pixels = rectPixels(rect);
  const fraction = randomInt(FRACTION_MIN, FRACTION_MAX + 1);

  try {
    return await transaction(async (client) => {
      await client.query(
        `DELETE FROM blocks
          WHERE status = 'reserved' AND (expires_at IS NULL OR expires_at <= now())`,
      );

      // Read the price inside the transaction so the row and the number the
      // buyer is quoted come from the same snapshot.
      const setting = await client.query<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'price_per_pixel_usdc'",
      );
      if (setting.rows.length === 0) {
        throw new Error('Setting "price_per_pixel_usdc" is missing. Migration 001 seeds it.');
      }
      const perPixel = Number(setting.rows[0].value);
      const total = totalBaseUnits(pixels, perPixel);

      const inserted = await client.query<{ id: string; expires_at: Date }>(
        `INSERT INTO blocks
           (x, y, w, h, status, buyer_pubkey, ip_hash,
            price_per_pixel_usdc, total_usdc, payment_fraction, expires_at)
         VALUES ($1, $2, $3, $4, 'reserved', $5, $6, $7, $8, $9,
                 now() + ($10 || ' minutes')::interval)
         RETURNING id, expires_at`,
        [
          rect.x, rect.y, rect.w, rect.h,
          buyerPubkey, ipHash,
          perPixel, total, fraction,
          String(RESERVATION_MINUTES),
        ],
      );

      const row = inserted.rows[0];
      return {
        id: row.id,
        rect,
        pixels,
        pricePerPixelBaseUnits: perPixel,
        totalBaseUnits: total,
        paymentBaseUnits: total + fraction,
        expiresAt: row.expires_at.toISOString(),
      };
    });
  } catch (error) {
    // 23P01 is the exclusion constraint: somebody else holds those pixels.
    if ((error as { code?: string }).code === "23P01") throw new RectangleTaken();
    throw error;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/lib/board/__tests__/reserve.test.ts
```

Expected: PASS, 13 tests. If the two concurrency tests are flaky against Neon, do NOT weaken them — report the flake and the failure mode in your report.

- [ ] **Step 5: Commit**

```bash
git add src/lib/board/reserve.ts src/lib/board/__tests__/reserve.test.ts
git commit -m "Hold a rectangle: sweep and insert in one transaction, and let the constraint referee"
```

---

### Task 4: Validating what will become permanent

**Files:**
- Create: `src/lib/board/content.ts`
- Test: `src/lib/board/__tests__/content.test.ts`, `src/lib/board/__tests__/fixtures/` (generated, not committed as binaries — see Step 1)

**Interfaces:**
- Consumes: `sharp` (add the dependency).
- Produces:
  - `CONTENT_LIMITS = { maxBytes: 102_400, maxDimension: 1000, captionMaxLength: 32 }`
  - `type ContentRejection = { field: "image" | "link" | "caption"; reason: string }`
  - `type ValidatedContent = { bytes: Buffer; mime: string; sha256: string; isAnimated: boolean; width: number; height: number; link: string; caption: string; imageFit: "contain" | "cover" }`
  - `validateContent(input): Promise<{ ok: true; content: ValidatedContent } | { ok: false; rejections: ContentRejection[] }>`

**Why 100 KiB:** it is not a storage-cost decision. Arweave uploads under 100 KiB are free through the provider the spec names, and free uploads are what let the signing key stay permanently unfunded — which is the enforceable half of the security posture in SECURITY.md. It is a security control that happens to look like a file-size limit. Say that in the module comment.

- [ ] **Step 1: Add sharp, and write the failing test**

```bash
npm install sharp
```

Create `src/lib/board/__tests__/content.test.ts`. Generate every fixture in the test itself with `sharp` rather than committing binaries — a committed PNG is a blob nobody can review:

```ts
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { CONTENT_LIMITS, validateContent } from "../content";

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
}

async function animatedGif(): Promise<Buffer> {
  return sharp(
    { create: { width: 20, height: 20, channels: 3, background: { r: 0, g: 0, b: 0 } } },
  )
    .gif()
    .toBuffer();
}

const GOOD = { link: "https://example.com/", caption: "A caption", imageFit: "contain" as const };

describe("validateContent — the image", () => {
  it("accepts a small PNG and reports its shape", async () => {
    const result = await validateContent({ ...GOOD, bytes: await png(100, 100), declaredMime: "image/png" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.mime).toBe("image/png");
      expect(result.content.width).toBe(100);
      expect(result.content.height).toBe(100);
      expect(result.content.isAnimated).toBe(false);
      expect(result.content.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("computes a hash that changes when one pixel changes", async () => {
    const a = await validateContent({ ...GOOD, bytes: await png(100, 100), declaredMime: "image/png" });
    const b = await validateContent({ ...GOOD, bytes: await png(101, 100), declaredMime: "image/png" });
    if (a.ok && b.ok) expect(a.content.sha256).not.toBe(b.content.sha256);
    else throw new Error("both fixtures should validate");
  });

  it("rejects anything over the byte cap", async () => {
    const big = Buffer.alloc(CONTENT_LIMITS.maxBytes + 1, 1);
    const result = await validateContent({ ...GOOD, bytes: big, declaredMime: "image/png" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejections[0].field).toBe("image");
  });

  it("rejects an image larger than the board", async () => {
    const result = await validateContent({
      ...GOOD,
      bytes: await png(CONTENT_LIMITS.maxDimension + 10, 10),
      declaredMime: "image/png",
    });
    expect(result.ok).toBe(false);
  });

  it("trusts the bytes, not the declared type", async () => {
    // A caller claiming image/png over a GIF must not get a PNG recorded.
    const result = await validateContent({ ...GOOD, bytes: await animatedGif(), declaredMime: "image/png" });
    if (result.ok) expect(result.content.mime).toBe("image/gif");
    else expect(result.rejections[0].field).toBe("image");
  });

  it("rejects a file that is not an image at all", async () => {
    const result = await validateContent({
      ...GOOD,
      bytes: Buffer.from("<html><body>hello</body></html>"),
      declaredMime: "image/png",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejections[0].field).toBe("image");
  });

  it("rejects an empty file", async () => {
    const result = await validateContent({ ...GOOD, bytes: Buffer.alloc(0), declaredMime: "image/png" });
    expect(result.ok).toBe(false);
  });
});

describe("validateContent — the link", () => {
  it("accepts https", async () => {
    const result = await validateContent({ ...GOOD, link: "https://example.com/a/b?c=d", bytes: await png(10, 10), declaredMime: "image/png" });
    expect(result.ok).toBe(true);
  });

  it("rejects http, javascript, data and a bare host", async () => {
    for (const link of [
      "http://example.com/",
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "example.com",
      "",
    ]) {
      const result = await validateContent({ ...GOOD, link, bytes: await png(10, 10), declaredMime: "image/png" });
      expect(result.ok, `link should have been rejected: ${link}`).toBe(false);
      if (!result.ok) expect(result.rejections.some((r) => r.field === "link")).toBe(true);
    }
  });
});

describe("validateContent — the caption", () => {
  it("accepts a caption at the cap", async () => {
    const result = await validateContent({
      ...GOOD,
      caption: "x".repeat(CONTENT_LIMITS.captionMaxLength),
      bytes: await png(10, 10),
      declaredMime: "image/png",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects one character over", async () => {
    const result = await validateContent({
      ...GOOD,
      caption: "x".repeat(CONTENT_LIMITS.captionMaxLength + 1),
      bytes: await png(10, 10),
      declaredMime: "image/png",
    });
    expect(result.ok).toBe(false);
  });

  it("trims whitespace and rejects a caption that is only whitespace", async () => {
    const spaced = await validateContent({ ...GOOD, caption: "  hello  ", bytes: await png(10, 10), declaredMime: "image/png" });
    if (spaced.ok) expect(spaced.content.caption).toBe("hello");
    const blank = await validateContent({ ...GOOD, caption: "   ", bytes: await png(10, 10), declaredMime: "image/png" });
    expect(blank.ok).toBe(false);
  });
});

describe("validateContent — reporting", () => {
  it("reports every bad field at once, not just the first", async () => {
    const result = await validateContent({
      bytes: Buffer.from("nope"),
      declaredMime: "image/png",
      link: "javascript:alert(1)",
      caption: "x".repeat(99),
      imageFit: "contain",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejections.map((r) => r.field).sort()).toEqual(["caption", "image", "link"]);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/board/__tests__/content.test.ts
```

Expected: FAIL, cannot resolve `../content`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/board/content.ts`. It must:

- compute `sha256` over the raw bytes with `node:crypto`;
- determine the real MIME and dimensions with `sharp().metadata()`, never from the declared type, and treat a `sharp` throw as "not an image";
- set `isAnimated` from `metadata.pages > 1`;
- accept only `image/png`, `image/jpeg`, `image/webp`, `image/gif`;
- enforce `maxBytes` **before** handing anything to `sharp`, so a hostile file is never decoded;
- require `new URL(link).protocol === "https:"` and reject anything that throws;
- trim the caption and reject an empty one;
- collect ALL rejections rather than returning at the first.

Write the header comment to say why 100 KiB is a security control, not a storage decision (see the note above this task).

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/lib/board/__tests__/content.test.ts
npx tsc --noEmit
npm run lint
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/board/content.ts src/lib/board/__tests__/content.test.ts package.json package-lock.json
git commit -m "Validate an image by its bytes, a link by its scheme, before anyone pays"
```

---

### Task 5: The order's state machine

**Files:**
- Create: `src/lib/board/orders.ts`, `src/lib/board/payment-stub.ts`
- Test: `src/lib/board/__tests__/orders.test.ts`
- Modify: `src/lib/config.ts`, `.env.example`

**Interfaces:**
- Consumes: `query`, `queryOne`, `execute` from `src/lib/db.ts`; `Rect` from `./geometry`; `ValidatedContent` from `./content`; `reserveRect` from `./reserve`.
- Produces:
  - `type OrderStatus = "reserved" | "paid"`
  - `type Order = { id: string; rect: Rect; status: OrderStatus; buyerPubkey: string; pricePerPixelBaseUnits: number; totalBaseUnits: number; paymentBaseUnits: number; expiresAt: string | null; hasContent: boolean; caption: string | null; link: string | null; imageFit: "contain" | "cover" | null; isAnimated: boolean }`
  - `getOrder(id: string): Promise<Order | null>`
  - `attachContent(id: string, buyerPubkey: string, content: ValidatedContent): Promise<Order>`
  - `markPaid(id: string, buyerPubkey: string, signature: string): Promise<Order>`
  - `class OrderNotFound extends Error`, `class OrderNotYours extends Error`, `class OrderExpired extends Error`, `class OrderNotReady extends Error`, `class SignatureAlreadyUsed extends Error`
  - From `payment-stub.ts`: `stubPaymentsAllowed(): boolean`, `stubVerifyPayment(order: Order): Promise<{ ok: true; signature: string } | { ok: false; reason: string }>`

**The stub, stated plainly:** this batch ships no payment verification. `stubVerifyPayment` returns a synthetic signature and is gated on `ALLOW_STUB_PAYMENTS=true`, which must be absent in production and fails startup there. Batch 3 replaces the module wholesale with the real on-chain verifier; the call site does not change.

- [ ] **Step 1: Write the failing test**

Create `src/lib/board/__tests__/orders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execute, query } from "../../db";
import type { ValidatedContent } from "../content";
import {
  OrderExpired,
  OrderNotFound,
  OrderNotReady,
  OrderNotYours,
  SignatureAlreadyUsed,
  attachContent,
  getOrder,
  markPaid,
} from "../orders";
import { reserveRect } from "../reserve";

const BUYER = "BuyerPubkey1111111111111111111111111111111";
const STRANGER = "StrangerPubkey11111111111111111111111111111";
const CALLER = "d".repeat(64);

function content(overrides: Partial<ValidatedContent> = {}): ValidatedContent {
  const bytes = Buffer.from("fake-png-bytes");
  return {
    bytes,
    mime: "image/png",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    isAnimated: false,
    width: 100,
    height: 100,
    link: "https://example.com/",
    caption: "A caption",
    imageFit: "contain",
    ...overrides,
  };
}

async function hold(x = 0, y = 0, w = 10, h = 10) {
  return reserveRect({ x, y, w, h }, BUYER, CALLER);
}

/** Pushes a live hold's expiry into the past without touching anything else. */
async function expire(id: string): Promise<void> {
  await execute("UPDATE blocks SET expires_at = now() - interval '1 minute' WHERE id = $1", [id]);
}

describe("getOrder", () => {
  it("returns null for an id that does not exist", async () => {
    expect(await getOrder("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("returns a reserved order with its expiry and no content", async () => {
    const held = await hold();
    const order = await getOrder(held.id);
    expect(order).not.toBeNull();
    expect(order!.status).toBe("reserved");
    expect(order!.rect).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(order!.buyerPubkey).toBe(BUYER);
    expect(order!.totalBaseUnits).toBe(100_000_000);
    expect(order!.paymentBaseUnits).toBeGreaterThan(order!.totalBaseUnits);
    expect(order!.expiresAt).not.toBeNull();
    expect(order!.hasContent).toBe(false);
    expect(order!.caption).toBeNull();
  });

  it("reports hasContent once content is attached", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    const order = await getOrder(held.id);
    expect(order!.hasContent).toBe(true);
    expect(order!.caption).toBe("A caption");
    expect(order!.link).toBe("https://example.com/");
    expect(order!.imageFit).toBe("contain");
  });
});

describe("attachContent", () => {
  it("stores the bytes, the hash, the mime and the animated flag", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content({ isAnimated: true, mime: "image/gif" }));
    const rows = await query<{
      pending_image: Buffer;
      pending_image_mime: string;
      image_sha256: string;
      is_animated: boolean;
    }>(
      `SELECT pending_image, pending_image_mime, image_sha256, is_animated
         FROM blocks WHERE id = $1`,
      [held.id],
    );
    expect(rows[0].pending_image.toString()).toBe("fake-png-bytes");
    expect(rows[0].pending_image_mime).toBe("image/gif");
    expect(rows[0].image_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].is_animated).toBe(true);
  });

  it("refuses an order that does not exist", async () => {
    await expect(
      attachContent("00000000-0000-0000-0000-000000000000", BUYER, content()),
    ).rejects.toBeInstanceOf(OrderNotFound);
  });

  it("refuses content for an order belonging to a different pubkey", async () => {
    const held = await hold();
    await expect(attachContent(held.id, STRANGER, content())).rejects.toBeInstanceOf(OrderNotYours);
  });

  it("refuses content for an expired hold", async () => {
    const held = await hold();
    await expire(held.id);
    await expect(attachContent(held.id, BUYER, content())).rejects.toBeInstanceOf(OrderExpired);
  });

  it("replaces content when supplied twice before payment", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content({ caption: "First" }));
    await attachContent(held.id, BUYER, content({ caption: "Second" }));
    const order = await getOrder(held.id);
    expect(order!.caption).toBe("Second");
  });

  it("refuses content once the order is paid", async () => {
    // Content is editable right up to payment and never afterwards. This is the
    // line the whole product rests on.
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    await markPaid(held.id, BUYER, "sig-locked");
    await expect(attachContent(held.id, BUYER, content({ caption: "Nope" }))).rejects.toBeInstanceOf(
      OrderNotReady,
    );
  });
});

describe("markPaid", () => {
  it("moves reserved to paid and NULLS the expiry", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    const paid = await markPaid(held.id, BUYER, "sig-1");
    expect(paid.status).toBe("paid");
    expect(paid.expiresAt).toBeNull();

    const rows = await query<{ expires_at: Date | null; status: string }>(
      "SELECT expires_at, status FROM blocks WHERE id = $1",
      [held.id],
    );
    expect(rows[0].status).toBe("paid");
    expect(rows[0].expires_at).toBeNull();
  });

  it("records the payment signature", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    await markPaid(held.id, BUYER, "sig-recorded");
    const rows = await query<{ payment_signature: string }>(
      "SELECT payment_signature FROM blocks WHERE id = $1",
      [held.id],
    );
    expect(rows[0].payment_signature).toBe("sig-recorded");
  });

  it("survives the sweep once paid", async () => {
    // The property the whole retry story rests on: a paid order is never
    // reclaimed, however long the buyer takes from here.
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    await markPaid(held.id, BUYER, "sig-2");

    await execute(
      `DELETE FROM blocks WHERE status = 'reserved' AND (expires_at IS NULL OR expires_at <= now())`,
    );
    const still = await getOrder(held.id);
    expect(still?.status).toBe("paid");
  });

  it("refuses to mark paid an order with no content attached", async () => {
    const held = await hold();
    await expect(markPaid(held.id, BUYER, "sig-3")).rejects.toBeInstanceOf(OrderNotReady);
  });

  it("refuses a signature already used by another order", async () => {
    const a = await hold(0, 0);
    const b = await hold(20, 0);
    await attachContent(a.id, BUYER, content());
    await attachContent(b.id, BUYER, content());
    await markPaid(a.id, BUYER, "sig-shared");
    await expect(markPaid(b.id, BUYER, "sig-shared")).rejects.toBeInstanceOf(SignatureAlreadyUsed);
  });

  it("refuses an order belonging to a different pubkey", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    await expect(markPaid(held.id, STRANGER, "sig-4")).rejects.toBeInstanceOf(OrderNotYours);
  });

  it("refuses an expired hold", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    await expire(held.id);
    await expect(markPaid(held.id, BUYER, "sig-5")).rejects.toBeInstanceOf(OrderExpired);
  });

  it("is idempotent: re-marking with the same signature returns the same order", async () => {
    // The client can retry a confirm that timed out without being told its
    // order is already paid by somebody else.
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    const first = await markPaid(held.id, BUYER, "sig-same");
    const second = await markPaid(held.id, BUYER, "sig-same");
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("paid");
    expect(second.expiresAt).toBeNull();
  });

  it("refuses re-marking a paid order with a DIFFERENT signature", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    await markPaid(held.id, BUYER, "sig-first");
    await expect(markPaid(held.id, BUYER, "sig-second")).rejects.toBeInstanceOf(OrderNotReady);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/board/__tests__/orders.test.ts
```

Expected: FAIL, cannot resolve `../orders`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/board/orders.ts`. Requirements the tests pin down, restated so nothing is inferred:

- `getOrder` selects one row and maps it. `hasContent` is `pending_image IS NOT NULL`. `paymentBaseUnits` is `total_usdc + payment_fraction`. A `removed` or `minted` row is out of scope for this batch — return it as-is rather than inventing a status.
- Every mutating function loads the row first and throws, in this order: `OrderNotFound`, then `OrderNotYours` (pubkey mismatch), then `OrderExpired` (status `reserved` and `expires_at <= now()`), then the operation's own precondition. The order matters — a stranger must not learn whether somebody else's hold expired.
- `attachContent` requires `status = 'reserved'`; anything else is `OrderNotReady`.
- `markPaid` requires content attached (`OrderNotReady` otherwise) and sets `status='paid'` **and** `expires_at=NULL` in ONE `UPDATE`. The `blocks_paid_never_expires` CHECK from Task 1 rejects any statement setting one without the other, which is the point of having it.
- `markPaid` is idempotent for the same signature: if the row is already `paid` with `payment_signature` equal to the argument, return it. If it is already `paid` with a different signature, throw `OrderNotReady`.
- A `23505` on `blocks_payment_signature_unique` becomes `SignatureAlreadyUsed`. Use `isUniqueViolation` and `violatedConstraint` from `src/lib/db.ts` rather than matching on the message.

Create `src/lib/board/payment-stub.ts`:

```ts
import type { Order } from "./orders";

/**
 * The payment step, until batch 3 makes it real.
 *
 * This verifies nothing. It exists so the state machine, the dialog and the
 * confirmation screen can be built and driven end to end before a wallet, a
 * treasury or an RPC proxy exist. Batch 3 replaces this module wholesale with
 * an on-chain USDC verifier; the call site does not change.
 *
 * It is gated on an environment flag that fails startup in production, so the
 * route that uses it does not merely refuse there — it does not exist.
 */
export function stubPaymentsAllowed(): boolean {
  return process.env.ALLOW_STUB_PAYMENTS?.trim() === "true";
}

export async function stubVerifyPayment(
  order: Order,
): Promise<{ ok: true; signature: string } | { ok: false; reason: string }> {
  if (!stubPaymentsAllowed()) {
    return { ok: false, reason: "Stub payments are not enabled." };
  }
  if (!order.hasContent) {
    return { ok: false, reason: "This order has no content yet." };
  }
  return { ok: true, signature: `stub-${order.id}` };
}
```

- [ ] **Step 4: Add the production guard**

In `src/lib/config.ts`, add a check that throws when `NODE_ENV === "production"` and `ALLOW_STUB_PAYMENTS` is set, with a message saying what it would mean: anyone could mark any order paid without sending money. Add `ALLOW_STUB_PAYMENTS` to `.env.example` commented out, with a note that it exists only until batch 3 lands.

Set `ALLOW_STUB_PAYMENTS=true` in `.env.local` so the tests and local dev can use it.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -- src/lib/board/__tests__/orders.test.ts
npx tsc --noEmit
npm run lint
```

Expected: PASS, 18 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/board/orders.ts src/lib/board/payment-stub.ts src/lib/board/__tests__/orders.test.ts src/lib/config.ts .env.example
git commit -m "Take an order from held to paid, and make a paid order unexpirable"
```

---

### Task 6: The four endpoints

**Files:**
- Create: `src/app/api/reserve/route.ts`, `src/app/api/orders/[id]/route.ts`, `src/app/api/orders/[id]/content/route.ts`, `src/app/api/orders/[id]/confirm/route.ts`
- Modify: `src/lib/http.ts`
- Test: `src/app/api/__tests__/reserve.test.ts`, `src/app/api/__tests__/orders-api.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2-5.
- Produces:
  - In `src/lib/http.ts`: `identify(request: Request): { ok: true; ipHash: string } | { ok: false; message: string }`, and `problem(status: number, message: string, extra?: Record<string, unknown>): Response`
  - `POST /api/reserve`, `GET /api/orders/[id]`, `POST /api/orders/[id]/content`, `POST /api/orders/[id]/confirm`

**READ THE NEXT 16 DOCS FIRST.** Two things in this task are where training-data recall goes wrong: how dynamic route `params` is typed (in recent Next it is a `Promise` you must await), and the request body APIs. Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and the dynamic-routes guide before writing anything, and say in your report what they told you.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/__tests__/reserve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { execute } from "../../../lib/db";
import { RESERVATION_LIMITS } from "../../../lib/callers/limits";
import { POST } from "../reserve/route";

const BUYER = "BuyerPubkey1111111111111111111111111111111";

function request(body: unknown, ip = "203.0.113.7"): Request {
  return new Request("http://localhost/api/reserve", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reserve", () => {
  it("holds a free rectangle and returns its price and expiry", async () => {
    const response = await POST(request({ rect: { x: 0, y: 0, w: 20, h: 20 }, buyerPubkey: BUYER }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.pixels).toBe(400);
    expect(body.totalBaseUnits).toBe(400_000_000);
    expect(body.paymentBaseUnits).toBeGreaterThan(body.totalBaseUnits);
    expect(typeof body.id).toBe("string");
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("is never cached", async () => {
    const response = await POST(request({ rect: { x: 0, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 409, not 500, when the pixels were just taken", async () => {
    await POST(request({ rect: { x: 0, y: 0, w: 20, h: 20 }, buyerPubkey: BUYER }));
    const second = await POST(
      request({ rect: { x: 10, y: 10, w: 20, h: 20 }, buyerPubkey: BUYER }, "203.0.113.8"),
    );
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(typeof body.message).toBe("string");
  });

  it("answers 400 for a rectangle off the grid", async () => {
    const response = await POST(request({ rect: { x: 5, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }));
    expect(response.status).toBe(400);
  });

  it("answers 400 for a malformed body", async () => {
    for (const body of [{}, { rect: {} }, { rect: { x: 0, y: 0, w: 10, h: 10 } }, { buyerPubkey: BUYER }]) {
      const response = await POST(request(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("answers 429 with a retry-after once the caller's ceiling is reached", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      const ok = await POST(request({ rect: { x: i * 30, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }));
      expect(ok.status).toBe(201);
    }
    const refused = await POST(request({ rect: { x: 500, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).not.toBeNull();
  });

  it("counts callers separately", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      await POST(request({ rect: { x: i * 30, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }, "198.51.100.1"));
    }
    const other = await POST(
      request({ rect: { x: 500, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }, "198.51.100.2"),
    );
    expect(other.status).toBe(201);
  });

  it("refuses a caller with no trustworthy address", async () => {
    const anonymous = new Request("http://localhost/api/reserve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rect: { x: 0, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }),
    });
    const response = await POST(anonymous);
    expect([400, 429]).toContain(response.status);
  });
});
```

**Note for the implementer:** the last test depends on `ALLOW_UNTRUSTED_CLIENT_IP`. Set it in `.env.local` for local development, and make the test explicit about which behaviour it expects under the value the suite runs with — do not leave it ambiguous.

Create `src/app/api/__tests__/orders-api.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { execute } from "../../../lib/db";
import { reserveRect } from "../../../lib/board/reserve";
import { GET } from "../orders/[id]/route";
import { POST as POST_CONTENT } from "../orders/[id]/content/route";
import { POST as POST_CONFIRM } from "../orders/[id]/confirm/route";

const BUYER = "BuyerPubkey1111111111111111111111111111111";
const STRANGER = "StrangerPubkey11111111111111111111111111111";
const CALLER = "e".repeat(64);

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .png()
    .toBuffer();
}

async function contentRequest(overrides: Record<string, string> = {}, bytes?: Buffer) {
  const form = new FormData();
  form.set("image", new Blob([bytes ?? (await png())], { type: "image/png" }), "block.png");
  form.set("link", overrides.link ?? "https://example.com/");
  form.set("caption", overrides.caption ?? "A caption");
  form.set("imageFit", overrides.imageFit ?? "contain");
  form.set("buyerPubkey", overrides.buyerPubkey ?? BUYER);
  return new Request("http://localhost/api/orders/x/content", { method: "POST", body: form });
}

function confirmRequest(buyerPubkey = BUYER) {
  return new Request("http://localhost/api/orders/x/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ buyerPubkey }),
  });
}

describe("GET /api/orders/:id", () => {
  it("returns 404 for an unknown id", async () => {
    const response = await GET(new Request("http://localhost/"), ctx("00000000-0000-0000-0000-000000000000"));
    expect(response.status).toBe(404);
  });

  it("returns the order's state and never caches it", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const response = await GET(new Request("http://localhost/"), ctx(held.id));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.status).toBe("reserved");
    expect(body.hasContent).toBe(false);
  });
});

describe("POST /api/orders/:id/content", () => {
  it("accepts a valid image, link and caption", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const response = await POST_CONTENT(await contentRequest(), ctx(held.id));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.hasContent).toBe(true);
    expect(body.caption).toBe("A caption");
  });

  it("reports EVERY rejected field at once, not just the first", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const bad = await contentRequest(
      { link: "javascript:alert(1)", caption: "x".repeat(99) },
      Buffer.from("not an image"),
    );
    const response = await POST_CONTENT(bad, ctx(held.id));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.rejections.map((r: { field: string }) => r.field).sort()).toEqual([
      "caption",
      "image",
      "link",
    ]);
  });

  it("answers 403 when a different pubkey tries to attach content", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const response = await POST_CONTENT(await contentRequest({ buyerPubkey: STRANGER }), ctx(held.id));
    expect(response.status).toBe(403);
  });

  it("answers 410 for an expired hold", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    await execute("UPDATE blocks SET expires_at = now() - interval '1 minute' WHERE id = $1", [held.id]);
    const response = await POST_CONTENT(await contentRequest(), ctx(held.id));
    expect(response.status).toBe(410);
  });

  it("answers 404 for an unknown order", async () => {
    const response = await POST_CONTENT(
      await contentRequest(),
      ctx("00000000-0000-0000-0000-000000000000"),
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /api/orders/:id/confirm", () => {
  it("marks a described order paid and clears its expiry", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    await POST_CONTENT(await contentRequest(), ctx(held.id));
    const response = await POST_CONFIRM(confirmRequest(), ctx(held.id));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("paid");
    expect(body.expiresAt).toBeNull();
  });

  it("refuses an order with no content", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const response = await POST_CONFIRM(confirmRequest(), ctx(held.id));
    expect(response.status).toBe(409);
  });

  it("answers 403 for a different pubkey", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    await POST_CONTENT(await contentRequest(), ctx(held.id));
    const response = await POST_CONFIRM(confirmRequest(STRANGER), ctx(held.id));
    expect(response.status).toBe(403);
  });

  it("does not exist at all when stub payments are disabled", async () => {
    // Not "refuses" — 404. In production this route must be indistinguishable
    // from a route that was never deployed.
    const previous = process.env.ALLOW_STUB_PAYMENTS;
    delete process.env.ALLOW_STUB_PAYMENTS;
    try {
      const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
      const response = await POST_CONFIRM(confirmRequest(), ctx(held.id));
      expect(response.status).toBe(404);
    } finally {
      if (previous !== undefined) process.env.ALLOW_STUB_PAYMENTS = previous;
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- src/app/api/__tests__/reserve.test.ts src/app/api/__tests__/orders-api.test.ts
```

Expected: FAIL, cannot resolve the route modules.

- [ ] **Step 3: Extend `src/lib/http.ts`**

```ts
import { clientIp, hashIp } from "./callers/client-ip";

/**
 * Who is calling, in one place.
 *
 * Fails closed on the address: without a trustworthy one there is no rate
 * limit, and a shared bucket for every anonymous caller is either an unlimited
 * allowance or a self-inflicted outage. The operational reason goes to the
 * server log, never to the caller.
 */
export type Caller = { ok: true; ipHash: string } | { ok: false; message: string };

export function identify(request: Request): Caller {
  const identity = clientIp(request);
  if (!identity.ok) {
    console.error(`identify: ${identity.reason}`);
    return { ok: false, message: "This request could not be verified. Please try again." };
  }
  return { ok: true, ipHash: hashIp(identity.ip) };
}

/** An error response with a message the client can render as-is. */
export function problem(
  status: number,
  message: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return json({ message, ...extra }, { status, headers: { ...NO_STORE, ...headers } });
}
```

- [ ] **Step 4: Write the four routes**

`src/app/api/reserve/route.ts`:

```ts
import { reserveRect, RectangleInvalid, RectangleTaken } from "../../../lib/board/reserve";
import { checkReservationLimits } from "../../../lib/callers/limits";
import { NO_STORE, identify, json, problem } from "../../../lib/http";

/**
 * Hold a rectangle for thirty minutes.
 *
 * A 409 here is an ordinary outcome, not a failure: two people wanted the same
 * pixels and Postgres picked one. It must never surface as a 500.
 */
export async function POST(request: Request): Promise<Response> {
  const caller = identify(request);
  if (!caller.ok) return problem(400, caller.message);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "That request body is not JSON.");
  }

  const parsed = parseReserveBody(body);
  if (!parsed) return problem(400, "A rectangle and a wallet address are required.");

  const limit = await checkReservationLimits(caller.ipHash);
  if (!limit.ok) {
    const seconds = Math.max(1, Math.ceil((Date.parse(limit.retryAt) - Date.now()) / 1000));
    return problem(429, limit.message, { retryAt: limit.retryAt }, { "retry-after": String(seconds) });
  }

  try {
    const held = await reserveRect(parsed.rect, parsed.buyerPubkey, caller.ipHash);
    return json(held, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof RectangleTaken) return problem(409, "Those pixels were just taken.");
    if (error instanceof RectangleInvalid) return problem(400, "That is not a rectangle this board can sell.");
    throw error;
  }
}

function parseReserveBody(body: unknown): { rect: { x: number; y: number; w: number; h: number }; buyerPubkey: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const { rect, buyerPubkey } = body as Record<string, unknown>;
  if (typeof buyerPubkey !== "string" || buyerPubkey.trim() === "") return null;
  if (typeof rect !== "object" || rect === null) return null;
  const { x, y, w, h } = rect as Record<string, unknown>;
  if (![x, y, w, h].every((n) => typeof n === "number" && Number.isInteger(n))) return null;
  return { rect: { x: x as number, y: y as number, w: w as number, h: h as number }, buyerPubkey };
}
```

The other three follow the same shape. Requirements, not code, because they are mechanical once the above is written:

- **`GET /api/orders/[id]`** — `getOrder`, 404 when null, `no-store`. Never returns `pending_image`; the bytes are not the client's business and would balloon the response.
- **`POST /api/orders/[id]/content`** — read `request.formData()`, pull `image` (a `File`/`Blob`), `link`, `caption`, `imageFit`, `buyerPubkey`. Convert the blob with `Buffer.from(await file.arrayBuffer())`. Call `validateContent`, and on failure return **422** with the whole `rejections` array. On success call `attachContent` and return the order. Map `OrderNotFound`→404, `OrderNotYours`→403, `OrderExpired`→410, `OrderNotReady`→409.
- **`POST /api/orders/[id]/confirm`** — **first line: if `!stubPaymentsAllowed()` return 404**, before looking anything up. Then `getOrder`, the same error mapping, then `stubVerifyPayment`, then `markPaid` with the returned signature.

Every route is `no-store`. Every route maps a known domain error to a status and lets an unknown one throw.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- src/app/api/__tests__/
npx tsc --noEmit
npm run lint
```

Expected: PASS, 8 reserve tests and 12 order-API tests, plus the batch 1 board test still green.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ src/lib/http.ts
git commit -m "Expose holding, describing and confirming an order over HTTP"
```

---

### Task 7: The purchase dialog

**Files:**
- Create: `src/components/PurchaseDialog.tsx`, `src/components/ContentForm.tsx`, `src/components/ConfirmationStep.tsx`, `src/components/HoldTimer.tsx`, `src/lib/board/purchase-client.ts`
- Modify: `src/components/SelectionPanel.tsx`, `src/components/BoardView.tsx`

**Interfaces:**
- Consumes: the four endpoints; `Selection` from `./selection`; `formatUsdc` from `./pricing`.
- Produces:
  - In `src/lib/board/purchase-client.ts`: `type ClientOrder`, `createHold(rect, buyerPubkey)`, `submitContent(orderId, form)`, `confirmOrder(orderId, buyerPubkey)`, `fetchOrder(orderId)` — each returning `{ ok: true; order } | { ok: false; status; message; rejections? }`.
  - `<PurchaseDialog selection buyerPubkey onClose onPurchased />`

**No unit tests for the components**, for the reason argued in batch 1's plan: everything they decide is tested, and what remains is DOM plumbing. `purchase-client.ts` is the exception — it is pure request/response mapping and it DOES get a test with a stubbed `fetch`.

- [ ] **Step 1: Write `purchase-client.ts` test first**

Create `src/lib/board/__tests__/purchase-client.test.ts` with a stubbed `globalThis.fetch`, covering: a 201 becoming `{ok: true}`; a 409 becoming `{ok: false, status: 409}` with the server's message preserved; a 422 carrying `rejections` through; a 429 preserving `retryAt`; and a network throw becoming `{ok: false}` rather than an unhandled rejection. Restore `fetch` in `afterEach`.

- [ ] **Step 2: Write the four components**

**`HoldTimer`** — counts down to `expiresAt`, rendered inside the control it gates rather than as a separate widget, following batch 1's precedent. `HH:MM:SS` above a minute, seconds below. At zero it calls `onExpired`. Update every 500 ms above one minute and every 100 ms below, so a countdown nobody is staring at does not run a per-frame timer.

**`ContentForm`** — file input (`accept="image/png,image/jpeg,image/webp,image/gif"`), link, caption (`maxLength={32}` with a live counter), and a contain/cover choice. Each field carries its own permanence warning **directly under the input**. Render a local `URL.createObjectURL` preview and revoke it on unmount. On a 422, mark every field named in `rejections` and show its reason beside that field.

**`ConfirmationStep`** — the rectangle and its position, the image preview at the fit that was chosen, the link, the caption, the pixel count and the total. One explicit sentence that none of it can ever be changed, in your own words. A back button and a confirm button. **Do not collapse this into the form**; it is the highest-value screen in the flow.

**`PurchaseDialog`** — holds the step machine (`holding → describing → confirming → paying → done`), the order, and the error. Opening it calls `createHold`. A 409 closes it and asks the parent to refresh the board. `Escape` and a backdrop click close it, but only with a confirmation once the hold exists, since closing abandons a live hold.

**`SelectionPanel`** — the Buy button stops being inert and calls `onBuy`. It stays disabled when the selection is not buyable.

**`BoardView`** — owns `buyerPubkey` (a plain text input in this batch, labelled as temporary until the wallet arrives in batch 3), opens the dialog, and refreshes the board from `/api/board` after a hold or a purchase.

**Copy rules, restated because this is where it went wrong before:** every string is yours. Do not reach for a phrasing because it sounds familiar — familiar is the failure mode. Nothing in this repo may echo another pixel-selling site.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npm run lint
npm test
```

All clean, the existing suite unchanged plus the `purchase-client` tests.

- [ ] **Step 4: Commit**

```bash
git commit -m "Let a buyer hold a rectangle, describe it, and confirm what becomes permanent"
```

---

### Task 8: Wire it, and verify by using it

**Files:**
- Modify: `src/components/BoardView.tsx`, `src/app/page.tsx` if needed

- [ ] **Step 1: Wire it end to end**

The Buy button opens the dialog; a successful hold re-fetches `/api/board` so the held rectangle renders as taken; a completed purchase re-fetches again and clears the selection.

- [ ] **Step 2: Verify group (a) yourself, and quote the evidence**

- `npx tsc --noEmit` clean — quote the output
- `npm run lint` clean
- `npm test` green — state the count
- `npm run build` succeeds and `/` is still dynamic — quote the route table line
- With `next dev` running, drive the whole flow with `curl` and show each response:
  1. `POST /api/reserve` → 201, capture the id
  2. `POST /api/orders/:id/content` with a real small PNG → 200, `hasContent: true`
  3. `POST /api/orders/:id/confirm` → 200, `status: "paid"`, `expiresAt: null`
  4. `GET /api/board` → the rectangle now appears among the blocks
- `POST /api/reserve` for an overlapping rectangle → **409**, and show the body
- Unset `ALLOW_STUB_PAYMENTS`, restart, and show `POST /api/orders/:id/confirm` → **404**

- [ ] **Step 3: Write the group (b) checklist for a human**

Numbered, with the exact expected result for each, covering at least: dragging a rectangle and buying it; the countdown appearing and ticking; letting a hold expire and watching the pixels return to the board; submitting a broken image with a bad link and an over-long caption and seeing all three fields marked at once; reaching the confirmation screen and reading back exactly what was entered; closing the dialog with a live hold and being asked to confirm; and a second browser tab seeing the held rectangle as unavailable.

**Do not claim to have run these.** Do not install browser automation.

- [ ] **Step 4: Commit**

```bash
git commit -m "Wire the purchase flow into the board"
```

---

## What this batch deliberately does not do

- **No real payment.** `stubVerifyPayment` is a stand-in behind a flag that fails startup in production. The on-chain USDC verifier, the pubkey binding against a real transfer, and `/api/rpc` are batch 3.
- **No wallet.** `buyerPubkey` is a string the client supplies. Nothing signs anything.
- **No mint, no Arweave, no keypair.** Batch 4. `image_arweave_id`, `metadata_arweave_id`, `mint_address` and `owner_wallet` exist as columns and stay null.
- **No composite image.** Held and paid rectangles render as flat colour, as in batch 1. The `sharp` compositing path arrives when a block has a real image on the board.
- **No admin, no moderation, no reports, no featured slot.** Batches 6-8.
- **No polling.** The board is still fetched once per page load. The dialog polls its own order; the board does not.
