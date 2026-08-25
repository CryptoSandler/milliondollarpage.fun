# milliondollarpage.fun — design

A Million Dollar Homepage on Solana. One 1000×1000 canvas, 1,000,000 pixels,
sold once, in USDC, at a flat configurable price. Every purchased block is a
Metaplex Core NFT the buyer owns and can resell. The image, link and caption of
a block are fixed at purchase and can never be changed by anyone — not the
buyer, not us.

The domain is the brand. There is no token.

Read [references.md](../../references.md) first: it records what the 2005
original and three Solana imitators actually do, and several decisions below are
justified there rather than restated here.

## 1. What this is

| | |
| --- | --- |
| Canvas | 1000×1000, one board, never expanded |
| Grid | 10×10 blocks; a purchase is a rectangle snapped to that grid |
| Minimum | 10×10 = 100 pixels |
| Price | Flat per pixel, configurable in admin. **Default $1.** No premium zones, no tiers |
| Currency | USDC on Solana mainnet |
| Ownership | One Metaplex Core NFT per block, in one collection. Transferable, sellable |
| Royalty | 5%, Royalties plugin, **no ProgramAllowList** |
| Content | Image + link + caption, fixed forever at purchase |
| Storage | Arweave via Irys, 100 KiB hard cap per file |

### Non-goals

No token. No auction endgame. No canvas expansion. No per-block editing, paid or
otherwise. No chat, no mascot, no accounts. No custom Solana program in v1 — see
§14 for the integrity gap that decision leaves open.

## 2. Inheritance

This project copies and adapts; it does not reinvent. Two ancestors:

| From | What we take |
| --- | --- |
| `pixelwar` | Next 16 + Postgres (Neon) + Vercel shape, `src/lib/db.ts`, `src/lib/http.ts`, `src/lib/config.ts`, the migration runner (`scripts/migrate.mts`), the two-database test discipline (`DATABASE_URL` vs `TEST_DATABASE_URL`), IP hashing with `RATE_LIMIT_SALT`, flat-index board state |
| `outbid-tokens` | The entire payments layer: `src/lib/payments/*` (verifier, signature binding, unique amounts, limits, pending, reconcile), the admin console and `ADMIN_TOKEN` auth, the audit log, `/api/reconcile`, `src/lib/startup-check.ts`, the dynamic OG route |

`pixelwar`'s payment and admin batches never ran, so `outbid-tokens` is the
source for both. Where the two disagree on a shared utility, `pixelwar`'s
version wins — it is the later reading of the same idea.

**One inherited comment must change.** `outbid-tokens/src/lib/payments/config.ts`
opens with "there is no private key, no signing and no withdrawal path anywhere
in this project." That is no longer true here, and the replacement must say
exactly what is true instead: the payment wallet still only ever receives and is
operated entirely outside this codebase; a *separate* keypair exists that signs
but can never hold or move value. See §12.

## 3. Data model

Postgres. All money in integer base units, never floats.

### `blocks`

The board. One row per rectangle, whatever its state.

| Column | Notes |
| --- | --- |
| `id` | uuid |
| `x_range`, `y_range` | `int4range`, half-open, GiST-indexed. Pixel coordinates. A 10×10 block at the origin is `[0,10)` × `[0,10)` |
| `x, y, w, h` | Pixel coordinates, denormalised for reads and for NFT attributes |
| `status` | `reserved` \| `paid` \| `minted` \| `removed` |
| `buyer_pubkey` | Bound at reservation. The only wallet that may pay and mint |
| `price_per_pixel_usdc` | Snapshotted at reservation so a settings change cannot move a live order |
| `total_usdc` | Base units |
| `payment_fraction` | Unique-amount attribution, inherited from outbid-tokens |
| `payment_signature` | Unique. Set on verification; prevents one transfer paying twice |
| `expires_at` | Set at reservation. **Nulled when the order is paid** |
| `image_arweave_id`, `metadata_arweave_id` | Set after upload |
| `image_sha256` | Computed server-side pre-upload, re-verified post-upload |
| `link`, `caption` | `caption` capped at 32 chars |
| `image_fit` | `contain` \| `cover` |
| `is_animated` | Whether the paid GIF upgrade was bought |
| `mint_address` | Unique, not null once `minted` |
| `owner_wallet` | Synced from chain; differs from `buyer_pubkey` after a resale |
| `removed_reason`, `removed_at` | Moderation |

