# Security audit — the server key, secrets, rate limiting and the image pipeline

Scope: AREAS 5 (the collection-authority key), 7 (secrets) and 8 (rate limiting
and the image pipeline). Branch `main` at `43226a9`. Static analysis plus two
real production builds and three local `sharp` experiments. **No database was
written to.** The working tree is clean.

Every verdict below quotes the governing line from the document it rests on —
`SECURITY.md`, `CLAUDE.md` or `.env.example` — read at the time of writing, not
from memory.

---

## Summary by severity

| Severity | Count |
| --- | --- |
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 4 |
| LOW | 5 |
| INFORMATIONAL | 4 |

---

## AREA 5 — THE SERVER KEY: the current truth

**The key does not exist in this repository, in any form, and neither does any
code that would use it.** Established empirically:

```
$ grep -rn "COLLECTION_AUTHORITY" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git .
SECURITY.md:153, SECURITY.md:181, SECURITY.md:227, SECURITY.md:270
docs/superpowers/specs/2026-08-25-milliondollarpage-design.md:515
```

Five hits, all prose. No hit in `src/`.

```
$ find . -name '*startup*' -not -path './node_modules/*' -not -path './.git/*'
(no output)

$ grep -rhoE "process\.env\.[A-Z_0-9]+" src | sort -u
process.env.ADMIN_TOKEN
process.env.ALLOW_STUB_PAYMENTS
process.env.ALLOW_UNTRUSTED_CLIENT_IP
process.env.DATABASE_POOL_MAX
process.env.DATABASE_URL
process.env.NEXT_RUNTIME
process.env.NODE_ENV
process.env.RATE_LIMIT_SALT
process.env.TEST_DATABASE_URL
process.env.TRUSTED_PLATFORM_HEADER
process.env.TRUSTED_PROXY_HOPS
```

`COLLECTION_AUTHORITY_SECRET` is not in that list. Neither is `PAYMENT_WALLET`.
There is no `startup-check.ts`, no `@solana/*`, no `@metaplex-foundation/*`, no
Irys client and no `sharp`-adjacent upload path that reaches a chain. `package.json`
has five runtime dependencies: `next`, `pg`, `react`, `react-dom`, `sharp`.

Answering the questions as asked:

- **Is the zero-balance invariant asserted by CODE and by a TEST?** No. Neither.
  It is prose only, and there is nothing for it to assert against.
- **Can the key ever RECEIVE or MOVE funds?** It cannot, because it does not
  exist and no code constructs a transaction of any kind. `SECURITY.md:157`'s
  "The treasury is receive-only from the application's point of view. There is
  no withdrawal path, no signing, and no code that could construct one" is
  literally true today — there is no signing code at all.
- **Is the key ever written to disk, logged, included in an error, or sent to a
  client?** No, for the same reason. But see **F2** — the toolchain already
  writes this repo's *other* secrets to disk unprompted, which is a direct
  prediction about what will happen to this one.
- **Where does it come from, and does it fail closed?** Nowhere. Not applicable
  yet. `src/lib/config.ts:8` establishes the repo's convention (`required()`
  throws rather than defaulting), which is the right shape for it to land in.

**Is SECURITY.md honest about the gap?** Partly, and this is F3 below.
`SECURITY.md:226-238` is exemplary — it says in as many words "There is no
`startup-check.ts` in this repository, nothing reads `COLLECTION_AUTHORITY_SECRET`,
and no balance is checked anywhere." That paragraph is exactly right and it is
verified above. Two *other* passages in the same document contradict it and read
as present-tense fact.

---

## FINDINGS

### F1 — HIGH — `POST /api/orders/[id]/release-challenge` is an unauthenticated, unlimited database write

**`src/app/api/orders/[id]/release-challenge/route.ts:26-37`**, calling
**`src/lib/board/release-challenge.ts:68,75`**.

The handler is thirteen lines and contains no `identify()`, no limit check and
no authentication of any kind:

```ts
export async function POST(_request: Request, { params }): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return problem(404, "That order does not exist.");
  const order = await getOrder(id);
  if (!order) return problem(404, "That order does not exist.");
  return json(await issueReleaseChallenge(id), { headers: NO_STORE });
}
```

`issueReleaseChallenge` then performs **two more statements per call**:

```ts
await execute("DELETE FROM release_challenges WHERE expires_at < now()");   // :68
await execute("INSERT INTO release_challenges (...) VALUES ($1,$2,$3,$4)", ...); // :75
```

So one unauthenticated HTTP request = one `SELECT` (`getOrder`), one table-wide
`DELETE`, and one `INSERT`. Nothing counts them.

**Attack scenario, with real values.** `GET /api/board` is public and returns
`rects`, each carrying a live block's `id`. Take one, say
`3f2b1a90-4c5d-4e6f-8a7b-0c1d2e3f4a5b`. Then:

```
while :; do curl -s -X POST https://milliondollarpage.fun/api/orders/3f2b1a90-.../release-challenge & done
```

