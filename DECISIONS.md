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

## Settled: the moment this wall tells somebody about is the first 1,000 pixels

**Status: settled 2026-09-02 by the owner.** The number is chosen; nothing is
built and nothing is scheduled, because the deliverable of this decision is the
number rather than a job that runs.

`docs/marketing-fomo.md` went looking for the mechanic that sold the 2005
original and found that it was not a mechanic. Sales were flat for two weeks and
came from friends and family. At $1,000 taken, a press release — paid for out of
that first thousand — was picked up by the BBC, and the curve turns there and
never comes back down. Every on-page device the genre credits that page with was
already on it during the two flat weeks.

**The threshold is 1,000 pixels sold**, which is parity with the original: a
million pixels at a dollar, and a thousandth of the wall gone is exactly where
Tew was when he sent his. It is early enough to actually arrive, and it is a
real threshold rather than a flattering one.

**It is counted in PIXELS, not in dollars**, and that is not decoration.
DESIGN.md: "nothing on the board promises revenue. Not a million dollars raised,
not a total, not an implied one." A press release is not the board, but "we have
taken $1,000" is a sentence that ends up quoted beside the offer. "The first
thousand pixels are sold" is the same instant, said as a count.

**The two doors, kept open and written out**, because the number is the owner's
and may move:

- **A smaller number** — the first sale, the first hundred pixels — is the story
  told to an emptier room, and it spends the one moment a stranger writes about
  you on a figure they can dismiss. What it buys is days instead of weeks.
- **A larger number** — a tenth of the wall, half the wall — is a louder story
  and a longer wait, and it risks the case where the wall never gets there
  because nobody has heard of it. The original did not wait: it announced at a
  thousandth and let the coverage do the selling.

**What this changes in the code: nothing.** `/stats` already prints pixels sold
against the million. A threshold is a thing a person watches. If it should ever
notify rather than be noticed, the honest version is a line in the presence cron
that sends once — and sending mail from this project is a separate decision
nobody has taken.

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

---

## Reversed: resting on a rectangle shows a tooltip again

**Status: settled 2026-09-03, reversing 2026-09-02.**

On 2026-09-02 the owner ruled that **nothing** appears when the pointer passes
over a sold rectangle, and that the card opens on a CLICK. The reasoning was
sound and is worth keeping written down: a card that appears under a moving
pointer covers artwork somebody paid for, and it covers a different rectangle
every time the mouse moves.

On 2026-09-03 the owner reversed the first half and kept the second. Resting on
a rectangle shows **one small line** — the caption, or `W × H · $price` when
there is no caption, or "on hold" for a reservation. Clicking still opens the
full card.

**What changed the answer:** the original page does this, and it is the gesture
every visitor arrives already knowing. Showing nothing on hover makes a wall of
a million pixels feel inert — a reader sweeping across it learns nothing until
they commit to a click, and most of them will not.

**What survives from the decision it reverses**, and this is the part that made
the reversal cheap: the objection was about AREA, not about hover. So the
tooltip is one line, never wider than the card it replaced, carries no pointer
events, and appears with no delay. What may be covered is the tooltip's own
footprint and nothing beyond it.

**Where it lives:** `tooltipLine` in `src/components/BoardView.tsx` writes the
line; `onBlockOpen` in `src/components/BoardCanvas.tsx` is the click. A tap on a
touchscreen is a click, because a touchscreen has no hover at all.

---

## Reversed: `/buyers` exists, and it lists rectangles

**Status: settled 2026-09-03, reversing 2026-09-02.**

A public list of everything sold was refused on 2026-09-02, on the grounds that
a list of purchases is a list of buyers and this site names nobody. That
objection is correct about a list of BUYERS and it is the reason this page is
built the way it is.

On 2026-09-03 the owner reversed it. `/buyers` lists every paid rectangle in the
order it was bought: a small picture at the rectangle's real proportion, the
caption, the link through `/go/<id>`, the size, the date, and a link to its own
page. Fifty to a page.

**The subtraction is the whole design, and it is the same one `tape.ts` makes
for the register.** `buyer_pubkey`, `owner_wallet` and `payment_signature` are
not selected. `src/lib/board/buyers.ts` states that as the rule, and
`src/app/__tests__/buyers.test.tsx` renders the page over a row whose wallet is
a recognisable string, asserts the string is absent, and then asserts that
nothing SHAPED like a base58 address is present either — because the fixture's
own string is not what a column added next year would carry.

