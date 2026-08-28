# Security audit — reservations and content, signed challenges, admin and moderation

Areas 3, 4 and 6. Branch `main` at 43226a9. Static review only: no database was
written, no test suite was run. Every verdict below cites the governing document
open in front of me — `SECURITY.md`, `DESIGN.md`, `CLAUDE.md` — quoted, not
recalled.

**Counts.** 0 CRITICAL · 1 HIGH · 4 MEDIUM · 7 LOW · 3 INFORMATIONAL.

Nothing here was fixed. The one finding that is a genuine one-line fix is
HIGH-1, and the exact line is given.

---

## HIGH-1 — A 2-request unauthenticated denial of service: quadratic base58 decode on unbounded input

**Where.** `src/lib/wallet/signature.ts:102-107`, reached from
`src/lib/board/release-challenge.ts:136`, reached from
`src/app/api/orders/[id]/route.ts:126`. The decoder itself is
`src/lib/wallet/base58.ts:40-58`.

```ts
// signature.ts:102-107
export function verifySignature(message: string, signature: string, address: string): boolean {
  const publicKeyBytes = base58Decode(address);          // decode FIRST
  if (!publicKeyBytes || publicKeyBytes.length !== PUBLIC_KEY_BYTES) return false;   // length check SECOND

  const signatureBytes = base58Decode(signature);
  if (!signatureBytes || signatureBytes.length !== SIGNATURE_BYTES) return false;
```

`base58Decode` is a schoolbook big-integer accumulate: for each input character
it walks the whole byte accumulator. That is O(n²) in the length of the string,
and the length check that would have bounded `n` runs *after* the decode. The
only shape check upstream is `readProof` (`release-challenge.ts:146-150`), which
asserts `typeof … === "string"` and `!== ""` and nothing about length.

**Measured, on this machine, on the exact algorithm in `base58.ts`:**

| input length | wall time (event loop blocked) |
| --- | --- |
| 1,000 | 1 ms |
| 10,000 | 36 ms |
| 50,000 | 873 ms |
| 100,000 | 3,487 ms |

**Attack, with real values.**

1. `GET /api/board` → any live rectangle's id, say
   `3f2a1c88-9e10-4d77-9b3d-0a5f6c2e1b44`. Sold blocks work; the challenge
   route deliberately issues for a paid order too
   (`release-challenge/route.ts:22-24`).
2. `POST /api/orders/3f2a1c88-…/release-challenge` → `{ nonce: "a1b2…", … }`.
   Unauthenticated, unrated, always succeeds.
3. `DELETE /api/orders/3f2a1c88-…` with body
   `{"nonce":"a1b2…","publicKey":"z".repeat(1000000),"signature":"1"}`.

The nonce is spent, `verifySignature` is reached, and `base58Decode` grinds a
1,000,000-character string: extrapolating the quadratic from the table above,
roughly six minutes of **synchronous, unyieldable CPU on the Node event loop**.
Every other request served by that instance — the board, the wall, the admin
console — waits behind it. There is no `identify()` on this route, by design
("There is no `identify()` — no rate limit hangs off this",
`orders/[id]/route.ts:98`), and no `content-length` gate of the kind
`content/route.ts:51-55` has, so the request costs the attacker one HTTP call
and a few MB of upload. `n` is bounded only by the platform's body limit.

`publicKey` is the cheaper vector because it is decoded first, but `signature`
is identical once the pubkey is a valid 32 bytes.

**Rule violated.** `CLAUDE.md`, "Default posture: lazy senior": *"Four things
are never simplified away, at any level: input validation at trust boundaries,
security, error handling that prevents data loss, and accessibility basics."*
A length bound on a string that feeds an O(n²) loop is input validation at a
trust boundary. The file's own header claims the property it does not have:
*"Every way of being wrong answers false rather than throwing: an address that
is not base58, an address that decodes to the wrong number of bytes, a
signature of the wrong length"* (`signature.ts:93-98`) — true of the *answer*,
not of the *cost*.

**Fix — one line, twice (do not apply; shown for the orchestrator).** In
`src/lib/wallet/signature.ts`, immediately above line 103:

```ts
  if (address.length > 44 || signature.length > 88) return false;
```