At 500 requests/second this is 1,500 statements/second against a pool whose
ceiling is **10 connections** (`src/lib/db.ts:38`, `max: Number(process.env.DATABASE_POOL_MAX ?? 10)`).
The pool is shared by every route, so `/api/board`, `/api/reserve` and the
checkout stall behind it: this is a full-site outage driven from one unauthenticated
endpoint that needs no wallet, no hold and no money. Secondary effects: the
`release_challenges` table holds 120 seconds of inserts at all times (the TTL in
`release-challenge.ts:39` is `CHALLENGE_TTL_MS = 120_000`), so ~60,000 rows at
that rate, and the per-call `DELETE` scans and locks against every concurrent
inserter.

**The rule it violates.** The route's own header comment argues the endpoint is
safe to leave unauthenticated — "A challenge is a random number and a sentence;
it is worth nothing without the private key" — which is true about *confidentiality*
and says nothing about *cost*. `src/lib/callers/limits.ts:8` states the standard
this repo actually holds itself to: "Creating a hold is free and takes a
rectangle off the board, which makes it the cheapest thing on this site to
abuse." Minting a challenge is now cheaper than creating a hold, and it is the
only free write on the site with no ceiling at all. `CLAUDE.md` also names the
class explicitly among the four things that are "never simplified away, at any
level: input validation at trust boundaries, security, error handling that
prevents data loss, and accessibility basics."

**Proposed fix.** Add `identify()` and a limit to this route, the way
`/api/reserve` and `/api/orders/[id]/content` already do. The lazy version that
reuses what exists: call `identify(request)` and then the in-memory
`checkContentSubmissionLimits`-shaped counter (a second `CHALLENGE_LIMITS` entry
in `limits.ts`), so no migration is needed. The correct version, if the batch is
already carrying a migration: a per-order or per-caller cap in SQL, since the
in-memory one is per-process (see **F5**).

---

### F2 — MEDIUM — the build cache writes `ADMIN_TOKEN`, `RATE_LIMIT_SALT` and the database password to disk in plaintext

**`.next/cache/turbopack/v16.3.2-d0ac8828/*.sst`** and
**`.next/dev/cache/turbopack/v16.3.2-d0ac8828/*.sst`** — 19 files.

Established by the empirical procedure in **AREA 7** below. Turbopack records the
values of the environment variables it treats as cache keys, and stores them
verbatim in its persistent on-disk cache. Redacted evidence:

```
$ strings .next/cache/turbopack/v16.3.2-d0ac8828/00000282.sst | grep -F "$ADMIN_TOKEN"
TOKEN <ADMIN_TOKEN_VALUE>
!TOKEN <ADMIN_TOKEN_VALUE>

$ strings .next/cache/turbopack/v16.3.2-d0ac8828/00000230.sst | grep -F "$RATE_LIMIT_SALT"
FLIMIT_SALT@<SALT_VALUE>
MLIMIT_SALT@<SALT_VALUE>
```

The full 64-character `RATE_LIMIT_SALT`, the full 32-character `ADMIN_TOKEN`, and
the `DATABASE_URL`/`TEST_DATABASE_URL` user, password and host all appear. They
appear **only** in the cache — not in `.next/static` (client-served), not in
`.next/server`, and not in any prerendered HTML. Verified:

```
$ grep -rl -F -- "$RATE_LIMIT_SALT" .next/static .next/server ; echo "(none)"
(none)
$ grep -rl -F -- "$ADMIN_TOKEN" .next/static .next/server ; echo "(none)"
(none)
```

**Attack scenario.** `.next/` is gitignored (`.gitignore:17`, `/.next/`), so this
is not a repository leak. It is an artefact leak. Three concrete paths: (a) on
Vercel, `.next/cache` is preserved and restored between builds, so the admin
token persists in build infrastructure after it is rotated in project settings —
step 6 of `SECURITY.md`'s rotation runbook ("Destroy the old secret everywhere it
exists: Vercel history, any local shell history, any password manager entry")
does not name the build cache and would miss it; (b) any archive of the working
tree that is not `git archive` — a `tar`, a backup, a Docker `COPY .`, a support
bundle — carries the operator's live admin token; (c) a developer machine keeps
`.next/dev/cache` indefinitely.

**Why this matters more than its own severity.** `SECURITY.md:239-241`, condition
2, promises of the future key: *"**Environment only.** The secret is read from
`process.env` and never written to disk, never logged, and never included in an
error message or a response body."* That promise is not currently violated only
because the key does not exist. This finding is proof that the toolchain will
violate it automatically the day `COLLECTION_AUTHORITY_SECRET` is added to Vercel
and read by any module — no code change and no mistake required. Condition 2 is
a claim about a property nothing enforces.