**Why it is worth having:** it is the only page on the site where a buyer's
rectangle is a row somebody can link to, and it is the answer to "is anybody
actually buying this" that a percentage cannot give.

**Ascending order, permanently.** Purchase #1 is the first pixel ever sold and
stays #1. Newest-first would renumber every row on every sale and make a link to
page 3 point somewhere different every day.

---

## Settled: the contact address is printed, and is not a link yet

**Status: settled 2026-09-03.**

`contact@milliondollarpage.fun` appears at the foot of every page that carries
prose, and in the FAQ's invitation to report a mismatch. It is rendered as
**text and not as a `mailto:` link**.

**Why:** the mailbox does not exist. The domain is at Namecheap and the owner
has decided to put Private Email on it at the end of the build rather than now.
A `mailto:` on an address that bounces spends somebody's message without ever
telling them it failed; text invites them to copy it, and a copied address that
bounces at least bounces where they can see it.

**The door, and it is one line:** when the mailbox is live, wrap the address in
an `<a>` in `src/components/SiteFooter.tsx` and in the FAQ answer, and delete the
`mailto:` assertion in `src/app/__tests__/contact.test.tsx`. Nothing else
changes. Forwarding at the registrar is the cheaper first step and reaches the
same address; Private Email is what is needed for a reply to come FROM it.

---

## Settled: the register's items are clipped to their own box

**Status: settled 2026-09-03, chosen from two versions side by side.**

Each item in the vertical register keeps `overflow: hidden` and `flex-shrink: 0`.

**What it fixes, measured rather than argued.** A bare item paints its size
across its own colour, and the label is centred in a box that can be narrower
than the label — a 6×28 purchase comes out 34px wide at the height cap. At
2495×1484 with the twenty-purchase fixture, **24 of 80 items had their label
outside their box**, by up to 29px, painting over the artwork of the item below.
The artwork overlay covers the box; it cannot cover what leaves the box.

**How it was decided.** Both versions ran on a local server behind `?ticker=v1`
and `?ticker=v2` so the owner could hold one against the other. v2 won. **The
switch is deleted**, along with the attribute that gated it — a switch left in
after a decision is a second layout nobody is testing.

**What was NOT a defect:** the left column already started flush with the frame
at y=34, on both sides, at every width. The gap at the top of it was Next's own
dev-mode badge sitting over the page.

---

## Settled: nothing is painted until a person has looked at it

**Status: settled 2026-09-04. Not built yet — the adversarial round below closed
first, and it changed the shape of the thing.**

Every paid purchase enters **pending review** and appears nowhere until the
owner approves it in `/admin`. Approve or reject with a reason; the takedown
that already exists keeps covering what has been published. The buyer sees *in
review* on `/b/<id>`.

**THE SALE IS NOT PENDING — THE PUBLICATION IS.** The money settles, the
rectangle is theirs, the exclusion constraint holds it, the register carries the
settlement and `/stats` counts the pixels. What waits is the artwork appearing.
That distinction is the whole design, and it is what keeps every permanence
trigger untouched.

**IT IS A COLUMN, NOT A STATUS**, and this is the decision the round produced.
The obvious move is a fourth `status`, and it collides with everything: the
overlap constraint's status list, `blocks_stay_sold`, `blocks_paid_at_matches_status`,
and the forty-two places that read `status IN ('paid','minted')`. Instead,
`approved_at timestamptz` and `approval_note text`, folded into
**`publishesTextSql`** — one predicate, already the single gate for the
composite, the block's words, its page, its image, its card, its badge, `/go`
and `/buyers`. Eight readers get it for free and no trigger is touched.

**THE COPY CHANGES BEFORE THE WALLET OPENS, NOT AFTER.** A buyer paying $10,800
and finding out afterwards that publication waits on somebody's attention is the
site taking money for something it did not say it was doing. The confirmation
step and `/faq` say it first, or this does not ship.

**SILENCE IS THE FAILURE MODE, so the queue is visible.** `/b/<id>` shows when
the purchase entered review, and `/admin` shows the oldest waiting first. A
review queue costs attention per sale where a takedown costs nothing until it is
used — that is the real price of this and it is worth paying only if the queue
is looked at.

**The door:** a perceptual hash is a LATER layer, not this one. It answers "is
this the same picture as one we already refused", which only matters once there
is a refusal history. Written down so the next batch does not invent it.

---

## Settled: the picture does not rot, and there is a mechanism rather than a claim

**Status: settled 2026-09-04. Not built yet.**

