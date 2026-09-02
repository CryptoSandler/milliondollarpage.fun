# Decisions with a door

Decisions the owner has taken, and decisions deliberately left open. A decision
recorded here is one somebody can reverse on purpose rather than discover by
accident. Where a door is left open, both futures are written out, because the
mechanism that stays compatible with both is the point.

Nothing here is a promise to a buyer. Product copy says less than this file
does, on purpose.

---

## Open: whether a block can ever change hands

**Status: undecided, and not to be answered by anything shipped.**

Transfer is not built, not promised, and not forbidden. The words
"non-transferable" must not appear in copy, FAQ, docs or `SECURITY.md`, and no
page answers the question in either direction. The permanence invariant is
written so it stays true under both futures: a sold pixel does not change owner
or content without its owner's signature, and it never expires.

**If it is ever opened:** the trigger `blocks_owner_is_final` is what would have
to be relaxed, and it is deliberately written to forbid an unsigned owner change
rather than to forbid all owner change.

---

## Settled: the on-ramp is a link, not an integration

**Status: settled 2026-08-28. Reversible on real data.**

Buyers need SOL or USDC in their own wallet. The evaluation is in
`docs/onramp-evaluation.md`.

**What ships:** a plain outbound link to Ramp Network's public buy page. No
legal entity, no KYB, no verified domain, no API key, no merchant account. The
provider's own fees are stated in our copy, in the checkout, where a buyer of a
large rectangle will see them before they commit.

**Why not the merchant integration:** every provider requires an API key that
identifies the owner as the merchant, and Ramp additionally requires a
registered legal entity and a commercially owned domain. The owner has neither,
and this repository has no DNS. Paying that cost before knowing whether anybody
clicks the link is the wrong order.

**The door, and what opens it:** REAL CLICK DATA. When the outbound link shows
that buyers actually use it, the merchant integration becomes worth its cost —
a pre-filled destination wallet and a purchase that returns to the board. Until
then it stays a link.

**The fact that shapes the product, recorded because it is easy to forget:**
**Argentina and Chile have no local-currency rail** at Ramp or at Transak.
MoonPay's own API reports both as buyable, so a documented fallback link is the
answer for those two markets rather than pretending the coverage is uniform.
Spain, Mexico, Brazil, Colombia and Peru are covered by Ramp with local rails,
confirmed per-currency against its live public API rather than a marketing page.

**Rejected, with the arithmetic:** MoonPay's 20 EUR minimum purchase against a
4.50 EUR minimum fee is 22.5% on its own smallest permitted transaction, in a
product that sells one dollar at a time. Coinbase requires a Spanish or Latin
American buyer to open an account and pass KYC to buy three dollars of pixels.

---

## Settled: the instruction line is the overlay's second row, not a dock

**Status: settled 2026-09-01 by the owner, on measurement.**

The line that replaced the interaction legend was docked where the purchase
panel docks, and a dock is a third band: idle chrome went 60px → 93px on
desktop, 34px → 70px at 390. The owner chose the other option — the line is the
second row of the board's own overlay, directly under the preset pill. The idle
budget stays 60, `scripts/board-share.mts` reports every viewport inside it, and
the board's rectangle is unchanged to the pixel at every width.

---

## Settled: two themes, a white receipt, and a violet this design did not choose

**Status: settled 2026-09-02 by the owner. Three decisions, two of which are
exceptions to rules this document already carries.**

**The theme is two states and "system" is gone.** A stored choice still rules;
a reader who has never chosen gets **dark**. The control is a switch rather than
a button with a word on it, the knob crosses 18px and the chrome cross-fades,
both in 220ms, and nothing animates the wall. What it costs is written into
DESIGN.md rather than hidden: a reader who chose light on a dark machine has no
way back to *follow the machine*, and with JavaScript off the media query still
decides.

**The purchase panel is white in both registers, because it is the receipt.** It
re-declares the light palette on itself rather than overriding a colour, so
every child becomes light through the tokens it already used. Measured: `ink` at
15.31 on the panel, the panel at **19.46:1 against the dark wall** — and 1.17
against the cream one, where its `control-line` border carries the boundary
instead, at 4.23 and 3.62. `--primary` is not re-declared, so Buy stays the
register's accent.

**The wallet control leaves the panel for the header, in a violet that is not
the accent.** The accent means money moving now and a Connect control is the
thing that happens before anything moves. The violet is the wallet convention —
wallet-adapter's `#512da8` in light at 7.86 against the bar, Phantom's `#ab9ff2`
in dark at 8.31 — themed because the light one measures 2.01 against cream and
fails 1.4.11. **Buy is enabled without a wallet** and opens the connector rather
than refusing, which is what took the sentence *Connect a wallet to buy* out of
the panel's middle.