**Proposed fix.** Two parts, neither of which is a one-liner. (1) Rotate the
local `ADMIN_TOKEN` and `RATE_LIMIT_SALT` if this cache has ever left the
machine. (2) When the key lands, add the build cache to `SECURITY.md`'s rotation
step 6, and add a check — the natural home is the same `startup-check.ts`
condition 1 already calls for — that fails the build if the secret is found in
`.next/`. The cheapest partial mitigation available today is not reading the
secret from a module Turbopack compiles at all: read it only inside
`instrumentation.ts`'s `register()`, which already exists and already runs
Node-only.

---

### F3 — MEDIUM — `SECURITY.md` asserts the zero-balance startup check as an existing control in two places, and miscounts its enforced conditions in a third

**`SECURITY.md:154`, `SECURITY.md:222`, `SECURITY.md:271`.**

`SECURITY.md:226-238` is honest and correct. Three other lines in the same
document are not, and they are the lines an operator is most likely to act on.

1. **`SECURITY.md:154`** — the two-wallets table:
   `| Holds value | Yes, all of it | **Never.** Enforced at startup |`
   "Enforced at startup" is present tense and unqualified. Nothing is enforced at
   startup. `src/instrumentation.ts` runs exactly two checks —
   `assertStubPaymentsNotInProduction` and `assertUntrustedClientIpNotInProduction`
   — and neither concerns a balance.

2. **`SECURITY.md:271`** — the rotation runbook, step 4:
   *"The startup check will refuse to boot if the new key holds any balance,
   which is the intended smoke test."*
   An operator following this runbook would rotate a key, redeploy, see a
   successful boot, and conclude the balance was verified. Nothing was verified.
   This is the most dangerous of the three because it is written as an
   operational procedure rather than as background.

3. **`SECURITY.md:222`** — *"Three of these are conditions the code enforces
   today. The first is not yet."* Of the four conditions, exactly **one** is
   enforced by code:
   - #1 zero balance — correctly marked unbuilt.
   - #2 "Environment only" — not enforced by anything; see **F2**, which shows
     the opposite already happens to its peers.
   - #3 "100 KiB upload cap, enforced before any upload is attempted" — **genuinely
     enforced**, `src/lib/board/content.ts:147`. This is the one.
   - #4 "Mandatory plugins. A mint that would not carry `ImmutableMetadata`,
     `AddBlocker`, and an authority-less `Royalties` plugin must fail rather than
     proceed" — there is no mint path, so nothing enforces this either.

**The rule it violates.** `CLAUDE.md`: *"Every verdict cites the written rule. A
gate, a critique or a design judgement is made against the governing document
open in front of you… A review that recites the rule from memory is a review that
will confidently enforce a rule that was edited last week."* A governing document
that contradicts itself defeats that rule at the source. And `SECURITY.md:18-20`
sets its own standard: *"including where the answer is 'nothing yet', because a
promise with no mechanism under it is the kind of thing this file exists to stop
us believing."*

**Proposed fix.** Three edits, all documentation:
- `:154` → `| Holds value | Yes, all of it | **Never.** To be enforced at startup — see §Enforced conditions, not yet built |`
- `:271` → mark step 4's second sentence as conditional on the check existing.
- `:222` → *"One of these is a condition the code enforces today (the 100 KiB
  cap). The other three are contracts the key must arrive under."*

---

### F4 — MEDIUM — every rate limit on the site depends on two environment variables that `.env.example` does not mention

**`src/lib/config.ts:22-24` and `src/lib/config.ts:43`**, consumed by
**`src/lib/callers/client-ip.ts:70-94`**.

```ts
export function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;   // silent default
}
```

`TRUSTED_PROXY_HOPS` and `TRUSTED_PLATFORM_HEADER` are read by the code and
documented **nowhere**. `.env.example` documents six variables
(`DATABASE_URL`, `TEST_DATABASE_URL`, `RATE_LIMIT_SALT`,
`ALLOW_UNTRUSTED_CLIENT_IP`, `ALLOW_STUB_PAYMENTS`, `ADMIN_TOKEN`) and neither of
these. `SECURITY.md` does not mention them either.

Every limit in the product — the four reservation ceilings, the content
submission ceiling, and the admin login lockout — is keyed on `hashIp(clientIp(request))`.
If `TRUSTED_PROXY_HOPS` does not match the number of proxies actually in front of
the deployment, `clientIp` reads the wrong entry of `x-forwarded-for` and the
caller chooses their own bucket by sending the header.

**Attack scenario.** A deployment behind two hops (a CDN in front of Vercel, say)
with the default `hops = 1`. `client-ip.ts:87` computes `index = entries.length - hops`,
which now points at an entry the caller wrote. An attacker sends
`X-Forwarded-For: 10.0.0.1, 10.0.0.2` and gets a fresh rate-limit identity per
request: `RESERVATION_LIMITS.heldPixelsPerCaller` (10,000) becomes unbounded, and
the whole 1,250 × 800 wall — "a million dollars of inventory at list", in
`limits.ts:11`'s own words — is holdable again, which is precisely the attack
`limits.ts:8-17` says the four limits exist to close. The same forgery frees the
admin login lockout of `ADMIN_LOGIN_LIMITS.maxFailures = 5`.