**Amended 2026-09-04, the same day: no card, so no R2.** The bucket became a
private GitHub repository, `CryptoSandler/backups`, written by a daily workflow
in this repository. **The property that mattered survives** — the source is Neon
and the copy is GitHub, which is still two providers, and that separation was
the whole reason a bucket was named in the first place. R2 stays written down as
the alternative the day there is a card.

`/faq` may not say a picture cannot rot until all of this is true:

1. **A daily dump** of `blocks` and every stored image, committed to
   `backups/milliondollarpage/<date>/` in a private repository this project
   controls, separate from Neon.
2. **A manifest of hashes** beside it, so a restore can be checked rather than
   hoped for. `image_sha256` already exists on every row and is the natural key.
3. **A restore rehearsed monthly and written down** — the date, the version
   restored, and what was checked. A backup nobody has restored is a belief.
4. **Neon's PITR on top**, which covers the database and not the bytes leaving
   the provider.

**WHY THE BUCKET IS THE POINT.** The pictures are already ours rather than
hotlinked — `bytea` in our own database, no URL in the render path — which is
what makes the original's link rot impossible here. What that does NOT survive
is one provider. Until there is a copy somewhere else, *the picture cannot rot*
is a claim about Neon's reliability wearing a promise's clothes.

5. **90 days of retention, squashed monthly** — which means the history is
   REWRITTEN, not merely added to. A squash on its own reclaims nothing: the old
   blobs stay reachable until the commits that name them are gone.

**AND THE ONE THING THAT HAS TO BE DECIDED BEFORE ANY OF IT IS WRITTEN: A PURGE
MUST REACH THE BACKUP.**

`takedown.purge()` is this project's irreversible removal — it nulls the bytes
and the words, and it exists for the case where an image must stop existing,
which is the case with a legal edge. A backup that commits every image daily and
keeps ninety days of history turns that into *"removed, except for the three
months of copies we kept"*. That is exactly backwards for the only situation
purge is for.

So the dump excludes purged rows — trivially, they have no bytes — and **a purge
runs a scripted expunge of the backup history**, force-pushed, in the same
close. Until that script exists, `purge` is weaker than SECURITY.md says it is,
and this backup must not ship without it. The monthly squash and the expunge are
the same mechanism, which is the one piece of luck here.

**THE WORKFLOW READS WITH A ROLE THAT CANNOT WRITE.** `mdp_backup_reader`, made
2026-09-04: `CONNECT`, `USAGE` on `public`, and `SELECT` on every table
including ones added later. Verified by trying, not by declaring — `insert`,
`update`, `delete`, `truncate` and `create table` are all refused, and
`pg_roles` reads back `super=false createdb=false createrole=false
bypassrls=false`. That is what lives in this repository's Actions secrets rather
than the app's own credential.

**Why it matters more here than usual:** `CryptoSandler/milliondollarpage.fun`
is a PUBLIC repository. Secrets stay masked, but a public repo's Actions logs are
public and anyone may propose a workflow — so the thing in there should be
incapable of damage rather than merely trusted not to do any. The dump also
inherits the connection-string rule from `~/.claude/GATES.md`: a parse failure
prints the `ep-*` host or `unparseable`, never the string.

**What is not code, and is not mine:** `CryptoSandler/backups` itself and its
PAT — the owner has assigned that to Cowork — and the Neon connection string as
a secret on this repository. The `gh` CLI on this machine is authenticated as
`Sandlerr1`, not CryptoSandler, so creating that repository from here would put
it under the wrong account.

**Sizing, measured rather than assumed:** an image is capped at 100 KiB
(`STORED_MAX_BYTES`), so no single file approaches GitHub's 100 MB limit. Git is
content-addressed, so a daily commit adds only what CHANGED — an unchanged image
is the same blob. A full wall at an average 50 KiB over tens of thousands of
purchases is a few hundred megabytes against GitHub's 1 GB soft limit, which is
the number to watch and the reason retention is bounded at all.

---

## Settled: the chrome stays as it is, and three whole alternatives were built to find that out

**Status: settled 2026-09-04.**

Three complete chromes were built behind `?chrome=1|2|3` — not mockups, the real
page with the real register and the real wall — measured with
`scripts/board-share.mts` and photographed at 2495, 1440 and 390. The owner chose
**the chrome already shipped**, and the other three are deleted along with the
parameter and every line that supported them.

**THE MEASUREMENT IS WHY THIS WAS WORTH DOING, AND IT IS THE SAME NUMBER FOUR
TIMES:**