**Overlap is a database invariant, not application logic:**

```sql
ALTER TABLE blocks ADD CONSTRAINT blocks_no_overlap
  EXCLUDE USING gist (x_range WITH &&, y_range WITH &&)
  WHERE (status IN ('reserved', 'paid', 'minted'));
```

Two `int4range` columns rather than one `box`, for a reason that was verified
against a real Postgres before it was written down: **`box &&` reports two boxes
that merely share an edge as overlapping.** Every block on a full board touches
its neighbours, so a `box` constraint would have rejected the second block ever
sold and every block after it. `int4range` is half-open and exact — `[0,10)` and
`[10,20)` do not overlap, `[0,10)` and `[5,15)` do — and a two-column exclusion
constraint conflicts only when *both* ranges overlap, which is precisely
rectangle intersection. Neither column needs `btree_gist`; `status` appears only
in the predicate, never as an operator column.

`removed` is excluded so a moderated block's rectangle returns to the board.

An exclusion constraint cannot reference `now()`, so expiry cannot live in the
`WHERE`. Instead every reservation transaction begins by sweeping:

```sql
DELETE FROM blocks WHERE status = 'reserved' AND expires_at <= now();
```

That runs inside the same transaction as the insert, so the sweep and the
constraint see the same snapshot. A cron sweep also runs, purely to keep the
table tidy — correctness does not depend on it.

### Other tables

- `settings` — key/value, every price and limit. No hardcoded defaults except
  those named in this spec. Every write audited.
- `audit_log` — inherited shape: actor, action, target, reason, timestamp.
- `reports` — `block_id`, reason (fixed list + free text), `ip_hash`, status.
- `featured` — the 24-hour slot queue. See §10.
- `board_versions` — monotonic counter bumped on every mint and every removal;
  drives cache busting for the composite image.
- `rate_limits` — inherited, keyed on `ip_hash`.

## 4. Rendering the board

The single biggest performance decision. A million pixels and eventually
thousands of images cannot be thousands of `<img>` tags.

**The board becomes one composite PNG.** A server job renders every `minted`
block into a single 1000×1000 PNG with `sharp`, honouring each block's
`image_fit`. Animated blocks contribute their first frame. The result is stored
as `bytea` and served from `/api/board.png?v=<board_version>` with an immutable,
long-lived cache header.
Because the version is in the URL, a new mint busts the CDN by changing the URL
rather than by invalidating anything.

**Animated blocks are additionally overlaid.** A GIF cannot animate inside a
static PNG, so each animated block is *also* rendered as one absolutely-positioned
`<img>` on top of the composite. Its first frame is already underneath, so an
overlay that fails to load degrades to a still image rather than a hole. This
scales because animated blocks are a paid upgrade and therefore a small
minority; if that stops being true, the cap on animated blocks becomes a
setting.

**Hover and click come from a rectangle index**, not the image:
`/api/blocks?v=<board_version>` returns `{x, y, w, h, caption, link, mint}` for
every live block, cached identically. Hover shows the caption; click opens the
link in a new tab with `rel="noopener noreferrer nofollow ugc"`.

Regeneration happens on mint and on removal, in the same job that bumps
`board_versions`. It is idempotent and safe to re-run; if it fails, the previous
composite keeps serving and the board is briefly one block stale. That is the
correct failure mode — never a broken board.

## 5. The selector

From [references.md](../../references.md) §"What we adopt":

- **Preset bundles beside freehand drag**, each showing pixels and price:
  10×10, 20×20, 50×50, 100×100. Presets teach the pricing model in one glance;
  freehand alone is a worse first experience.
- **Snap to the 10-pixel grid**, always.
- **A red overlay marks collisions** with sold blocks and live reservations. The
  Buy button is simply unavailable while the selection intersects one — no error
  message, because the overlay already said it.
- **A running total** under the live selection: `N pixels · $X`.
- **A persistent interaction legend**, in two variants, pointer and touch.
- **Three counters** on the home page: `N / 1,000,000 pixels`, percentage to
  four decimals, and block count.
- **Current price** displayed on the home page, read from settings.

## 6. Purchase: the state machine

Four steps, three of them signed by the buyer's wallet. The buyer signs **twice**
(payment, mint); the server co-signs the mint and signs the uploads.