**The rule it violates.** `.env.example`'s own stated convention, written out for
`DATABASE_URL`: *"Required, no default: a fallback would mean running against the
wrong database rather than failing."* `TRUSTED_PROXY_HOPS` has exactly the
fallback that convention forbids, and it is the one number every limit rests on.

**Proposed fix.** Document both variables in `.env.example` with the same care
the other six get, and set `TRUSTED_PLATFORM_HEADER=x-vercel-forwarded-for` for
the production deployment — `client-ip.ts:45-49` already allow-lists it, and the
platform-header path is the one that is unforgeable on Vercel regardless of hop
count.

---

### F5 — MEDIUM — the content-submission limit is per-process and its map grows without bound

**`src/lib/callers/limits.ts:223-243`.**

```ts
const recentContentSubmissions = new Map<string, number[]>();
```

Two separate problems in one structure.

**(a) It is not a limit on a serverless deployment.** The module's own comment
says so — *"That is a real gap in a deployment with more than one instance —
each instance has its own count"* — and this repo deploys to Vercel, where the
number of instances is elastic and an attacker generating load *causes* more of
them. The effective ceiling is not `20 per 10 minutes`; it is `20 × (instances)`,
and the attacker controls the multiplier. `POST /api/orders/[id]/content` is
therefore effectively unrate-limited on the path where an unauthenticated caller
buffers up to 118,784 bytes (`MAX_REQUEST_BYTES`, route line 14) and drives a
`getOrder` query, before the 403 lands.

**(b) The map never loses a key.** Line 228 filters *timestamps within* a key
when that key is read, but no key is ever deleted. One entry per distinct
`ipHash` (a 64-character hex string plus an array) accumulates for the process's
lifetime. A caller rotating source addresses adds one permanently-retained entry
per address.

**Attack scenario.** A botnet across 200,000 addresses submits one content POST
each. Every instance that served any of them holds those keys forever:
~200,000 × (64-byte key + array overhead) ≈ 30–50 MB of permanently retained
heap per instance, on top of the wall composite buffers. On a 1 GB Vercel
function this is a slow OOM rather than a fast one, which is worse — it presents
as intermittent 500s with no obvious cause.