**The doors:** the two violets are one token pair; the receipt is one block of
re-declarations; and `THEME_FADE_MS` is 220. Inverting the stylesheet so bare
`:root` is dark would close the no-JS gap and re-open every measured ratio.

---

## Settled: rails come in pairs, and the register ticks in both

**Status: settled 2026-09-02 by the owner, on three reports from production.**

**A rail down one side is a board off centre.** The first tools rail put a
column on the left and left an identical empty gap on the right; at the owner's
2495×1484 the wall read as slipped. Both sides now carry the same width or
neither exists, and one gap decides which pair: **180px** for the full pair
(controls and purchase panel left, register and standings right) and **108px**
for the tools pair (controls left, register right). Measured in the rendered
page, the board's two margins agree to within a pixel at 1920, 2495 and 2560.

**The wall gained at both new viewports** and lost nothing anywhere:
1567×1004 → **1607×1030** at 1920×1080, and 2193×1404 → **2238×1434** at
2495×1484, which is 86.7% of that screen.

**The register is a ticker in both orientations**, which reverses last batch's
"the register does not roll in the rail". The owner's reason is the one the rail
was built on: the thing that moves fast is the evidence, and a register that has
stopped is a list. It pauses on hover and on focus, `prefers-reduced-motion`
stops it and drops the seamless duplicate, and with nothing settled the sentence
that says so is the only item and does not move.

**The doors:** `TOOLS_RAIL_MIN` (108) and `TOOLS_RAIL_MAX` (160) are the tools
pair's floor and ceiling; the 150px container query is where a row drops its
thumbnail; `3.2s` a row is the ticker's speed and is the one number here nobody
measured.

---

## Settled: a tools rail where there is room, and an overlay that hides itself where there is not

**Status: settled 2026-09-01 by the owner, on the measurement below. Both halves
are reversible and each is one constant.**

The exemption that lets the board's overlay stand on the board carried a
condition — it may not cover sold pixels — and measurement showed it did, at
1440×900, 1920×1080 and 1280×800. It also showed that this document's oldest
claim about that overlay, *"it costs the wall a strip of its own top margin"*,
was never true: the margin is the 8px board inset and the overlay is 40px, or
81px with the instruction line under it.

**What ships, in three parts:**

- **A tools-only rail** — the presets, the zoom and the instruction line in
  their own column in the letterbox — wherever the gap clears **108px**, which
  is what those controls measure. The full rails stay at 180 and still win where
  they fit. At 1920×1080 the gap is 168.8px, so the overlay comes off the wall
  there. **The board is not refitted**: 1567×1004 with the rail and without it.
- **Below that, the overlay stands on the wall and the document says so**, with
  the number: about 36,500 board pixels at 1440×900 and 47,400 at 1280×800, or
  18,000 and 23,200 with the presets alone. No more claim about a margin.
- **And at those widths it gets out of the way**: two seconds without the
  pointer moving and it fades, back on the first movement. Never while a
  rectangle is selected or the panel is open, never on a phone, and never with
  focus inside it.

**Measured, before and after, by `scripts/board-share.mts` — exit 0 on every row
with the idle budget at 60:**

| Viewport | Layout | Board | Overlay covers |
|---|---|---|---|
| 1440×900 | overlay on the wall, resting | 1285×824 | ~36,500 px while awake, 0 at rest |
| 1920×1080 | **tools rail** | 1567×1004 | **0** |
| 2560×1440 | full rails | 2170×1390 | **0** |
| 1280×800 | overlay on the wall, resting | 1129×724 | ~47,400 px while awake, 0 at rest |
| 390×844 | overlay above a letterboxed board | 374×241 | **0** |

**The doors, each one number:**

- `TOOLS_RAIL_MIN` is 108. Lowering it reaches narrower windows and gives the
  controls less room; there is nothing under about 90 that the presets fit in.
- `TOOLS_RAIL_MAX` is 160, which is taste with a reason rather than a
  measurement. Raising it makes the column wider and the leftover wall smaller.
- `OVERLAY_REST_MS` is 2,000. It is the one number here nobody measured — it was
  chosen so that a reader who has stopped to look gets the wall uncovered almost
  at once without the overlay ever fading under a reaching hand.