```
reserved ──pay──> paid ──upload──> paid+stored ──mint──> minted
   │
   └──expires (30 min)──> swept
```

### Step 1 — Reserve (no signature)

`POST /api/reserve` with a rectangle and the connected pubkey. The server
sweeps expired reservations, validates the rectangle (on-grid, in bounds, at
least 10×10), snapshots the current price, draws a unique payment fraction, and
inserts with `status='reserved'` and `expires_at = now() + 30 minutes`. The GiST
constraint is what makes this race-free; a `23P01` is reported as "those pixels
were just taken", not as a 500.

Rate limited per `ip_hash`, inheriting outbid-tokens' two ceilings: live
unpaid reservations per caller, and reservations created per rolling window.

### Step 2 — Content, validated before payment

The buyer supplies image, link, caption, and `image_fit` *before* paying, so a
rejected image never costs money — the original's rule, restated in §11. The
server validates: MIME type against magic bytes (not the declared header),
dimensions, byte size against the 100 KiB cap, link scheme (`https:` only), and
caption length. If the block is animated it must have bought the GIF upgrade,
and it is additionally checked against the animation limits in §8.1; if it is
not animated, a purchased upgrade is refunded rather than silently kept. It computes `image_sha256` and holds the bytes.

A **final confirmation screen** lists the rectangle, price, image, link, caption
and fit, with an explicit statement that none of it can ever be changed. Per-field
permanence warnings sit under each input, not in a terms section.

### Step 3 — Pay (buyer signature 1)

Standard inherited flow: an exact-amount USDC transfer to the treasury wallet,
attributed by the unique fraction and **bound to `buyer_pubkey`** — a transfer
from any other wallet does not settle this order. `POST /api/blocks/:id/verify`
reads the transaction through the `/api/rpc` proxy, checks mint, destination,
amount, sender and finality, and on success sets `status='paid'`, records
`payment_signature`, and **sets `expires_at = NULL`**.

**A paid reservation never expires.** This is the rule that makes the rest of
the flow safe to retry.

### Step 4 — Store, then mint (buyer signature 2)

On the first mint attempt the server uploads the image and then the metadata
JSON to Arweave via Irys, signing with the server keypair (§12). Both are under
100 KiB, so both are free and the keypair never needs funds. The server then
re-fetches the image from the gateway and verifies `image_sha256` matches what
it validated; a mismatch fails the step and stores nothing.

The server then builds the mint transaction, partially signs it as the
collection authority, and returns it for the buyer to sign and submit. The buyer
is fee payer and pays the asset's rent.

The transaction contains, atomically:

1. `createV1` — the Core asset, into the collection, owner = buyer.
2. The plugins in §7.
3. A SOL transfer of `PLATFORM_FEE_LAMPORTS` to the treasury.

On confirmation the server records `mint_address`, sets `status='minted'`,
bumps `board_versions` and queues the composite regeneration.

### Retry, forever

If anything after payment fails — upload, signature rejected, transaction
dropped, browser closed, laptop thrown into the sea — the order stays `paid`
with its rectangle held and its content stored. The buyer reconnects the same
wallet and resumes; the mint can be retried without limit and without paying
again. Arweave uploads are content-addressed and re-uploading is idempotent, so
a retry after a partial upload costs nothing and changes nothing.

`/api/reconcile` sweeps `paid` orders that have no `mint_address` and surfaces
them in the admin console. A payment that settles without a block reaching the
board is always repairable.

## 7. The NFT

Metaplex Core (`CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d`). One collection
for the whole page, created once, off-band, and recorded in `COLLECTION_ADDRESS`.

**Metadata.** Name is the block's coordinates and size. The off-chain JSON
carries the image, the link, the caption, and attributes for `x`, `y`, `width`,
`height`, `pixels`, and `image_fit`. The rectangle lives in the asset's
attributes so a duplicate claim on the same pixels is publicly detectable and
provably second — see §14.

**Plugins at creation, all three mandatory:**