**The rule it violates.** `CLAUDE.md`: *"error handling that prevents data loss"*
and *"security"* are named as never simplified away. The module comment is candid
that this was a deliberate shortcut, which is exactly the ponytail convention
(*"Every deliberate shortcut carries a comment naming its ceiling and its upgrade
path"*) — the ceiling was named, and this finding is the report that the ceiling
has been reached.

**Proposed fix.** (b) is close to a one-liner: prune empty keys in the same pass,
`if (timestamps.length === 0) recentContentSubmissions.delete(ipHash);`. (a)
needs the table the comment already names, in whatever batch next carries a
migration.

---

### F6 — LOW — `DELETE /api/admin/session` is an unauthenticated, unmetered UPDATE

**`src/app/api/admin/session/route.ts:115-145`**, calling
**`src/lib/admin.ts:190-192`**.

The handler checks `adminConfigured()` and then runs, for any cookie value a
stranger sends:

```ts
await revokeAdminSession(id);   // UPDATE admin_sessions SET revoked_at = now() WHERE id = $1
```

No `adminCaller()`, no login gate, no `requireAdmin`. The route's own comment
acknowledges fixing exactly this shape for the *unconfigured* case — *"a
deployment with no admin surface at all still ran an unauthenticated, unmetered
UPDATE against `admin_sessions` for any cookie value a stranger cared to send"*
— and left it standing for the configured case, which is every production
deployment with a console.

**Attack scenario.** `curl -X DELETE -H 'Cookie: mdp_admin=x' https://…/api/admin/session`
in a loop: one write-lock-taking `UPDATE` per request against a pool of 10, from
an unauthenticated caller. Same class as **F1**, smaller blast radius because the
statement matches no rows and admin traffic is low.

**Proposed fix.** Gate on the cookie actually resolving to a session before
writing, or run the same `adminCaller` + `checkAdminLoginGate` pair the POST
next door already uses.

---

### F7 — LOW — four write routes parse a JSON body with no content-length gate

**`src/app/api/reserve/route.ts:20`**, **`src/app/api/orders/[id]/route.ts:120`**,
**`src/app/api/orders/[id]/confirm/route.ts:47`**,
**`src/app/api/admin/blocks/[id]/route.ts:92`** — all `await request.json()` with
no prior size check.

`POST /api/orders/[id]/content` does have one (route lines 51-55, a 413 against
`MAX_REQUEST_BYTES` **before** any byte is read) and its comment explains exactly
why: *"an unauthenticated stranger must not be able to make this process buffer
an arbitrarily large request just by pointing it at any well-formed uuid."* That
reasoning applies verbatim to `/api/reserve` and to the DELETE, both of which are
reachable without authentication. Next.js App Router route handlers apply no
default body limit; the only ceiling is Vercel's 4.5 MB platform cap, which is a
property of the host and not of this code.

**Proposed fix.** Lift the four-line content-length gate out of the content route
into `src/lib/http.ts` next to `problem()` and `isUuid()`, and call it from each
JSON write route with an appropriate ceiling (2 KiB covers every body any of
them accepts).

---

### F8 — LOW — `DELETE /api/orders/[id]` has no caller identity and no limit

**`src/app/api/orders/[id]/route.ts:106-140`.**

The route's header comment states the position deliberately: *"There is no
`identify()` — no rate limit hangs off this, and a caller without the key can
neither delete anything nor learn anything by trying."* The first half is right;
the second half addresses confidentiality, not cost. Each unauthenticated request
still runs `getOrder` (a SELECT) and `consumeReleaseChallenge` (an UPDATE attempt
against `release_challenges`, line 126). Lower than **F1** only because the
UPDATE matches no rows without a live nonce.

**Proposed fix.** Whatever limit **F1** adds should cover this route too — they
are the two halves of one flow.

---

### F9 — LOW — there is no server-side ceiling on image processing or on any handler

`src/lib/board/with-timeout.ts` is a **client-side** helper: its own header says
*"A ceiling on how long any one request is allowed to keep a screen loading… A
modal that is waiting has nothing to show and nothing to press."* Its only callers
are in `src/components/`. No route exports `maxDuration`; the only route-segment
config in the repo is `export const dynamic = "force-dynamic"` in
`src/app/page.tsx:6` and `src/app/admin/page.tsx:45`.

So `validateContent`'s `sharp` call, `composeWall`'s full-wall composite, and
every `pg` query run with no application-level ceiling. The pool sets
`connectionTimeoutMillis: 10_000` (`db.ts:40`) but no `statement_timeout` and no
`query_timeout`. The effective ceiling is Vercel's function timeout, which is a
platform default this repo does not declare and could change under it.

**Proposed fix.** `export const maxDuration = 15;` on the composite-bearing and
image-bearing routes, and `statement_timeout` on the pool.

---

### F10 — LOW — `GET /api/board` can be made to re-composite the whole wall on every request

**`src/app/api/board/route.ts:36`** and **`src/app/page.tsx:16`** both call
`ensureWall()`, unauthenticated.

`ensureWall` (`composite.ts:280-298`) returns early when the fingerprint is
unchanged, which is the normal case and is why this is LOW. But when the rebuild
throws it catches, logs, and returns the previous wall — *without* recording that
the attempt failed. So a single unreadable row that makes `composeWall` itself
throw (rather than one `layer()` call, which is caught individually) turns every
board request into a full decode-and-composite of every purchase on the wall.
`/api/board` is polled by every open browser every 30 seconds, and there is no
in-process single-flight around `rebuild`, so N concurrent requests do N full
composites.

**Proposed fix.** Remember a failed fingerprint and back off, or wrap `rebuild`
in the `singleFlight` helper this repo already has at
`src/lib/board/single-flight.ts`.

---

### F11 — INFORMATIONAL — the local `ADMIN_TOKEN` is half the documented length

`.env.example` says `Generate with: openssl rand -hex 32`, which produces 64 hex
characters. The value in `.env.local` is **32** characters (128 bits). That is
still far beyond brute-force, especially behind `ADMIN_LOGIN_LIMITS` (5 failures
per 15 minutes), so this is a note and not a finding — but if the production
token was generated the same way, the document and the practice disagree.

### F12 — INFORMATIONAL — `DATABASE_POOL_MAX` is read but undocumented

`src/lib/db.ts:38`. Third undocumented variable, alongside the two in **F4**. It
sets the ceiling that **F1**'s attack exhausts, so it is worth documenting
together with them.

### F13 — INFORMATIONAL — git history is clean of secrets

Checked and nothing found. Details in the AREA 7 section below.

### F14 — INFORMATIONAL — no test covers secret hygiene in the build output

```
$ grep -rln "\.next\|bundle\|process.env.ADMIN_TOKEN" src --include="*.test.ts"
(no output)
```

The negative results in AREA 7 are true of commit `43226a9` and of nothing else.
Nothing would catch a regression — for instance, the day someone reads a secret
from a component that Next marks `"use client"`.

---

## AREA 7 — SECRETS, EMPIRICALLY

### The positive control

**A grep that finds nothing proves nothing until the grep is proved.** So before
trusting any negative result, a unique string was planted somewhere
client-reachable and the same grep was required to find it.

**Step 1 — plant.** `src/components/BoardView.tsx:404`, the root element of the
board's client component (`"use client"`), was changed from

```html
<div className="board-shell">
```

to

```html
<div className="board-shell" data-audit="PXAUDIT7f3c91e4d2b60a58SENTINEL">
```

**Step 2 — build.**

```
$ npm run build
✓ Compiled successfully in 447ms
… 15 routes … [exited with code 0]
```

**Step 3 — the control fires.**

```
$ grep -rl "PXAUDIT7f3c91e4d2b60a58SENTINEL" .next
.next/server/chunks/ssr/src_components_BoardView_tsx_1hikywe._.js
.next/server/chunks/ssr/src_components_BoardView_tsx_1hikywe._.js.map
.next/static/chunks/2acolr_fy14ix.js
```

Three files, and crucially one of them is under **`.next/static/`** — the
directory Next serves to browsers. The grep reaches the client bundle. The
negative results below are therefore meaningful.

**Step 4 — undo and confirm.** The file was restored from a pre-edit copy, the
project rebuilt, and both the source and the served output re-checked:

```
$ git status --porcelain
(empty)
$ grep -rl "PXAUDIT7f3c91e4d2b60a58SENTINEL" .next
(empty)
```

The tree is clean and the sentinel is gone from source and from the build output.

### The negative results

Every secret-shaped value in `.env.local` was extracted programmatically (never
printed) and searched for across all of `.next`, as its full value and — for the
connection strings — as its user, password and host components separately. No
value shorter than 6 characters was searched, since `"true"` matching is noise.

| Needle | Length | `.next/static` (client) | `.next/server` | Prerendered HTML | `.next/cache` |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` full | 151 | — | — | — | — |
| `DATABASE_URL` user | 12 | — | — | — | **19 files** |
| `DATABASE_URL` password | 16 | — | — | — | **19 files** |
| `DATABASE_URL` host | 57 | — | — | — | **19 files** |
| `TEST_DATABASE_URL` full | 144 | — | — | — | — |
| `TEST_DATABASE_URL` user | 12 | — | — | — | **19 files** |
| `TEST_DATABASE_URL` password | 16 | — | — | — | **19 files** |
| `TEST_DATABASE_URL` host | 54 | — | — | — | — |
| `RATE_LIMIT_SALT` | 64 | — | — | — | **19 files** |
| `ADMIN_TOKEN` | 32 | — | — | — | **8 files** |
| `COLLECTION_AUTHORITY_SECRET` | — | does not exist | | | |

- **Client bundle: clean.** No secret in `.next/static/**`.
- **Server bundle: clean.** No secret in `.next/server/**`.
- **Prerendered HTML: clean.** Three files exist (`_not-found.html`,
  `_global-error.html`, `faq.html`); no secret in any.
- **Client source maps: none produced.** `find .next/static -name '*.map'`
  returns nothing; `next.config.ts` does not set `productionBrowserSourceMaps`.
  Server-side `.map` files exist under `.next/server/chunks/ssr/` and are not
  served to browsers.
- **Build cache: NOT clean.** This is **F2**.

There is no `NEXT_PUBLIC_*` variable in this project at all, which is why a
planted string was used as the control rather than an existing public value.

### Secrets reaching logs

Every `console.*` in non-test source was enumerated (8 call sites). None
interpolates a secret:

- `http.ts:33`, `admin/session/route.ts:84`, `admin.ts:359` log a
  `clientIp` refusal reason, which names `ALLOW_UNTRUSTED_CLIENT_IP` and
  `TRUSTED_PROXY_HOPS` by name — variable names, never values, and deliberately
  routed to the server log rather than the caller.
- `admin/session/route.ts:64` and `admin-guard.ts:98` log that `ADMIN_TOKEN` is
  *unset*. A name, not a value.
- `composite.ts:296` and `orders.ts:366` log a caught error object. `pg`'s
  `DatabaseError` carries `message`, `code`, `detail`, `constraint` — never the
  connection string and never bound parameters, so an image's bytes and a
  buyer's wallet address stay out of the log.

### Server error text reaching the client

Checked as part of AREA 8 as well. Every `error.message` returned to a caller is
one of this codebase's own typed errors (`OrderNotFound`, `OrderNotYours`,
`OrderExpired`, `OrderNotReady`, `SignatureAlreadyUsed`) whose messages are
hand-written product copy. No `String(error)`, no `.stack`, no
`JSON.stringify(error)` reaches any response. Unhandled errors are re-thrown
(`reserve/route.ts:63`, `content/route.ts:119`, etc.), which in production Next
returns as an opaque 500 with a digest.

### `.gitignore` and git history

```
$ git check-ignore -v .env.local
.gitignore:34:.env*    .env.local

$ git ls-files | grep -i '^\.env'
.env.example

$ git log --all --diff-filter=A --name-only --pretty=format: -- '.env*' | sort -u
.env.example
```

`.env.local` is ignored and has never been tracked. `.env.example` is the only
env file in history, correctly whitelisted by `.gitignore:35` (`!.env.example`).

Pickaxe search for every live secret value across all refs:

| Value | Commits touching it |
| --- | --- |
| `RATE_LIMIT_SALT` | 0 |
| `ADMIN_TOKEN` | 0 |
| `DATABASE_URL` password | 0 |
| `DATABASE_URL` host | 0 |

Generic pattern sweep (`git log --all -S`): `postgres://` 0, `npm_` 0,
`BEGIN PRIVATE KEY` 0, `BEGIN RSA` 0, `eyJhbGciOi` 0. `postgresql://` matched 3
commits; every added line was inspected and all are placeholders or fixtures:

```
+DATABASE_URL=postgresql://...pooler...neon.tech/neondb?sslmode=verify-full&channel_binding=require
+const DIRECT = "postgresql://board_owner:npg_S3cr3t-t0ken@ep-still-fog-12345678.c-2.us-east-1.aws.neon.tech/…"
```

The second lives at `src/lib/__tests__/run-lock.test.ts:11-12` and uses an
obviously synthetic password and host. `sk-` matched 4 commits with no added line
containing it as a token prefix — substring noise (`risk-`, `task-`) in planning
documents.

**No secret has ever been committed to this repository.**

---

## AREA 8 — WRITE ROUTES, ONE BY ONE

Every route in `src/app/api/**` with a non-GET method. Named individually, as
asked, rather than summarised.

| Route | Method | Authentication | Rate limit | Verdict |
| --- | --- | --- | --- | --- |
| `/api/reserve` | POST | none | `checkReservationLimits` — 4 DB-backed ceilings (`limits.ts:130`) | **Limited.** The strongest on the site. |
| `/api/orders/[id]/content` | POST | `buyerPubkey` in body, checked before `sharp` | `checkContentSubmissionLimits` — **in-memory, per-process** (`limits.ts:225`) | **Weakly limited.** See **F5**. Has a content-length gate. |
| `/api/orders/[id]/confirm` | POST | `buyerPubkey` in body | **NONE.** Calls `identify()` at line 41 but never checks a limit with the result | **Unlimited** — mitigated to a 404 in production by `stubPaymentsAllowed()` at line 34. Becomes live when batch 3 lands. |
| `/api/orders/[id]/release-challenge` | POST | **none** | **NONE** | **Unlimited, and it writes a row per call. F1 — HIGH.** |
| `/api/orders/[id]` | DELETE | signature over a nonce | **NONE** | **Unlimited.** F8. |
| `/api/admin/session` | POST | `ADMIN_TOKEN` | `checkAdminLoginGate` — 5 failures / 15 min, DB-backed (`admin.ts:279`) | **Limited.** |
| `/api/admin/session` | DELETE | **none** | **NONE** | **Unlimited UPDATE.** F6. |
| `/api/admin/blocks/[id]` | POST | `requireAdmin` (`admin-guard.ts:88`) | inherits the login gate | **Limited.** |

Three write routes carry no ceiling of any kind:
`POST /api/orders/[id]/release-challenge`, `DELETE /api/orders/[id]`, and
`DELETE /api/admin/session`. A fourth, `POST /api/orders/[id]/confirm`, has none
but is currently 404 in production.

### The image pipeline

All of it in `src/lib/board/content.ts`, reached from
`src/app/api/orders/[id]/content/route.ts`.

| Control | Where | Value | Trusted from bytes? |
| --- | --- | --- | --- |
| Request size | `content/route.ts:51-55` | 118,784 bytes, refused **before** the body is read | declared `content-length`, deliberately |
| Image size | `content.ts:147` | 102,400 bytes (`STORED_MAX_BYTES`), refused **before** `sharp` | yes, actual buffer length |
| Format | `content.ts:160-167` | png / jpeg / webp / gif | **yes** — `metadata().format`, never `declaredMime` |
| Dimensions | `content.ts:178` | 1024 px per side (`STORED_MAX_LONG_EDGE`) | yes, from `metadata()` |
| Fit feasibility | `content.ts:279` | `canHonourContain` against the **order's** rectangle | yes, block comes from the order not the form |
| Caption | `content.ts:246` | 32 characters | — |
| Link | `link.ts` | 2048 chars, https only | — |

`ContentInput.declaredMime` is carried and **never read** — the comment at
`content.ts:111-114` says so and the code matches. The declared type is not
trusted anywhere.

**Decompression bombs — tested empirically, not reasoned about.** Three
experiments in a scratch directory (no database touched):

1. A flat 25000 × 25000 RGBA source could not even be *created*: sharp's own
   default `limitInputPixels` (268,402,689) refused it —
   `Error: Input image exceeds pixel limit`. Confirms the default is active;
   no code in this repo overrides it.

2. A 16000 × 16000 flat PNG, palette-encoded at `compressionLevel: 9`:
   **31,275 bytes.** That is comfortably **under** the 102,400-byte cap. So the
   byte cap alone does *not* stop a bomb — decoded, it would be 16000 × 16000 × 4
   = **977 MB** of RGBA.

3. The dimension check is what stops it, and it costs nothing, because
   `metadata()` parses headers rather than decoding pixels. Measured in a fresh
   process reading the bomb from disk:

   ```
   file bytes: 31275 | baseline rss MB: 83
   metadata: png 16000x16000 | 0.6 ms | rss MB: 84
   dimension cap 1024 rejects it? true
   ```

   **0.6 ms and 1 MB of RSS** to learn the file is 16000 × 16000, then
   `content.ts:178` rejects it with `image_too_large`. The bytes are never
   decoded. The ordering in `validateImage` — byte cap, then `metadata()`, then
   dimension cap, and no `.toBuffer()` anywhere in the validation path — is
   correct and is the thing that holds.

`sharp`'s only other decode site is `composite.ts:198-200`, which operates on
`pending_image` — bytes that already passed the above, so bounded to
1024 × 1024 × 4 = 4 MB each.

**Unauthenticated unbounded work or storage:** yes, twice — **F1** (unbounded
rows and statements) and, to a lesser degree, **F10** (unbounded `sharp` work
when the wall build is broken). Not through the upload path: an upload requires
an order the caller owns, and `attachContent` overwrites the same column rather
than appending, so per-order storage is capped at 100 KiB.

---

## WHAT HOLDS

Properties actively attacked and found sound, with how each was checked.

1. **No secret reaches the browser.** Proved rather than asserted: a planted
   sentinel was confirmed present in `.next/static/chunks/2acolr_fy14ix.js`, and
   the *same* grep found zero occurrences of `ADMIN_TOKEN`, `RATE_LIMIT_SALT`, or
   any component of either connection string anywhere under `.next/static` or
   `.next/server`. There is no `NEXT_PUBLIC_*` variable to leak, no client source
   map, and the three prerendered HTML files are clean.

2. **No secret has ever been committed.** Pickaxe search across all refs for each
   live value returned 0 commits; `.env*` has been ignored since the commit
   literally titled "Ignore env files before one exists to be leaked"; the only
   connection strings in history are a documentation placeholder and a test
   fixture with a synthetic password.

3. **The image pipeline defeats decompression bombs, and it was tested with a
   real one.** A 31,275-byte PNG that decodes to 977 MB passes the byte cap and
   is stopped by the dimension cap 0.6 ms later, having allocated 1 MB. Attempts
   to find an ordering flaw failed: there is no `.toBuffer()`, `.resize()` or
   `.raw()` between `sharp(bytes).metadata()` and the dimension check.

4. **The declared MIME type is genuinely never trusted.** Traced
   `declaredMime` from `route.ts:88` through `ContentInput` — it is destructured
   nowhere in `validateImage`, and the accepted-type check reads
   `metadata().format`. A `.exe` renamed to `.png` with `Content-Type: image/png`
   is rejected by `image_wrong_type`, not by its name.

5. **The `22P02` class of bug is closed everywhere it can occur.** Every
   parameterised route calls `isUuid` (or `isWallVersion` for the 64-hex wall
   path) before touching Postgres: `blocks/[id]`, `blocks/[id]/image`,
   `orders/[id]` GET and DELETE, `orders/[id]/confirm`, `orders/[id]/content`,
   `orders/[id]/release-challenge`, `admin/blocks/[id]`, `wall/[version]`. Nine
   for nine. All answer the same 404 a valid-but-absent id gets.

6. **No Postgres, `sharp` or stack-trace text reaches a client.** Enumerated
   every `error.message` returned in a response: all eleven are this codebase's
   own typed order errors with hand-written copy. No `String(error)`, no
   `.stack`, no `JSON.stringify(error)` in any route. Unhandled errors are
   re-thrown to Next's opaque 500.

7. **The admin surface fails closed and refuses uniformly.** `adminConfigured()`
   is checked at every path that turns a credential into an identity
   (`admin.ts:170`, `:322`, `:396`; `admin-guard.ts:95`;
   `admin/session/route.ts:76`, `:117`). Token comparison is over fixed-length
   SHA-256 digests with no early break (`admin.ts:107-119`), and `holdRefusal`
   floors every refusal at 250 ms so the unconfigured path's zero database
   round-trips cannot be distinguished by latency from the configured path's
   four. I looked for a path that distinguishes "no session" from "bad session"
   from "no admin surface" and did not find one outside the deliberately
   documented exception on the sign-in route itself.

8. **No SQL injection.** Every statement in `src/lib/**` uses `$n` placeholders.
   The only template interpolations into SQL are `${KEEP_VERSIONS}`
   (`composite.ts:333`), a module constant of `3`, and `publishesTextSql(1)`,
   which emits a placeholder index rather than a value.

9. **The 100 KiB cap — `SECURITY.md` condition 3 — is real.** It is checked at
   `content.ts:147`, before `sharp`, against the actual buffer length rather than
   a header. Of the four "enforced conditions", this is the one that stands, and
   it stands exactly as written.

---

*Auditor scope: AREAS 5, 7, 8 only. Static analysis and local builds; no database
was read or written. Two production builds were run and their artefacts left in
the state the second build produced. `git status` is clean.*