- And the option not taken: **reserving the strip** in the board's own inset
  would make the margin real at every width, and would drop the wall's share
  from 81.7% to 66.4% at 1440. It stays written down here because it is the only
  answer that needs no mechanism at all.

---

## Settled: the chrome may stand in the letterbox, and never in the wall

**Status: settled 2026-09-01, by the owner, as an amendment to DESIGN.md's
layout norm. Reversible: the norm is what has to be edited first, and it says
so.**

The norm read "nothing new goes BESIDE the board". It now reads "nothing new
takes width FROM the wall", and above a measured threshold the chrome moves into
two side rails in the width a height-fitted board cannot reach. The full
argument, the arithmetic and the measured before-and-after are in DESIGN.md
under *No new column takes width from the wall*.

**What was checked before it was built, and what it changed.** The strongest
case against is that the amendment's two halves fight each other: the wall
gaining the height the bottom strip freed makes the wall WIDER — it is fitted by
height — which eats the gap the rail was to stand in. That is real, and it is
what fixes the threshold: at 1440×900 the gap is 49px and at 1920×1080 it is
148px, so neither gets rails at all. The owner's ~200px reference was close and
the measurement moved it to 180, which is what puts 2560×1440 inside the door by
7.2px rather than outside it by 13.

**Three doors, all left open:**

- **The ceiling.** A rail stops growing at 288px and the rest stays wall. On a
  32:9 monitor that is 900px of ground on each side. If the owner wants the rail
  to keep growing, `SIDE_RAIL_MAX` is the one number to change.
- **The floor.** 180px is what the current contents need with nothing
  overflowing. Content that needs more raises it, and raising it past 187 closes
  2560×1440 — the guard that would catch that is `board-share.mts`, which would
  simply report the rails as off there.
- **Direction D's measuring rails.** The width argument that deleted them no
  longer applies, and the redundancy argument does. DESIGN.md says which
  sentence they now stand deleted on, so bringing them back is a decision about
  redundancy rather than about pixels.

---

## Open: the money path is specified, not built

**Status: nothing built. This is the specification of what gets built.**

There is no `@solana/*` dependency, no `SOLANA_RPC_URL`, no `PAYMENT_WALLET`
and no cluster pin in this repository. The security audit of 2026-08-28 found no
findings in the money path for exactly that reason, which makes the owner's
eight questions the contract the payment batch must satisfy rather than a review
of something that exists:

1. A payment cannot be forged or replayed.
2. Amount, destination and network are bound together and every one of them is
   read FROM THE CHAIN, never from the request body.
3. The cluster is verified server-side; a devnet payment cannot settle a
   mainnet order.
4. Who may PRESENT a payment signature is separated from who CONTROLS the
   paying wallet — the pixelwar C-1 bug class. Presenting somebody else's
   transaction must not credit the presenter.
5. One on-chain transaction settles at most one order, enforced by a database
   constraint and not only by application code.
6. A payment landing after the reservation expired has a defined outcome.
7. The stub payment path cannot be reached in any deployed environment.
8. Every write route on the money path is rate limited.

**Until then:** `stubVerifyPayment` is the only payment code, guarded in
`src/instrumentation.ts`.

---

## Settled: the money total is printed on /stats and nowhere else

**Status: settled 2026-09-01, by the owner, in the traffic-stats batch.**

**What ships:** `/stats` prints four figures — people online now, distinct
visitors today, pixels sold against the million, and **what has been taken
against what the whole wall costs**. The board prints the first of those and
none of the rest.

**Why this needed a decision at all.** `DESIGN.md` says, and still says,
"Nothing on the page promises revenue. Not a million dollars raised, not a
total, not an implied one" — and the sentence after it is stricter than people
remember: "A total is not printed, implied, **or counted towards**." A figure
shown against a ceiling is counted towards. So this is not a gap in the rule; it
is an exception to it, taken deliberately, and it is recorded here rather than
quietly absorbed into the design document.

**The distinction the owner drew:** the bar sells, and a number beside an offer
is read as part of the offer. `/stats` is a page somebody opened to ask what has
happened, and money already paid is a fact about the past. The rule stands
everywhere it stood before; it now has one named exception with one named
reason.

**What holds it in place is a shape, not a habit.** `boardStats` is what
`/api/board` ships and what the bar renders from, and the total is not a field
in it. The board is never told the number, so no future component can print it
by accident. `soldValueBaseUnits` is a separate function with one caller, and
`stats.test.tsx` asserts the payload's absence rather than the markup's.