| | 2495 | 1440 | 390 |
|---|---|---|---|
| shipped, mesa, vitrina, galería | **77.2%** | **71.1%** | **27.4%** |

Nothing stood on the wall in any of them, at any width, and no axis scrolled. So
none of the three was a trade against the artwork — they cost the same pixels
and differed only in what the page feels like. **That is what made it a taste
decision with nothing hidden in it**, and finding that out is the whole return on
building them.

**What each one was, and the one thing each cost that the wall number does not
show:**

- **mesa** — presets as a vertical dial at the foot of the left letterbox, zoom
  floating bottom-right, the strip holding only the panel. It costs **the
  register**: both letterboxes are full of the parade top to bottom, so each
  column gives up its bottom 200px, three or four rows. Two parts of the brief
  could not be built as written — a zoom *inside* the frame is a zoom on the
  wall, and a page footer "below the fold" needs a document that scrolls, which
  this one never does.
- **vitrina** — the header leaves the top of the window and sits on the strip,
  the two together a shelf, the wall's top edge at the top of the screen. It
  replaced the brief's "instrumento", which was the printed-button direction the
  owner had already turned down on 2026-09-03 wearing a different name.
- **galería** — the strip reserved but unpainted until the pointer comes down or
  a drag begins. Its risk is the one it cannot fix: the instruction line lives in
  that strip, so *drag to select* — the single thing this wall has to teach — is
  invisible until the reader has already moved towards the controls.

**Why the current one stayed.** It is the only one of the four that puts the
figure, the wallet and the way out where a reader looks first and still gives the
tools a home that does not cost the register anything. The three alternatives
each bought a quality — a canvas's calm, a gallery's hang, an absent interface —
by spending something the wall number does not price: rows of the parade,
familiarity of where a header is, or the discoverability of the only gesture that
matters.

**What was reverted, exactly.** `BoardView` briefly measured WHERE the header is
rather than assuming it is above, because vitrina needed it. It is back to the
assumption, and `git diff` reports the three touched files byte-identical to the
commit they came from — the revert is exact rather than approximate.

**The door:** the three are in the history of this repository if any of them is
ever wanted, and the arithmetic above is the reason none of them would be free
to re-adopt: each has a cost, and none of the costs is wall.

---

## Settled: a purged picture is refused for ever, by the hash of its exact bytes

**Status: settled and built 2026-09-04.**

`blocked_images` — a hash, a reason, a source (`purge` or `admin`) and a moment.
`purge` writes to it inside its own transaction, **before**
`block_purge_content` empties the row, because that function erases
`image_sha256` along with the bytes and after it there is nothing left to read.
The content route asks the list before it accepts an upload.

**WHAT WAS BROKEN, AND FOR HOW LONG.** `image_sha256` has been computed on every
upload since migration 001 and compared against **nothing** — it exists to
fingerprint the wall for cache invalidation. So a takedown was a single EVENT:
the identical file could be bought onto a different rectangle five minutes later
and nothing anywhere would notice. `docs/imagenes.md` measured the rest of the
moderation surface — format, weight, dimensions, takedown, all present — and
named this as the one thing missing that mattered.

**THE UPLOADER IS NOT TOLD WHY.** The reason on a row was written by a person
about somebody else's picture and may name a law, a complaint or a judgement.
Repeating it back would hand this uploader something that is not their business
AND tell anybody probing the list what is on it. They are told that this exact
file cannot be used and that a different one can, which is all they can act on.
The reason is read at `/admin`.

**A PERSON CAN WRITE TO IT, and that is not a nicety.** A list only `purge` can
add to is a consequence rather than a rule — it refuses a picture only after
somebody has bought a rectangle for it and a person has had to look at it.
`/api/admin/blocked` is where the same decision gets made once, in advance, and
where a hash added by mistake comes off again.

**WHAT IT DOES NOT CATCH, ON PURPOSE.** A one-pixel edit is a different SHA-256
and walks straight past. That is understood rather than overlooked: the exact
match costs one primary-key lookup and stops the case that actually happens —
the same file, again. **A perceptual hash stays the later layer**, and the
argument for not building it yet is that it answers "is this the same picture as
one we already refused", which only has meaning once there is a history of
refusals to compare against.

**The door:** if pHash is ever built, it goes beside this rather than instead of
it — an exact match is cheap, certain, and has no false positives, and those are
three things a perceptual match cannot offer.