44 and 88 are the maximum base58 lengths of 32 and 64 bytes
(`ceil(256/log2 58)` and `ceil(512/log2 58)`). Equivalently, and better because
it protects every future caller, a guard at the top of `base58Decode`
(`base58.ts:41`): `if (input.length > 128) return null;`.

**Why HIGH and not CRITICAL.** It costs availability only. None of the three
promises in `SECURITY.md` § "What a buyer is sold" is touched: no rectangle
changes owner, no content changes, nothing expires. It is still the worst thing
in this report.

---

## MEDIUM-1 — `/api/reserve` is a free, unlimited oracle for "which wallet holds this rectangle", and it hands back that hold

**Where.** `src/lib/board/reserve.ts:159-168` (the 23P01 catch),
`:231-240` (`resumableHold`), `:266-269` (`ownOrderIds`), surfaced at
`src/app/api/reserve/route.ts:50-58` and `:76-87`.

Two disclosures, one root cause: after the exclusion constraint refuses an
overlap, the refusal is filtered by *the pubkey the caller put in the request
body*, which nothing has proved.

**Attack A — the cheap oracle (any overlapping rectangle).** Victim holds
`(300,200,50,50)`. Attacker suspects the address
`7xKq…Wq9` (a wallet address is public wherever it exists; after minting lands,
every owner's address is on chain beside their rectangle).

```
POST /api/reserve  {"rect":{"x":300,"y":200,"w":10,"h":10},"buyerPubkey":"7xKq…Wq9"}
```

Wrong guess → *"Someone is currently holding part of this rectangle…"*.
Right guess → *"Part of this rectangle is a hold you started yourself…"* **and
`yourOrderIds: ["<the victim's order id>"]`** (`route.ts:57`, filled by
`ownOrderIds`).

**Attack B — the takeover (exact rectangle).** Same guess, but with the
victim's exact rectangle and nothing else overlapping: `resumableHold` matches
and the route answers **201** with the victim's `id`, `expiresAt`,
`totalBaseUnits` and `paymentBaseUnits` — i.e. the whole reservation, including
the payment fraction that attributes an incoming transfer to it.

The attacker's probes never create a row (the transaction rolls back on 23P01),
so `checkReservationLimits` counts them at zero on every axis — live holds 0,
`pixels_elsewhere` 0, `createdPerWindow` 0 (it counts rows in `blocks`), pixel-
minutes 0. **The probe is unmetered and repeatable indefinitely.**

**Rule violated.** `DESIGN.md` § Voice: *"Never say who holds a rectangle.
When, yes. Who, never."* and, in the same section, the sentence that says this
is meant to be structurally impossible: *"That is not a disclosure and cannot
become one: the browser recognises an order id it created itself, and the
server puts nobody else's id, key or count on the wire. 'Someone is holding
this' stays the only thing anyone ever learns about anyone else."* The server
does put somebody else's id on the wire, to anyone who can guess a public
value. `reserve.ts:60-64` claims the opposite in a comment — *"Only ever the
caller's own"* — which is true of the code and false of the trust model, because
"the caller's own" is decided by an unauthenticated field.

**Proposed fix.** Make the resume and the `yourOrderIds` disclosure depend on
something the caller can only have if they are the buyer. Cheapest option that
keeps the UX: key both on the caller's `ip_hash` (already on the row, already
the limiter's identity) *in addition to* the pubkey — a stranger on a different
address then gets the plain "someone is holding this" 409. The correct option,
and the one this repo already built the machinery for, is the release challenge:
a resume presents a signature, exactly as the DELETE does.

---

## MEDIUM-2 — `/content` and `/confirm` still authenticate with the bare wallet address, the credential this repo already ruled worthless

**Where.** `src/app/api/orders/[id]/content/route.ts:73-80` and
`src/app/api/orders/[id]/confirm/route.ts:50-58`. Both do
`if (order.buyerPubkey !== buyerPubkey) return problem(403, …)` against a value
taken straight out of the request.

**Rule violated, verbatim.** `DESIGN.md` § "Letting a hold go": *"The address
on its own proved nothing: the board publishes every live block's id, and a
wallet address is public wherever it exists, so anything that trusted the
address alone let a stranger let go of somebody else's pixels."* The DELETE
path was fixed for exactly this reason. `/content` and `/confirm` were not, and
`orders.ts:170-173` acknowledges the chain it leaves open: *"an `Order`
returned with its `buyerPubkey` intact would let anyone chain 'read the board'
-> 'GET this order' -> 'POST content as its buyer' and overwrite a stranger's
hold."* The mitigation chosen was to stop *publishing* the pubkey. MEDIUM-1
above is a second way to obtain it.

**Attack, chained with MEDIUM-1.** Attacker confirms the victim's address and
order id via `/api/reserve`, then:

```
POST /api/orders/<victim-order-id>/content
  multipart: buyerPubkey=7xKq…Wq9, image=<phish.png>, link=https://evil.example, caption=Free mint
```

`attachContent` succeeds (`orders.ts:208-247` — status is still `reserved`, so
its only precondition holds). The victim pays. The attacker's image, caption and
link are now on the wall, and `SECURITY.md` § "What a buyer is sold" makes them
**permanent**: *"`attachContent` refuses once an order is paid, so the caption,
the link, the image and the fit are writable up to the payment and not after."*
The victim's only remedy is a takedown of their own rectangle, which
`SECURITY.md` § Takedown says is not refunded.

**Proposed fix.** Present a release-style signed challenge on `/content` and
`/confirm`. `signature.ts:14-27` already says this is the plan and that the
message shape needs only a second `ChallengeAction`. Until then, MEDIUM-1's fix
is what keeps the address unguessable in practice.

---

## MEDIUM-3 — The challenge mint is unauthenticated, unrated, and writes a row per call

**Where.** `src/app/api/orders/[id]/release-challenge/route.ts:26-36` →
`src/lib/board/release-challenge.ts:63-89`.

Every call runs a `DELETE … WHERE expires_at < now()` and an `INSERT`. There is
no `identify()`, no limit, and no bound on how many live challenges one order
may carry. A script at 500 req/s holds ~60,000 rows in `release_challenges`
against a 2-minute TTL and spends two write round trips per request on a
serverless Postgres that is billed by compute.

This is also the nonce supply for HIGH-1: without a limit here, an attacker can
mint a fresh nonce for every DoS request.

**Rule.** The route's own justification — *"a challenge is a random number and
a sentence; it is worth nothing without the private key"* (lines 13-18) — is
about *confidentiality*, and it is correct. It says nothing about cost, and cost
is what is unbounded. `CLAUDE.md` again: security is one of the four things
never simplified away.

**Proposed fix.** `identify(request)` plus a small per-caller ceiling, the same
shape `checkContentSubmissionLimits` already has. A cheaper variant: refuse to
mint when the order already has an unexpired unused challenge, which costs one
`WHERE` clause and bounds the table at one row per live order.

---

## MEDIUM-4 — Address trust is configured by two undocumented environment variables, one of which silently defaults

**Where.** `src/lib/config.ts:22-26` and `:42-44`; consumed at
`src/lib/callers/client-ip.ts:68-98`. Neither `TRUSTED_PROXY_HOPS` nor
`TRUSTED_PLATFORM_HEADER` appears in `.env.example` (48 lines; `grep TRUSTED`
returns nothing), and neither has a startup assertion of the kind
`assertUntrustedClientIpNotInProduction` gives its sibling flag.

```ts
// config.ts:22-26 — the module whose header says "Each one throws rather than defaulting"
export function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
```

`TRUSTED_PROXY_HOPS=banana` and `TRUSTED_PROXY_HOPS=0` both become `1`, silently.

The sharper edge is `TRUSTED_PLATFORM_HEADER`. It takes precedence over
`x-forwarded-for` and the only validation is membership of the four-name
allowlist. Set to `cf-connecting-ip` on a deployment that is not behind
Cloudflare, every caller picks their own identity by sending one header. Two
consequences at once: reservation limits become per-attacker-chosen-bucket
(unlimited holds), and — because `adminCaller` uses the same function
(`admin.ts:151-155`) — an attacker can send five wrong tokens under
`cf-connecting-ip: <operator's IP>` and lock the operator out of their own
console for 15 minutes, repeatedly. `client-ip.ts:35-44` names this risk in a
comment; nothing enforces it and nothing documents it for the person deploying.

**Rule violated.** `src/lib/config.ts:1-6`: *"Each one throws rather than
defaulting. A default for any of these is a production deploy that looks
healthy while doing the wrong thing."* `trustedProxyHops` is a default, in the
file that forbids them.

**Proposed fix.** Document both in `.env.example`; make `trustedProxyHops`
throw on a malformed value rather than coerce; and add an
`assertTrustedPlatformHeaderMatchesPlatform`-style boot check, or at minimum a
startup log line naming which header is being trusted.

---

## LOW-1 — An unpaid hold publishes three facts about its content to any caller

**Where.** `src/lib/board/orders.ts:189-206`. `showText` gates `caption` and
`link` only; `hasContent` (`:200`), `imageFit` (`:203`) and `isAnimated`
(`:204`) go out unconditionally, from an unauthenticated `GET /api/orders/{id}`
(`orders/[id]/route.ts:34-44`) whose id is published by `/api/board`.

A third party learns, of a hold they do not own: whether an image has been
uploaded yet, whether it is animated, and which fit was chosen.

**Rule violated.** `blocks.ts:96-102`, the doc comment on `BlockDetails.fit`,
which decided this exact question the other way for the hover card: *"Null for
exactly the rows the caption and the link are null for — a hold, and a block
that has been taken down — because it is a fact about content that is not being
published."* `toPublicOrder`'s own comment then asserts the opposite of what it
does: *"Nothing else on an order is hidden: a stranger polling a hold's status
still learns its rectangle, its price and its clock, which `/board` publishes
anyway."* `/board` publishes none of these three.

**Proposed fix.** Put `hasContent`, `imageFit` and `isAnimated` behind the same
`showText` the caption and the link use.

---

## LOW-2 — `buyer_pubkey` is never validated as a Solana address, in the application or in the schema

**Where.** `src/app/api/reserve/route.ts:89-97` (`parseReserveBody` accepts any
non-empty string) and `migrations/001_board.sql:26` (`buyer_pubkey text`, no
CHECK). `verifySignature` would refuse to verify anything for such a row, so a
block can be sold to an owner that can never sign for it.

**Rule.** `SECURITY.md` § "Open decision: whether a block can change hands"
states the cost precisely: *"a mistyped wallet address at purchase is
unrecoverable"* — and `blocks_owner_is_final` makes that a database fact. A
one-line format check is the only thing standing between a typo and a permanent
orphan. `CLAUDE.md`: input validation at trust boundaries is never simplified
away.

**Proposed fix.** Reuse what is already here: `base58Decode(buyerPubkey)?.length
=== 32` in `parseReserveBody`, and a `CHECK (buyer_pubkey ~
'^[1-9A-HJ-NP-Za-km-z]{32,44}$')` for the schema half.

---

## LOW-3 — `markPaid` does not repeat its preconditions in its own WHERE, which the module holds up as the rule

**Where.** `src/lib/board/orders.ts:249-285`. The UPDATE is
`WHERE id = $1` alone. Two concurrent confirms both pass the read at `:250`,
both UPDATE, and the second overwrites `payment_signature` — the first
transfer's on-chain reference is lost from the row. The
`blocks_payment_signature_unique` constraint does not catch it: it forbids the
same signature on two rows, not two signatures on one row.

**Rule violated.** The same file, `:296-310`, arguing why
`releaseOwnReservation` repeats its guards: *"the read above is not a lock:
between it and this statement the order can be paid by the buyer's other tab,
or swept for expiry."* Identical window, one function up, no guard.

**Proposed fix.** `AND status = 'reserved'` in `markPaid`'s WHERE; the existing
`if (!updated) throw new OrderExpired()` then needs to distinguish "gone" from
"already paid", which is one extra `loadRow` on the null path.

---

## LOW-4 — No entropy floor on `ADMIN_TOKEN`, and the lockout has no global counter

**Where.** `src/lib/admin.ts:78-82` — any non-empty `ADMIN_TOKEN` is accepted,
including `admin`. `checkAdminLoginGate` (`:272`) counts failures per `ip_hash`
only, so the five-guess ceiling is five guesses *per source address*; N
addresses buy 5N guesses per 15 minutes with no global brake and no alert.

The module states the threat it is defending against
(`admin.ts:26-29`): *"An endpoint that answers 'is this the token?' without
limit is a brute-force oracle, and a short hand-typed secret does not survive
one."* — and then permits a short hand-typed secret. `.env.example` says
`openssl rand -hex 32`, which is a comment, not a control.

**Proposed fix.** Refuse to treat an `ADMIN_TOKEN` under ~24 characters as
configured (log the reason, fail closed, which is already this surface's
posture). A global failure counter is the larger change and may not be worth
it; the entropy floor is one line and makes the distributed case irrelevant.

---

## LOW-5 — `DELETE /api/admin/session` is an unauthenticated write, and it copies the sign-in route's disclosure without the sign-in route's reason

**Where.** `src/app/api/admin/session/route.ts:115-159`.

Two small things. First, with `ADMIN_TOKEN` set, any stranger can drive an
unlimited number of `UPDATE admin_sessions SET revoked_at = now() WHERE id = $1`
statements with junk ids — a metered write on a serverless database, reachable
by anyone. Second, when `ADMIN_TOKEN` is unset it answers the explicit 503
*"Admin access is not configured on this deployment."* The 503 is justified for
POST and is written down as such: *"an operator standing in front of the
sign-in form needs to know why it does not work. The routes behind the form
have no such duty and must not copy this"* (`:52-58`). Nobody stands in front
of a DELETE; it is called only by `signOutAdmin` from JavaScript
(`admin-client.ts:128-137`). It is an extra place a prober can ask whether this
deployment has an admin surface.

**Proposed fix.** Answer `{ ok: true }` unconditionally on DELETE — signing out
of a surface that does not exist has already succeeded — and drop the
revocation UPDATE when the cookie value is not the 64-hex shape
`createAdminSession` mints.

---

## LOW-6 — `createdPerWindow` counts rows the sweep deletes, so "20 holds an hour" is not what it enforces

**Where.** `src/lib/callers/limits.ts:163-177`:

```sql
SELECT COUNT(*) FROM blocks
 WHERE ip_hash = $1 AND created_at > now() - ($2 || ' minutes')::interval
```

`sweepExpiredReservations` (`blocks.ts:233-238`) DELETEs expired reservations
and `releaseOwnReservation` DELETEs released ones, so a hold that ended stops
being counted as "created". Take a hold, release it, repeat: the counter never
climbs.

Impact is limited because the pixel-minute budget in `hold_meter` — which
deliberately outlives the row, and `migrations/008_hold_meter.sql:11-22` is
explicit about why — does hold the line at a sustained 5,000 pixels. So this is
a limit that does not do what its name says rather than an open door. Worth
recording because the comment above it claims the counts are sweep-proof: *"The
sweep is convenience, not correctness, for the counts below: each count also
filters expiry itself"* (`limits.ts:26-29`). This one filters `created_at`, not
expiry, and cannot filter a row that is gone.

**Proposed fix.** Count from `hold_meter` (rows survive) rather than from
`blocks`, or delete the limit and say the budget is the real ceiling.

---

## LOW-7 — An abandoned hold's image, caption and link sit in the row until some unrelated caller happens to reserve

**Where.** `sweepExpiredReservations` has exactly two callers:
`reserveRect` (`reserve.ts:107`, inside the transaction) and
`checkReservationLimits` (`limits.ts:116`). There is no scheduled sweep and
nothing else calls it.

On a quiet board — nights, weekends, the long tail after launch — an expired
reservation keeps `pending_image` (up to 100 KiB), `pending_image_mime`,
`caption` and `link` indefinitely. No route serves them: every read applies
`LIVE` (`blocks.ts:108-109`), which excludes an expired reservation, and the
composite and the image route apply `publishesTextSql`. So this is retention,
not exposure.

It still matters because it is exactly the material the product does not want
to be holding: content uploaded to a free hold that nobody paid for and nobody
owns, including whatever a phishing attempt uploaded before abandoning the
hold.

**Proposed fix.** Either call the sweep from a route that runs on any traffic
(`GET /api/board` is the obvious one — it already runs several queries), or
accept it and say so in a comment on `sweepExpiredReservations`, which currently
says only *"This exists so the table does not grow a tail of dead rows"* and
does not mention that the tail carries content.

---

## INFORMATIONAL-1 — The existence of an admin surface is disclosed, deliberately, in two places

`src/app/admin/page.tsx:79-80` renders the `NotConfigured` panel naming
`ADMIN_TOKEN`, and `POST /api/admin/session` answers 503 with the same fact.
Both are documented decisions with stated reasoning
(`admin-guard.ts:16-22`, `session/route.ts:48-62`, `page.tsx:19-31`), and
`requireAdmin` correctly refuses to copy them. Recorded so the next reader knows
it was checked and is a decision, not a leak. LOW-5 above is the one place the
exception spread past its justification.

## INFORMATIONAL-2 — The signed message is reconstructed, and it is safe today because every field is server-held

`consumeReleaseChallenge` (`release-challenge.ts:130-136`) rebuilds the message
from `action` (a hard-coded literal), `orderId` (the URL, but bound by
`AND order_id = $2` in the UPDATE), `nonce` (the row's primary key) and
`issued_at` (read back from the row). No attacker-influenced value reaches the
message without first having to match a stored row, which is the property that
makes reconstruction equivalent to storage here.

The one fragility worth naming: `issuedAt` is round-tripped as
`Date → timestamptz → Date → toISOString()`. `node-postgres` writes a JS `Date`
at millisecond precision, so it survives — but the same class of mismatch has
already bitten this repository once, and `hold-meter.ts:45-50` records it:
*"Passing the expiry in through JavaScript did exactly that once: `timestamptz`
keeps microseconds and a `Date` keeps milliseconds, so the two were a few
microseconds apart every time."* If anyone ever changes the INSERT at
`release-challenge.ts:74-77` to use `now()` instead of a JS `Date`, every
signature verification breaks — silently, as a 403 that looks like a wrong key.
Storing the message text alongside the nonce would remove the class entirely.

## INFORMATIONAL-3 — An admin session is not bound to the address that created it

`admin_sessions.ip_hash` is written (`admin.ts:156-172`) and never compared;
`resolveAdminSession` (`:183`) checks only id, revocation and expiry. A stolen
cookie works from anywhere for up to 12 hours. This is consistent with what
`admin.ts:14-30` already admits — there is no revoke-anybody's-session surface,
and the two real answers are clearing `ADMIN_TOKEN` or psql — so it is recorded
rather than argued. Binding to `ip_hash` would break an operator on a mobile
network; the honest upgrade is the revoke-any-session surface the module already
names as missing.

---

# WHAT HOLDS

Everything below is something I actively tried to break and could not, with the
method used.

**Area 4 — the challenge, which is the strongest code in this audit.**

- *The nonce is single-use and it is spent before the signature is examined.*
  `release-challenge.ts:118-128` stamps `used_at` in the same UPDATE that reads
  the row, with `used_at IS NULL` in the WHERE; `verifySignature` is not called
  until line 136. Two requests carrying the same captured signature serialise on
  the row lock and the second updates nothing. There is no read-then-write
  window and no path where a failed verification leaves a live nonce. I looked
  specifically for the grind-against-a-nonce pattern; it is not reachable.
- *Cross-order replay.* The UPDATE's `AND order_id = $2` binds the nonce to one
  order, and the message names the order too. A challenge minted for order A
  presented at `DELETE /api/orders/B` matches no row.
- *Cross-route and cross-action replay.* `challengeMessage`
  (`signature.ts:78-89`) puts `SIGNING_DOMAIN` and `Action:` in the signed text,
  and `ChallengeAction` currently has one member, so there is no second action a
  signature could be moved to. Domain separation is present *before* it is
  needed, which is the right order.
- *Expiry.* `AND expires_at > now()` is in the spending UPDATE itself, so an
  expired challenge is dead whether or not the housekeeping DELETE at
  `:68` has run. I checked the case of an expired-but-unswept row: unusable.
- *ed25519 edge cases.* Wrong-length key, wrong-length signature, non-base58
  input, and a 32-byte value that is not a curve point are each answered `false`
  rather than thrown (`signature.ts:102-123`); the `createPublicKey` throw is
  caught for exactly the off-curve case. A signature over an empty message is
  not constructible: the message always contains five lines.
- *The base58 decoder's arithmetic.* I hand-checked the leading-zero fix the
  header claims (`"1"` → `[0]`, `"11"` → `[0,0]`, `"12"` → `[0,1]`) and the carry
  bound (`255 × 58 + 57 = 14847`, so `carry` never exceeds 57 after the shift and
  cannot overflow a JS number). The correction over the `outbid-tokens` original
  is real. Only the *cost* is wrong (HIGH-1), never the answer.
- *The DELETE's ladder.* `orders/[id]/route.ts:110-137` checks the signature
  before the order's status, so a stranger cannot tell a held rectangle from a
  sold one; every failure answers the single `UNSIGNED` 403.

**Area 3 — unpaid content, and the races.**

- *No route publishes anything belonging to an unpaid reservation.* I traced all
  five: `/api/board` (`blocks.ts:125-132`, a whitelist of id and four numbers),
  `/api/blocks/[id]` (`:152-162`, caption/link/fit each wrapped in
  `publishesTextSql`), `/api/blocks/[id]/image` (`:189-198`, `hasPublicImageSql`),
  `/api/wall/[version]` (`composite.ts:146-153`, `publishesTextSql` in
  `visiblePurchases`, and again in `wallFingerprint` so a hold cannot even
  trigger a rebuild), and `GET /api/orders/[id]` (`toPublicOrder`). The predicate
  is one function aliased in one file, not a rule copied five times — which is
  why the caption-and-link regression named in `block-image.ts:16-22` cannot
  recur by drift. `grep`ping every `SELECT` in `src/lib` that names `caption`,
  `link`, `pending_image` or `buyer_pubkey` returns three sites, all accounted
  for. LOW-1 is the one leak past this, and it is metadata, not content.
- *A takedown reaches every reader.* `notTakenDownSql` is inside
  `publishesTextSql`, so `hidden_at` takes effect on the details route, the image
  route and the wall at once, and the admin tests assert against those three
  rather than against the column.
- *The sweep cannot cost a buyer their rectangle.* Under READ COMMITTED — which
  is what `transaction()` uses (`db.ts:72-85`, no `SET TRANSACTION ISOLATION`) —
  if `markPaid`'s UPDATE commits first, the sweep's `DELETE … WHERE status =
  'reserved'` re-evaluates its qualification against the updated tuple and skips
  it, so a row that just became `paid` is not deleted. If the DELETE commits
  first, the UPDATE matches zero rows and `orders.ts:273` turns that into
  `OrderExpired` rather than a 500. Both orders are safe, and the second is
  explicitly handled.
- *Two callers cannot hold overlapping rectangles.* The sweep and the INSERT are
  in one transaction on one connection (`reserve.ts:106-141`), so they see one
  snapshot; the loser of a race gets 23P01 from `blocks_no_overlap`, which is a
  GiST exclusion constraint and not a check-then-act. This is `CLAUDE.md`'s own
  worked example of rung 4 and it holds.
- *The hold budget cannot be zeroed by churn.* I tried the obvious evasion —
  take a 10,000-pixel hold, release it, retake it immediately — because
  releasing deletes the block row. It fails: `hold_meter` has **no** foreign key
  to `blocks` (`008_hold_meter.sql:19-22`, deliberate), `endHoldCharge` clamps
  with `LEAST` rather than deleting, and `spentPixelMinutes` prorates inside the
  window. Holding 10,000 pixels continuously costs 600,000 pixel-minutes an hour
  against a 300,000 budget, so the churn buys about half an hour and then stops.
  The unit really does collapse area, duration and renewal into one number.
- *A resume is not a free extension.* `resumableHold` runs after the transaction
  has rolled back, so `chargeHold` never fires twice, and it returns the existing
  row's `expires_at` and `payment_fraction` — it cannot extend a clock or change
  the amount owed. `limits.ts:108-113`'s `resuming` flag waives area and budget
  only, never the live-hold count.
- *Uploaded bytes cannot become a different content type.* The mime is derived
  from `sharp().metadata().format` and checked against a four-member allowlist
  (`content.ts:164-167`), never from `declaredMime`; SVG decodes as `svg` and is
  refused. The image route sends `x-content-type-options: nosniff`. Links are
  `https:`-only with a non-empty hostname (`link.ts:55-69`), so `javascript:` and
  `data:` cannot be stored.
- *The oversized-upload path is gated before buffering* (`content/route.ts:51-55`),
  and the 100 KiB cap is enforced before `sharp` ever decodes
  (`content.ts:146-156`) — which is the same control `SECURITY.md` § "Enforced
  conditions" item 3 depends on.

**Area 6 — admin.**

- *It fails closed, including for cookies minted while the token was set.*
  `resolveAdminSession` gates on `adminConfigured()` (`admin.ts:183-192`), and it
  is the single choke point: `authenticateAdmin` and `adminSessionLabel` both go
  through it, and `authenticateAdmin` checks `adminConfigured()` again first. I
  looked for a second cookie-to-identity path and there is none. This makes
  `SECURITY.md` § Takedown's promise true: *"clearing it is how an operator takes
  the surface down in a hurry: sessions already signed in stop resolving with
  it."*
- *Every admin route is behind the guard.* `grep` over `src/app/api/admin/`
  returns three handlers with `requireAdmin` as their first statement and one
  (`session`) that is the sign-in and is meant to be open. There is no
  `middleware.ts` in this repository, so no route depends on a guard that could
  be bypassed by matcher configuration.
- *The refusal is uniform in body, status, headers and clock.* One
  `adminRefusal()` for every failure mode, and `holdRefusal` floors it at 250ms
  so an unconfigured deployment (zero round trips) does not answer faster than a
  wrong token (four). The floor is one-directional and the comment explains why
  padding to `floor + elapsed` would be worse. I could not find a failure mode
  that returns something else.
- *The token comparison leaks neither length nor identity.* Both sides are
  hashed to 32 bytes before `timingSafeEqual` (`admin.ts:106-118`), so a
  wrong-length guess costs what a wrong-content one does, and the loop does not
  break on a match.
- *Session fixation is not possible.* The id is 32 fresh random bytes per
  successful login (`admin.ts:157`); nothing accepts a caller-proposed id.
- *Cookie flags are right, including the conditional `Secure`.*
  `HttpOnly; SameSite=Strict`, and `Secure` derived from `x-forwarded-proto`
  rather than `NODE_ENV` (`session/route.ts:170-193`), with the unparseable case
  defaulting to `Secure`. I assessed the conditional specifically: deriving from
  the request means a staging deploy that forgot `NODE_ENV` still gets `Secure`,
  which is strictly better than the usual `NODE_ENV === "production"`, and the
  only case that drops it is plain-HTTP localhost. `SameSite=Strict` is also what
  closes CSRF on all three admin routes — I checked the `enctype="text/plain"`
  trick against `POST /api/admin/blocks/[id]`, and it fails because the cookie is
  never sent cross-site.
- *The purge confirmation is enforced server-side and cannot be bypassed.*
  `blocks/[id]/route.ts:112-120` compares `confirm` against `purgeConfirmation(id)`
  exactly — no trim, no case folding — and returns *before* `perform` is reached,
  so a wrong confirmation leaves every byte. The string is defined once
  (`admin-client.ts:60-62`) and imported by both sides, and the client passes the
  operator's typing through unrepaired. `purge` additionally takes `FOR UPDATE`
  so two operators produce one purge and one honest "nothing happened".
- *No admin action can move ownership or resell a rectangle.* `hide`, `unhide`
  and `purge` never name `status`, `buyer_pubkey`, `x`, `y`, `w` or `h`, and
  `blocks_owner_is_final` (migration 006) would refuse the write if they did.
  There is no fourth action, which is what `SECURITY.md` § Takedown demands:
  *"a route that could hide something this section does not describe would be a
  route contradicting its own specification."*
- *The takedown list does not render the material.* `listHidden` selects seven
  columns and neither `caption` nor `link` is among them
  (`takedown.ts:78`, `:204-228`) — the reasoning is written out, and it is the
  right call for the one session in the project worth the most to steal.
- *The lockout counts backwards from the newest failure and a success ends the
  streak* (`admin.ts:272-305`), so an attacker cannot wait out a fixed window
  boundary, and an operator who mistypes four times and then succeeds is not one
  typo from locking themselves out. The lockout is per-address, so an ordinary
  attacker cannot deny the operator their console — MEDIUM-4 is the one
  configuration under which that stops being true.