| Plugin | Config | Why |
| --- | --- | --- |
| `Royalties` | 500 bp (5%), `ruleSet('None')` | 5%, and **no ProgramAllowList**: an allowlist restricts which programs may transfer, which is exactly how a block gets stranded when a marketplace is missing from a list nobody remembered to update. Advisory royalties that always move beat enforced royalties that can trap an owner. Added at the **asset** level with its plugin authority removed, so the 5% can never be changed afterwards — not by us either |
| `ImmutableMetadata` | — | Permanently locks name and URI. This is what makes "the content can never change" true on-chain rather than a promise |
| `AddBlocker` | — | **Non-negotiable.** Without it, the collection's update authority — which is our server keypair, and which becomes the asset's update authority once the asset is in the collection — could later add authority-managed plugins to a buyer's asset, including `PermanentTransferDelegate`. That would turn a key we described as "cannot touch value" into a key that can move somebody's block. `AddBlocker` closes that path at mint |

Together these mean the server keypair, if stolen, cannot change any minted
block's image, link or caption, cannot alter its royalty, and cannot gain
transfer rights over it. See SECURITY.md.

## 8. Storage

Arweave via Irys, signed by the server keypair.

- **100 KiB hard cap per file**, GIF included. Irys uploads under 100 KiB are
  free, so this cap is what keeps the server keypair permanently unfunded —
  it is a security control, not a storage-cost decision, and must be enforced
  server-side before any upload is attempted.
- Two uploads per block: the image, then the metadata JSON referencing it.
- Content is verified by hash after upload, before the block is considered
  storable (§6 step 4).
- Gateway reads go through `https://gateway.irys.xyz/<id>`. The composite
  renderer reads from the stored bytes, not the gateway, so board rendering
  never depends on a third party being up.

### 8.1 The animated GIF upgrade

A per-block paid upgrade, chosen **at purchase** like everything else, never
added afterwards. Price from settings. An animated block is bound by three
limits, all settings, all enforced before upload:

| Limit | Why |
| --- | --- |
| Byte size | The 100 KiB cap already applies and is the binding constraint for most GIFs |
| Dimensions | An animation larger than its rectangle is wasted bytes; the block renders at its purchased size |
| Duration | An unbounded loop next to fifty others is a board nobody can look at |

An upgrade is a property of the block, recorded in `is_animated`, and is
therefore as permanent as the image it applies to.

## 9. Ownership sync

The buyer is not necessarily the owner. Blocks are transferable, so `owner_wallet`
must track the chain.

A job inside the existing `/api/reconcile` cron calls DAS `getAssetsByGroup` on
the collection, pages through it, and updates `owner_wallet` where it differs.
One call set for the whole board, no per-mint queries — this is the concrete
benefit of having accepted a real collection and its server-signature cost.

Ownership affects nothing about how a block renders. Image, link and caption are
immutable, so a resale changes who owns the asset and who receives nothing else.
Owner is displayed on the block detail view and is the field a future secondary
market feature would build on.

## 10. Featured slot

A paid 24-hour placement above the grid, included in the dynamic OG image.

- Price from settings. Duration 24 hours, configurable.
- **FIFO queue, paid-first-served.** Payment is what takes a place in the queue;
  the slot starts when the previous one ends. The queue and each entry's
  projected start time are public, so a buyer knows what they are buying.
- Paid in USDC through the same verifier as a block purchase.
- A featured entry points at an existing minted block. It never grants any right
  to change that block's content.
- The OG image route is inherited from outbid-tokens and regenerated when the
  active slot changes.

## 11. Public rules and refund policy

Published as a rules page, structured as titled cards, each a single claim. It
must state, in our own words:

1. **Flat price, first come first served.** No premium zones.
2. **10×10 minimum**, and why: anything smaller cannot be seen or clicked.
3. **Content is permanent.** Image, link and caption are fixed at purchase and
   cannot be changed by anyone, including us, including for a fee.
4. **The block is yours and is transferable.** It is an NFT; you can sell it.
   Royalty is 5%. This is the sentence the nearest competitor cannot write.
5. **Rejected before publication is refunded; removed after publication is not.**
   Inherited from the 2005 original, which got this right the first time.
6. **Link rot is the buyer's problem.** A link that dies is not our maintenance
   obligation, and a dead link is not grounds for a change or a refund.
7. **Prohibited content**: illegal material, scams, phishing, malware,
   impersonation, threats, exploitation, sexual content involving minors,
   targeted harassment.
8. **A report does not automatically remove a block.** Reports are reviewed.

And the two tensions, stated plainly rather than discovered later:

9. **Removing a block does not destroy the NFT.** Moderation removes a block
   from this page's render. The asset stays on-chain, its metadata stays on
   Arweave, and its owner keeps it. We can stop showing something; we cannot
   unpublish the blockchain. No refund accompanies a removal.