**The door, and what closes it:** if the total ever reads as a forecast rather
than as a receipt — the likeliest way being a launch where it is quoted back as
a target — the fix is to delete the fourth figure and change nothing else. That
is one component and one query, because the number never got anywhere near the
board.

---

## Settled: presence is counted, and there is nothing to identify

**Status: settled 2026-09-01.**

**What ships:** a heartbeat a minute from every open board, a live count in the
bar, and distinct-visitor history on `/stats`.

**What is stored, in full:** a salted sha256 of a normalised IP, and a minute.
That is the whole schema. No cookie, no session, no path, no referrer, no user
agent, no country. The hash is the same key the rate limiter already counts
against, which is the point — this adds no new way to recognise anybody, it
reuses the one that was already there and is already one-way. Rotating
`RATE_LIMIT_SALT` makes every row permanently unlinkable.

**The rate limit is the primary key.** `(caller_hash, minute)` means a second
heartbeat inside a minute inserts nothing, and the route reports that as a 429
with the top of the next minute in `Retry-After`. There is no counter to keep
and no ceiling to tune, and a caller cannot exceed sixty rows an hour however
hard they try — which is why there is no second limit beside it: it could never
fire.

**Roll-up, and the mistake it is written against.** Hour and day buckets are
each counted with `count(DISTINCT caller_hash)` **from the raw minute rows**,
never by adding smaller buckets. A visitor present in three hours of a day is
one visitor and three hour-buckets; summing reports three, and reports it
silently. That is why raw rows are kept for 25 hours — a day bucket needs the
whole day still present when it closes.

**The door:** there is no scheduler in this project, so the roll-up rides on a
fraction of heartbeats. If presence ever outgrows that, the upgrade is a cron
calling the same idempotent function, and nothing else changes.

---

## Settled: mobile wallets are reached through Wallet Standard, not deep links

**Status: settled 2026-08-31. Reversible on a named trigger.**

The supported path on a phone is a wallet's own in-app browser, where the
Wallet Standard registry works exactly as it does on a desktop. A wallet
reachable only by a deep link is not supported.

**Why:** deep linking is a second, different integration — its own redirect
handling, its own session resumption, its own failure modes — for a population
whose size is currently unknown.

**The door, and what opens it: REAL FRICTION FROM MOBILE BUYERS.** Not a guess
about how many people browse on a phone; evidence that mobile buyers are
arriving and failing to complete. When that shows up, deep linking becomes
worth its cost.

**Recorded so it is not rediscovered as a bug:** `src/lib/wallet/standard.ts`
states the limitation, and it is a product decision rather than an oversight.

---

## Settled: no `standard:events` subscription, but the error names the account

**Status: settled 2026-08-31.**

The page does not subscribe to a wallet's account-change events. It keeps
showing the address it connected with, which is the address the hold belongs to
and the only one the server accepts.

**The one thing that was cheap and is now built:** a wallet that has moved to
another account throws exactly like a person pressing Cancel, and the two cannot
be told apart from the page. So the message no longer guesses. It names the
account and says to switch back to it, which is useful advice whichever of the
two actually happened. `refusedMessage` in `src/lib/board/purchase-client.ts`.

**The door:** if this ever needs to disconnect itself when the extension moves
on, subscribe to `change`. The upgrade path is named in `useWallet.ts`.

---

## Settled: the payment fraction travels only to a caller who earned it

**Status: settled 2026-08-31.**

`paymentBaseUnits` is the order total plus a unique fraction, and the fraction
is what lets an observer watching the treasury match an incoming transfer to a
specific order id. It reaches a caller in exactly two ways now:

- on a **freshly inserted** hold, because that caller created the row in that
  same request and there is nobody else to withhold it from;
- past a **signature**, on `/content` — which is also the screen that pays, so
  it arrives exactly when it is needed.

**What was closed:** resuming a hold. A resume is asked for with a wallet
address and a rectangle, both public by construction, so anyone who knew both
could ask for a stranger's fraction. That was the residue the 2026-08-28 audit
left open after the signed-writes batch.

**Why not a signature or a session secret on resume**, the two mechanisms
considered: a hold is the step before anybody has agreed to anything, and
requiring a wallet to ask for one would put a signature in front of the cheapest
action on the site. A session secret would be new state to mint, store and
expire for a single field. Withholding the field costs nothing and needs no
mechanism — the buyer who resumed still gets it at `/content`.

**The property that had to survive:** a resume must not mint a NEW fraction, or
a payment already in flight becomes unattributable. That is still tested, now
read off the database row instead of the response.
