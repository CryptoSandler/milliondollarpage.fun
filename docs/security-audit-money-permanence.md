# Security audit — the money path and the permanence invariant

Scope: AREA 1 (the money path) and AREA 2 (the permanence invariant), on `main`
at 43226a9. Written against `SECURITY.md`, `CLAUDE.md`, `DESIGN.md` and
`docs/superpowers/specs/2026-08-25-milliondollarpage-design.md` as they stand in
this working tree; every verdict below quotes the line it rests on.

Database probes ran against the `tests` Neon branch named by `TEST_DATABASE_URL`
(`ep-weathered-cell-…`, distinct host from `DATABASE_URL`'s `ep-rapid-hill-…-pooler`).
Every probe either ran inside a transaction that was rolled back or deleted its
own rows; the branch was verified empty afterwards (`blocks` 0 rows,
`release_challenges` 0, `admin_sessions` 0, `board_composites` 0). Nothing was
fixed. The repository tree is unmodified apart from this file.

## The state of the money path, stated first because it reframes AREA 1

There is no on-chain payment verification in this repository. `grep` over `src`
finds no `@solana/*` dependency, no `SOLANA_RPC_URL`, no `PAYMENT_WALLET`, no
`Connection(`, no mint address and no cluster string. The spec puts all of that
in batch 4 ("**Payments** — port `outbid-tokens/src/lib/payments/*`, pubkey
binding, unique amounts, `/api/rpc` proxy, rate limits, `/api/reconcile`",
spec §17), and batch 4 has not been built.

So the three AREA 1 questions about binding — *is the AMOUNT read from the
chain, is the DESTINATION read from the chain, is the CLUSTER pinned server
side* — all have the same answer today: **there is no code that reads a chain at
all.** The only thing that can move an order to `paid` is
`markPaid(id, buyerPubkey, signature)` (`src/lib/board/orders.ts:249`), and its
one caller is the stub confirm route. Findings F2 and F3 are therefore about the
guard standing in front of the stub and about the contract the verifier must
arrive under; §"WHAT HOLDS" records what the schema already enforces so that the
verifier inherits it instead of re-deciding it.

---

# Findings

## F1 — HIGH — A wallet address in the request body is still the whole credential for `/content` and `/confirm`

`src/app/api/orders/[id]/content/route.ts:73-80`
`src/app/api/orders/[id]/confirm/route.ts:50-58`
`src/lib/board/orders.ts:145-153` (`loadOwnedLiveRow`), `:189-206` (`toPublicOrder`)

**What the code does.** Both routes read `buyerPubkey` out of the request the
caller sent, compare it with `!==` against `blocks.buyer_pubkey`, and treat a
match as proof that the caller is the buyer. Nothing signs anything. The module
says so itself, in `orders.ts:167-172`:

> `buyerPubkey` is the one thing every ownership check in this file compares
> against — the whole reason `/content` and `/confirm` can trust a caller is
> that only the real buyer is supposed to know it.

That premise is one the repository has already examined and rejected, in
`migrations/003_release_challenges.sql:4-7`:

> DELETE /api/orders/:id used to authenticate with the buyer's address in the
> request body. That address is public by construction — /api/board publishes
> every live block's id and a wallet address was never a secret — so anyone
> could walk the board and release a stranger's rectangle.

The `DELETE` route was hardened into a nonce-and-signature flow for exactly this
reason. `/content` and `/confirm` were not. This is the PIXELWAR C-1 class as it
exists in this codebase today: **who presents an address, versus who controls
the key behind it.** Nothing anywhere in the request path proves control.

**Concrete scenario.** An attacker polls `GET /api/board` and takes an order id,
say `7a5b4797-…`. `GET /api/orders/7a5b4797-…` answers unauthenticated with
`{"totalBaseUnits":1200000000,"paymentBaseUnits":1200233325,…}` —
`toPublicOrder` publishes the payable amount, which is `total + payment_fraction`
(`orders.ts:198`), and the fraction is the unique-amount attribution key
(`reserve.ts:30-39`). Once batch 4 ships, that buyer sends exactly 1200.233325
USDC to the treasury. The transfer is public. The attacker watches the treasury,
sees an incoming transfer of exactly 1 200.233325, and now holds the pair
(order id, payer pubkey) — which is to say, the credential. Before the buyer's
`/confirm` lands, the attacker POSTs to `/api/orders/7a5b4797-…/content` with
`buyerPubkey` set to the address they just read off the chain and their own
image, link and caption. `attachContent` accepts it: the order is still
`reserved`, and the address matches. The buyer's money settles a rectangle
carrying the attacker's phishing link, permanently.

Today, without the on-chain half, the same attack needs the victim's wallet
address from somewhere else (a tweet, a Discord message, an explorer page for a
wallet the buyer has already published). The exposure is live; only the
discovery channel is waiting on batch 4.

**Proposed fix.** `src/lib/wallet/signature.ts` was written for this and says so
in its own header: "Payment verification lands in a later batch and needs the
same proof … and `challengeMessage` with a second action added to
`ChallengeAction` (`"pay"`)". Extend `ChallengeAction` to `"attach" | "pay"` and
put `/content` and `/confirm` behind `consumeReleaseChallenge`'s pattern, the
way `DELETE /api/orders/:id` already is. Separately, and cheaply: stop
publishing `paymentBaseUnits` to a caller who has not proved they are the buyer
— `toPublicOrder` already takes a `viewer` argument and already redacts the
caption and link on exactly that test.

**Rule violated.** `SECURITY.md`, "What a buyer is sold": "a sold pixel does not
change owner or content without its owner's signature". A stranger who writes
the image, caption and link that a payment then makes permanent has changed the
content of that sale without the owner's signature. Also `CLAUDE.md`: "Four
things are never simplified away, at any level: input validation at trust
boundaries, security, error handling that prevents data loss, and accessibility
basics."

---

## F2 — HIGH — The stub-payments production guard is keyed on `NODE_ENV`, which `next start` will not normalise

`src/lib/config.ts:57`
`src/lib/board/payment-stub.ts:19-21`
`src/instrumentation.ts:9-15`

**What the code does.** `stubVerifyPayment` returns `{ok:true}` with no
verification whatsoever, gated on `ALLOW_STUB_PAYMENTS === "true"` read at
request time. The one thing standing between that and a live deployment is:

```ts
if (process.env.NODE_ENV === "production" && process.env.ALLOW_STUB_PAYMENTS?.trim()) {
```

**Why it is bypassable.** `NODE_ENV` is not a value the framework normalises.
`node_modules/next/dist/bin/next:71-84` warns on a non-standard value and then
does:

```js
process.env.NODE_ENV = process.env.NODE_ENV || defaultEnv;
```

— i.e. an already-set `NODE_ENV` is kept as-is. `NODE_ENV=staging next start`,
or `NODE_ENV=development next start`, boots the production server with the
assert silent. Add `ALLOW_STUB_PAYMENTS=true` (already present in `.env.local`,
line 26, and `.env.local` is loaded by anything that calls `dotenv`) and
`POST /api/orders/:id/confirm` marks any order with content attached as `paid`,
for free. Verified live against the tests branch: `markPaid` returned
`{"status":"paid","expiresAt":null}` for a signature of `SIG_AUDIT_…` that no
chain has ever seen.

**What does hold.** The rest of the guard's design is sound and I confirmed it
rather than assuming it: a throw inside `register()` propagates out of
`prepareImpl()` (`next/dist/server/lib/router-utils/instrumentation-globals.external.js`,
`registerInstrumentation` re-throws; `next-server.js:573-577` awaits it in
`prepareImpl`), so the server does not come up at all, which is fail-closed;
and the build-time note in `payment-stub.ts`'s header about why the assert
cannot live at module top level is correct.

**Proposed fix.** Do not let a single mutable string decide it. One line, in
`src/lib/config.ts`, added to the same condition:

```ts
  if ((process.env.NODE_ENV === "production" || process.env.VERCEL_ENV) && process.env.ALLOW_STUB_PAYMENTS?.trim()) {
```

`VERCEL_ENV` is set by the platform on every deployment (production, preview and
development alike) and is not something a project environment variable can
quietly unset the way `NODE_ENV` is. Better still, and the direction I would
argue for: make `stubPaymentsAllowed()` require a positive non-production
signal rather than the absence of a production one — the flag plus
`NODE_ENV === "test"`.

**Rule violated.** `src/lib/config.ts:49-55`'s own stated contract: "If that
were ever set in production, anyone could mark any order paid without sending
any money — every rectangle on the board would be free for the asking. … this
check is what keeps it from ever reaching a real deploy." It does not keep it
from every real deploy.

---

## F3 — HIGH — A late payment loses the buyer's money with no record that it existed

`src/lib/board/orders.ts:145-153` and `:249-251`
`src/lib/board/blocks.ts:233-237` (the sweep)
`src/lib/board/reserve.ts:106-107` (the sweep runs inside the reservation transaction)

**What happens.** A hold that passes its `expires_at` is refused by
`loadOwnedLiveRow` (`OrderExpired`) and then **deleted** by
`sweepExpiredReservations`, which runs inside every subsequent `reserveRect`
transaction. The row is gone; `release_challenges` rows go with it through their
`ON DELETE CASCADE`; and the rectangle is immediately available to anybody else.
Probed end to end against the tests branch through the real modules:

```
[REFUSED] LATE PAYMENT: markPaid on an expired-but-unswept hold
  OrderExpired: That hold has expired.
[OK]      LATE PAYMENT: the same order after the sweep deleted it
  {"sweptRows":1,"orderStillThere":false}
[OK]      LATE PAYMENT: those pixels are re-sellable to somebody else
  {"newHolder":"attacker","id":"66795711-…"}
[OK]      LATE PAYMENT: what the database remembers about the vanished order
  {"rowsNamingThatOrder":"0"}
```

**Concrete scenario, once batch 4 lands.** A buyer holding
(1100, 700, 20×20) for $400 signs a USDC transfer of 400.000099 at T−20s. Solana
confirms it; the treasury has the money. Their `POST /confirm` arrives at T+3s
because a wallet popup took twenty-three seconds. `markPaid` throws
`OrderExpired`; the next visitor's reservation sweeps the row away. The money is
in the treasury, the buyer has no rectangle, no order row, no `payment_signature`
recorded anywhere, and the pixels are sold to somebody else an hour later. The
only trace is a transfer on chain with a fraction that no longer maps to
anything, and there is no `/api/reconcile` in this repository to notice it —
the spec puts that in batch 4 and describes it as sweeping "`paid` orders that
have no `mint_address`", which this order will never be.

The spec's own acceptance list already contains the good half of this rule —
"A paid order's `expires_at` is null and the sweep never touches it" — and says
nothing about the window before `paid`. That window is where the money is.

**Proposed fix.** Two parts, both cheap, and this is a decision for the owner
rather than something to patch in silently: (a) when the verifier finds a
confirmed transfer whose amount and payer match an order, settle it even if the
hold's clock has run out, as long as the rectangle has not been re-sold — the
exclusion constraint is the thing that decides whether that is still possible,
and it will refuse the settlement honestly if somebody else got there; (b) make
the sweep archive rather than delete, or at minimum refuse to sweep a row that
has content attached without recording that it existed, so a payment that
arrives against a swept order can still be found by a human. Deleting the only
record of an order that money may already have been sent for is the failure mode
the sweep cannot distinguish from tidying up.

**Rule violated.** `CLAUDE.md`: "Four things are never simplified away, at any
level: input validation at trust boundaries, security, **error handling that
prevents data loss**, and accessibility basics." Also `SECURITY.md`'s framing of
what a paid order is protected by — "the cost of getting it wrong is somebody
who paid losing their rectangle to the sweep" (`migrations/002_orders.sql:36-38`)
— which is exactly what happens in the gap between the transfer confirming and
`status` becoming `paid`.

---

## F4 — MEDIUM — `blocks_owner_is_final` is bypassed by two statements, and does not cover DELETE

`migrations/005_owner_is_final.sql:42-47`, `migrations/006_takedown.sql:101-107`

**What the trigger actually is.** `BEFORE UPDATE … FOR EACH ROW WHEN
(OLD.status IN ('paid','minted') AND NEW.buyer_pubkey IS DISTINCT FROM
OLD.buyer_pubkey)`. It guards one column, against one statement type, on rows
whose *old* status is a sold one. Everything outside that rectangle is open. I
tried to break it against the tests branch, and it broke:

```
[ALLOWED] A5 two-statement downgrade: paid -> reserved -> new owner -> paid
  {"buyer_pubkey":"ATTACKER","status":"paid","payment_signature":"AUDIT_SIG_1"}
[ALLOWED] A8 DELETE a paid row
  {"deleted":1,"rowsLeft":0}
[ALLOWED] A8b resell the pixels after deleting the paid row
  {"id":"0182559d-…"}
[ALLOWED] A9b paid row flipped to reserved with a past expiry, then swept
  {"sweptRows":1}
[ALLOWED] A6 move a sold rectangle
  {"x":100,"y":100,"w":200,"h":200,"status":"paid","buyer_pubkey":"OWNER_AUDIT"}
[ALLOWED] A12 change payment_signature on a paid row
  {"payment_signature":"SOMEONE_ELSES_TX"}
```

The A5 sequence is three ordinary statements:

```sql
UPDATE blocks SET status='reserved', expires_at=now()+interval '1 hour' WHERE id='…';
UPDATE blocks SET buyer_pubkey='ATTACKER' WHERE id='…';
UPDATE blocks SET status='paid', expires_at=NULL WHERE id='…';
```

The middle one sees `OLD.status = 'reserved'`, so the `WHEN` clause is false and
the trigger never fires. The row comes back out the other side `paid`, with the
same `payment_signature`, owned by somebody else. A9b is the same trick pointed
at the sweep: flip a sale to `reserved` with a past expiry and
`sweepExpiredReservations` deletes it as routine housekeeping.

**What is and is not claimed.** `SECURITY.md` says of this trigger:

> This is the same family of control as 001's exclusion constraint and it is
> here for the same reason: the database refuses the write, so no route, no
> script and no console session can reassign a sold rectangle by forgetting a
> check.

and 005 itself scopes the omission deliberately:

> It covers UPDATE only, which is the whole of the mutation surface for
> ownership: `blocks_paid_never_expires` (002) already keeps a paid row out of
> the sweep's reach, and the sweep deletes reserved rows exclusively.

That reasoning is circular in exactly one place: `blocks_paid_never_expires`
keeps a paid row out of the sweep only for as long as nothing changes its
status, and nothing forbids changing its status. The trigger is not a mechanism
against an operator with `psql` — it never claimed to be — but it *is* claimed
to be a mechanism against a script or a console session, and a script or console
session reassigns a sold rectangle in three lines. No application route can do
this today, which is why this is MEDIUM and not higher; it becomes higher the
day any code writes `status` on a sold row (batch 5's `status='minted'` is
exactly such a write).

**Proposed fix.** Widen the same trigger rather than adding a second mechanism:
fire it when `OLD.status IN ('paid','minted')` and
`(NEW.buyer_pubkey IS DISTINCT FROM OLD.buyer_pubkey OR NEW.status NOT IN ('paid','minted')
 OR (NEW.x,NEW.y,NEW.w,NEW.h) IS DISTINCT FROM (OLD.x,OLD.y,OLD.w,OLD.h))`, and add a
`BEFORE DELETE` trigger with `WHEN (OLD.status IN ('paid','minted'))`. That
leaves `paid → minted` to be allowed explicitly by whatever migration builds
minting, which is the right place for that permission to be granted.

---

## F5 — MEDIUM — `attachContent`'s UPDATE does not repeat its own precondition, so content can land on a paid row

`src/lib/board/orders.ts:213-239` (the read at `:213`, the UPDATE at `:218-228`)

**What the code does.** `attachContent` checks `row.status !== "reserved"` on a
row it read a round trip earlier, then issues:

```sql
UPDATE blocks
    SET pending_image = $2, … , image_fit = $8
  WHERE id = $1
```

`WHERE id = $1` and nothing else. The read is not a lock. The very same file
gets this right for the destructive path and explains why, at `:303-310`:

> Then the DELETE repeats both preconditions in its own WHERE clause. The read
> above is not a lock: between it and this statement the order can be paid by
> the buyer's other tab, or swept for expiry. Without `status = 'reserved'` in
> the WHERE, that race would delete a PAID block — a sale, permanent, with money
> against it.

Every word of that applies to this UPDATE, and it is the one place the rule was
not applied. The database will not catch it: probed against the tests branch,
`attachContent`'s exact statement run against a `paid` row succeeded —
`{"status":"paid","caption":"SWAPPED","link":"https://evil.example","image_fit":"contain"}`.

**Concrete scenario.** The window is wide and attacker-controlled: `/content`
decodes the upload with `sharp` before it writes, so a 100 KiB animated GIF buys
hundreds of milliseconds. Fire `POST /content` with that GIF and, while it
decodes, `POST /confirm` from a second connection. The confirm wins the race and
sets `status='paid'`; the content write lands afterwards on a sold row. Combined
with F1 — where the caller need not be the owner at all — this is a third party
rewriting the content of a rectangle that is already paid for.

**Proposed fix — and this is the one-line one.** `src/lib/board/orders.ts:227`:

```
      WHERE id = $1
```

becomes

```
      WHERE id = $1 AND status = 'reserved'
```

The `if (!updated) throw new OrderExpired()` immediately below already handles
the zero-row case, which is the same outcome a request arriving a moment later
would get. I have not applied it.

**Rule violated.** `SECURITY.md`: "Today the guard is in the application:
`attachContent` refuses once an order is paid, so the caption, the link, the
image and the fit are writable up to the payment and not after." That sentence
is currently true only for requests that do not race.

---

## F6 — MEDIUM — Nothing validates that `buyer_pubkey` is a Solana address, and the trigger then makes it permanent

`src/app/api/reserve/route.ts:92`, `src/lib/board/reserve.ts:120-133`

`parseReserveBody` accepts any non-empty string. The database agrees — probed:
`[ALLOWED] C6 buyer_pubkey shape: is any string accepted as an owner?
{"buyer_pubkey":"not-a-solana-address"}`. There is no CHECK on shape, no base58
decode, no length test, in contrast to the care taken over
`blocks_sha256_shape` (`002:45-47`) and `release_challenges_nonce_shape`
(`003:29`).

Two consequences, both permanent by construction. A rectangle sold to
`"my wallet lol"` can never be released early (the release path needs an ed25519
signature verifiable from that address), can never be minted to a real owner, and
by `blocks_owner_is_final` can never be corrected. `SECURITY.md` names this cost
knowingly in the open decision — "a mistyped wallet address at purchase is
unrecoverable" — but "mistyped" assumes it is at least an address.

The repository already has the check and needs no dependency for it:
`base58Decode` in `src/lib/wallet/base58.ts`, whose header notes it produces the
raw 32 bytes and that `signature.ts` rejects anything that is not
`PUBLIC_KEY_BYTES` long. One call at the reserve boundary.

**Rule violated.** `CLAUDE.md`: "Four things are never simplified away, at any
level: **input validation at trust boundaries**, security, error handling that
prevents data loss, and accessibility basics." The reserve route is the trust
boundary, and this is the field the whole ownership model is built on.

---

## F7 — LOW — The schema permits a `paid` row with no proof of payment, and permits rewriting the proof

`migrations/002_orders.sql:31`

`blocks_payment_signature_unique` is a plain UNIQUE, so NULLs do not collide.
Probed: `[ALLOWED] C2 two paid rows carrying NO signature at all {"n":2}`, and
`[ALLOWED] C5 … is an empty string accepted? {"payment_signature":""}`, and
`[ALLOWED] A12 change payment_signature on a paid row
{"payment_signature":"SOMEONE_ELSES_TX"}`.

No application path produces any of these today — `markPaid` always writes the
string it was handed — so this is defence in depth rather than a live hole. It
matters for batch 4 because `payment_signature` is what `/api/reconcile` and any
future dispute will read: a sale whose proof of payment is NULL, empty, or has
been overwritten is indistinguishable from one that was never paid for. A CHECK
that `status IN ('paid','minted')` implies `payment_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$'`
would close all three at once, in the same style as `blocks_sha256_shape`.

---

## F8 — LOW — `POST /api/orders/:id/confirm` calls `identify()` and then rate-limits nothing

`src/app/api/orders/[id]/confirm/route.ts:38-39`

The handler resolves a caller identity and never uses it. `/reserve` and
`/content` both spend theirs on `checkReservationLimits` /
`checkContentSubmissionLimits`; this one does not. Today the route is
stub-gated, so the practical effect is only that the (order id, pubkey) pair can
be tested at unlimited rate on a deployment where the stub is on. When the real
verifier lands on this handler it will be the endpoint that talks to an RPC on
every call, which is the one that most wants a limit. The route's own docstring
justifies the `identify()` call as "the point where the site starts knowing who
is confirming a payment", which is a purpose nothing currently reads.

---

## F9 — INFORMATIONAL — Migrations are an unguarded write path to sold rows, with a precedent

`scripts/migrate.mts:16`, `migrations/004_pixel_wall.sql:34`

`npm run db:migrate` defaults to `DATABASE_URL` — production — with no
confirmation prompt, and applies any `.sql` file in `migrations/` that is not in
the `schema_migrations` ledger, in one transaction, in filename order.
Migration 004 contains an unconditional `DELETE FROM blocks;`. That was correct
when it ran (the file says so: "Every row in this table at the time of writing
was invented … Nothing has been sold, because nothing has launched"), and the
ledger will not re-run it. It is recorded here because it is the shape of the
one write that would end the permanence promise outright, it is in the
repository as a worked example, and the ledger is keyed on filename with no
checksum — a migration renamed or a new file with the same posture re-runs
against production on the next `npm run db:migrate`. The `BEFORE DELETE` trigger
proposed in F4 is what would make that statement fail rather than succeed.

---

## F10 — INFORMATIONAL — The contract the batch-4 verifier has to arrive under

Recorded so the AREA 1 questions have somewhere to land when there is code to
audit. The spec already states most of it (§"Step 3 — Pay"): "an exact-amount
USDC transfer to the treasury wallet, attributed by the unique fraction and
**bound to `buyer_pubkey`** — a transfer from any other wallet does not settle
this order. … checks mint, destination, amount, sender and finality". What the
spec does not say anywhere, and what should be written down before the code is:

- **The cluster must be pinned server-side and asserted, not inherited from
  `SOLANA_RPC_URL`.** An RPC URL is a string; a devnet URL answers
  `getTransaction` for a devnet signature perfectly happily. The check is
  `getGenesisHash()` against the mainnet genesis hash at boot, refusing to serve
  on a mismatch — the same posture as the zero-balance check `SECURITY.md`
  §"Enforced conditions" already demands of the authority key.
- **Amount, destination, mint and payer are all read from the parsed
  transaction**, never from the request body and never from anything the client
  computed. The order row supplies the expected values;
  `signature.ts:24-27` already promises this — "the amount, the treasury and the
  transfer are all read from the order and from the chain, never from something
  the buyer typed" — and that sentence is the thing to hold the implementation
  to.
- **Finality must be `finalized`**, not `confirmed`: a confirmed-but-forked
  transaction that settles an order is a free rectangle.
- **The payer from the chain is compared against `blocks.buyer_pubkey` read
  from the database**, which is the C-1 defence, and the comparison must survive
  F1 being fixed (a signed challenge does not remove the need for it).

---

# WHAT HOLDS

Properties I actively attacked and could not break. Each line names the probe.

**The exclusion constraint still covers hidden and purged rows.** This was the
open question 006 closed, and it is closed correctly. Seeded a `paid` block at
(1200, 760, 40×30), ran `takedown.ts`'s exact `hide` statement, then tried to
reserve (1210, 770, 10×10) inside it: `refused 23P01 blocks_no_overlap`. Ran
`block_purge_content` on the same row and tried again: `refused 23P01
blocks_no_overlap`. A takedown cannot make a rectangle buyable again by anyone.
`SECURITY.md`: "In neither case does ownership of the rectangle transfer or
lapse … and nobody else can buy those pixels."

**Neither takedown level touches ownership, status or the rectangle.** The row
after `block_purge_content` read
`{"status":"paid","buyer_pubkey":"OWNER_AUDIT","x":1200,"y":760,"w":40,"h":30,
"hidden":true,"purged":true,"caption":null,"link":null,"image_sha256":null,
"bytes_gone":true,"payment_signature":"AUDIT_SIG_1"}` — every content column
NULL, every ownership column untouched. Changing the owner of a purged row was
refused by the trigger: `23001 … block … is sold: buyer_pubkey cannot be changed
by an UPDATE`.

**A purge is genuinely irreversible.** `unhide` with the app guard removed —
`UPDATE blocks SET hidden_at=NULL WHERE id=$1` — was refused by
`23514 blocks_purge_implies_hidden`. The constraint, not the application, is what
makes "not reversible and it is not meant to be" true.

**A purge cannot be aimed at a hold.** `block_purge_content` against a
`reserved` row left it `{"status":"reserved","hidden_at":null,"purged_at":null,
"caption":"mine"}` — the function's own `AND status IN ('paid','minted')` held,
and `blocks_takedown_only_when_sold` stands behind it.

**The admin surface has exactly the three statements `SECURITY.md` describes and
no fourth.** `ACTIONS = ["hide", "unhide", "purge"]`
(`src/app/api/admin/blocks/[id]/route.ts:30`); `takedown.ts` names `status`,
`buyer_pubkey`, `x`, `y`, `w`, `h` in no statement. A full grep of `src`,
`scripts` and `migrations` for `UPDATE blocks` / `DELETE FROM blocks` /
`INSERT INTO blocks` / `block_purge_content` returns six application statements
in total — `reserve.ts:121`, `orders.ts:219`, `orders.ts:263`, `orders.ts:325`,
`blocks.ts:234`, and `takedown.ts:121/148/194` — which is a write surface small
enough to enumerate exhaustively, and I did.

**The ownership trigger is not bypassed by any single UPDATE.** Refused, with
`23001`, in all four shapes I tried: a plain `UPDATE … SET buyer_pubkey`; the
same with `AND status='paid'` in the WHERE; setting it to NULL (the
`IS DISTINCT FROM` case 005 called out deliberately); and a mass
`UPDATE … WHERE status IN ('paid','minted')` that stopped on the first sold row.

**A paid row cannot be given an expiry.** `UPDATE blocks SET expires_at = now() -
interval '1 day'` on a `paid` row: `23514 blocks_paid_never_expires`. The sweep
statement run verbatim against a table containing that paid row touched nothing.

**`removed` is genuinely retired.** `UPDATE blocks SET status='removed'`:
`23514 blocks_status_known`.

**One transfer settles one order, and the database is what enforces it.** Two
holds, first settled with `payment_signature='TX_ABC'`; the second UPDATE with
the same signature: `23505 blocks_payment_signature_unique`. Also refused when
one of the two rows was still `reserved`, so the constraint is not scoped to
sold rows and a signature cannot be parked on a hold. `migrations/002_orders.sql:29-31`:
"One transfer settles one order. Without this, a replayed signature could mark a
second rectangle paid for free."

**The stub's signature is server-generated and per-order.**
`stubVerifyPayment` returns `stub-${order.id}` (`payment-stub.ts:33`), so even
with the flag on, a caller cannot choose the signature, cannot replay another
order's, and cannot present one they saw elsewhere. Confirmed through the real
module: a second `markPaid` with a different signature on an already-paid order
was refused with `OrderNotReady: This order has already been paid with a
different signature.`, and a stranger's `markPaid` with
`OrderNotYours: That order does not belong to you.`

**The confirm route is invisible when the stub is off.**
`if (!stubPaymentsAllowed()) return problem(404, "Not found.")` is the first
statement in the handler, before the id is parsed and before anything is loaded,
so a production deployment with the flag unset answers exactly as if the route
had never been deployed. Subject to F2 for what "off" depends on.

**Ownership is checked before any expensive or disclosing work.** `/content`
refuses an oversized declared `content-length` before buffering, rate-limits
before parsing, and compares `buyer_pubkey` before handing attacker-controlled
bytes to `sharp`. `/confirm` compares ownership before `stubVerifyPayment` runs,
so a stranger cannot tell a contentless order from somebody else's. Both
verified by reading, and the error ladder verified through the modules: expired,
not-yours and not-ready all come back as distinct, correctly-ordered exceptions.

**`toPublicOrder` never leaks `buyer_pubkey`.** A grep of every route response
path confirms no endpoint returns the column: not `/board`
(`blocks.ts:125-131`, whitelist), not `/blocks/:id`, not the admin takedown
list (`takedown.ts:78`, whitelist), not `/orders/:id`. F1 is about the address
being guessable or observable elsewhere, not about this codebase publishing it.

**No rows were left behind.** `blocks`, `release_challenges`, `admin_sessions`,
`admin_login_attempts` and `board_composites` all read 0 rows on the tests
branch after the probes finished; the two rows the end-to-end flow probe created
outside a transaction were deleted by the probe itself and the deletion verified.

---

## Summary by severity

| | |
| --- | --- |
| CRITICAL | none |
| HIGH | F1 pubkey-as-credential on `/content` and `/confirm`; F2 stub guard keyed on `NODE_ENV`; F3 late payment loses money and the order row |
| MEDIUM | F4 `blocks_owner_is_final` bypassed by a status downgrade and silent on DELETE; F5 `attachContent`'s UPDATE lacks its own precondition (one-line fix); F6 `buyer_pubkey` is unvalidated and then permanent |
| LOW | F7 a `paid` row may carry no proof of payment, and the proof is rewritable; F8 `/confirm` identifies a caller and limits nothing |
| INFORMATIONAL | F9 migrations as an unguarded write path; F10 the contract the batch-4 verifier must arrive under |