10. **Royalties are advisory.** 5% is declared on-chain with no marketplace
    allowlist, deliberately, so that no block can ever be made untransferable.
    A marketplace that chooses to ignore the royalty can.

## 12. The server keypair

An explicitly accepted risk, approved with conditions. Full treatment in
SECURITY.md; the enforceable parts:

- The keypair is **only** the collection's update authority and the Irys upload
  signer. It is never a payment destination.
- It lives in a Vercel environment variable. **Never in a file**, never in the
  repository, never in a build artefact.
- `startup-check.ts` is extended to fail the deployment if the key is missing,
  malformed, or **its SOL and USDC balances are not zero**. A funded authority
  key is a configuration error, and the site refuses to serve rather than run
  with one.
- The 100 KiB upload cap (§8) is what keeps the zero-balance rule satisfiable:
  free uploads need no funding.
- Blast radius is bounded by the plugins in §7, and SECURITY.md documents the
  rotation procedure for moving the collection authority to a fresh key.

The treasury wallet is unchanged from outbid-tokens: receive-only, operated
entirely outside this codebase, no private key anywhere near the application.

## 13. Admin

Inherited console, `ADMIN_TOKEN` auth, every action audited with an actor and a
reason.

- **Settings**: price per pixel, GIF upgrade price and its size, dimension and
  duration limits, featured slot price and duration, reservation window, upload
  limits, animated-block cap. Every change
  is an audit-log row showing old and new value.
- **Moderation**: remove a block with a mandatory reason. Sets `status='removed'`,
  bumps the board version, regenerates the composite, and frees the rectangle.
  No automatic refund.
- **Reports**: queue, with the reported block rendered inline, and resolve/dismiss
  with a reason.
- **Unmatched payments and stuck mints**: inherited from outbid-tokens'
  `unmatched` view, extended with `paid` orders that never minted.

## 14. The chain is the source of truth

**Doctrine: for minted blocks, the chain is authoritative and Postgres is a
cache that can be thrown away and rebuilt.** Nothing about a minted block exists
only in our database. Position and size are in the asset's immutable attributes,
image, link and caption are in its immutable metadata on Arweave, and ownership
is the asset's owner field. If the database and the chain disagree, the chain is
right and the database is repaired — never the other way around.

This is what makes the integrity gap below survivable rather than fatal, and it
must be true in practice, not in principle. So it is executable:

**`scripts/rebuild-from-chain.mts`** reconstructs the `blocks` table from an
empty database. It pages the collection with DAS `getAssetsByGroup`, reads `x`,
`y`, `width`, `height`, `image_fit` and the rest from each asset's attributes,
reads the metadata URI for image, link and caption, and inserts one `minted` row
per asset with its current owner. It is idempotent, and it is the disaster
recovery procedure: restore nothing, run this.

One wrinkle the implementation has to solve rather than discover: DAS is an
indexer, not an RPC method, so it does not exist on a local validator. The
"list every asset in the collection" step is therefore an interface with two
implementations — DAS in production, `getProgramAccounts` via the Core SDK in
tests — and the rest of the script is identical either way.

**The test that keeps this honest** mints a handful of blocks against a local
validator, truncates the `blocks` table, runs the rebuild, and asserts the
result equals what was there before, row for row and field for field. A rebuild
path that is never executed is a rebuild path that does not work.

**What the chain does not hold: paid orders that never minted.** Those live only
in Postgres, and the rebuild cannot invent them. Their on-chain anchor is the
payment signature — the USDC transfer is a real, permanent transaction, so a
paid order can always be proven to exist and be reconstructed by hand from it,
but the rectangle and content it bought are ours to keep safe. Consequences:

- `rebuild-from-chain` never deletes `paid` rows. It rebuilds `minted` rows and
  leaves everything else alone; run against a genuinely empty database it
  produces only `minted` rows, and paid-but-unminted orders must then be
  restored from a backup or re-entered from their payment signature.
- Database backups matter for exactly this one state, which is a small, bounded,
  short-lived set of rows.
- `/api/reconcile` already surfaces `paid` orders with no `mint_address`. The
  faster that queue drains, the less there is that only we hold.

### The gap that remains

Overlap is enforced by a Postgres exclusion constraint, not by an on-chain
program. If the database is wrong or compromised, two people can hold NFTs
claiming the same rectangle and nothing on-chain forbids it. The nearest
competitor enforces this in an on-chain program, so a double-sell is refused by
the chain itself rather than by a web server.

Accepted deliberately: a custom program means Rust, an audit, and an
upgrade-authority question that partly re-opens the key custody problem we just
spent §12 constraining. The mitigations are that the rectangle is written into
the asset's immutable attributes, making a duplicate publicly detectable and
**provably second by mint order** — which is also the rule the rebuild applies
when it meets two assets claiming the same pixels: the earlier mint keeps the
rectangle and the later one is flagged for review rather than silently dropped.
Beyond that, the constraint makes a double-sell impossible short of database
compromise, and reservations are bound to a pubkey. A custom program stays the
first thing to reach for if the board gets big enough to be worth attacking.

## 15. Configuration

New, on top of the inherited set:

| Variable | Consequence if missing |
| --- | --- |
| `COLLECTION_AUTHORITY_SECRET` | No block can be minted; the site can still sell and hold paid orders |
| `COLLECTION_ADDRESS` | Same |
| `PAYMENT_WALLET` | Nothing can be sold; there is nowhere to be paid |
| `PLATFORM_FEE_LAMPORTS` | Mint transactions carry no platform fee |
| `SOLANA_RPC_URL` | Payments cannot be verified and mints cannot be confirmed |
| `IRYS_NODE_URL` | Content cannot be stored, so paid orders cannot mint |

Inherited and unchanged: `DATABASE_URL`, `TEST_DATABASE_URL`, `RATE_LIMIT_SALT`,
`ADMIN_TOKEN`, `SITE_URL`.

Prices are **not** environment variables. They live in `settings`, editable in
admin, with the single default named in §1.

## 16. Testing

`pixelwar`'s discipline: vitest, a separate Neon branch via `TEST_DATABASE_URL`,
the suite refusing to start if it equals `DATABASE_URL`, one suite per branch at
a time.

The cases that must exist because they are where this design can silently fail:

- Two concurrent reservations for overlapping rectangles: exactly one wins.
- Two edge-adjacent rectangles are both accepted. This is the case a `box`
  column silently fails.
- A reservation whose sweep and insert race an expiring neighbour.
- Payment from a wallet other than `buyer_pubkey` does not settle the order.
- A payment signature cannot settle two orders.
- A paid order's `expires_at` is null and the sweep never touches it.
- Mint retried five times produces one `mint_address`, one asset, one fee.
- An image whose declared MIME disagrees with its magic bytes is rejected.
- An animated GIF without the paid upgrade is rejected.
- A file at 100 KiB + 1 byte is rejected before any upload is attempted.
- A post-upload hash mismatch fails the step and stores nothing.
- Startup refuses to boot when the authority key holds any balance.
- A removed block's rectangle can be sold again.
- Composite regeneration failure leaves the previous board serving.
- Blocks minted locally, table truncated, rebuild run: the table comes back
  identical, row for row and field for field.
- A rebuild run over a database holding `paid` rows leaves every one of them
  untouched.

## 17. Build order

Each batch ends with a working, deployable site.

1. **Skeleton and board** — schema, migrations, the GiST constraint and its
   sweep, seed data, composite renderer, rectangle index, home page with the
   three counters. No money.
2. **Selector** — presets, freehand drag, snapping, collision overlay, running
   total, legends, hover and click.
3. **Purchase without the chain** — reservation, content validation, the
   confirmation screen, the full state machine with a stubbed payment verifier.
4. **Payments** — port `outbid-tokens/src/lib/payments/*`, pubkey binding,
   unique amounts, `/api/rpc` proxy, rate limits, `/api/reconcile`.
5. **Mint** — Irys upload and hash verification, Core asset creation with all
   three plugins, co-signing, platform fee, retry path, startup balance check.
6. **Ownership sync and rebuild** — the asset-listing interface with its DAS and
   `getProgramAccounts` implementations, `getAssetsByGroup` in the reconcile
   cron, `scripts/rebuild-from-chain.mts`, and the mint/truncate/rebuild/compare
   test.
7. **Admin and moderation** — settings with audit log, block removal, reports.
8. **Featured slot** — FIFO queue, OG image.
9. **Rules, SECURITY.md, README, security headers.**

Batches 1–3 have no dependency on a wallet, a key, or a mainnet transaction, and
should be finished and reviewable before any of that exists.
