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

---

## Settled: the preview IS the upload, and a sold rectangle is not editable

**Status: settled and built 2026-09-04.** Scoped by the adversarial round the
same day, which recommended against half of what was asked for.

**WHAT WAS ASKED FOR** was an exact preview *and* a claims workflow: a signed
"Request a change" on `/b/<id>`, a claims table, an admin queue, an audit log,
and copy reading *"changes only by claim"*.

**WHAT THE ROUND FOUND.** "Immutable after payment" was **already true**:
`attachContent` refuses anything but a `reserved` row, and migrations 005, 006
and 011 freeze the owner, the sale and the row against deletion. There is no
path from the site to a paid block's picture. So the claims workflow would have
built **the first mutation path that has ever existed here** and then guarded
it — the promise gets weaker while the copy gets stronger — for a claim nobody
has yet made. It also found no `audit_log` table to write to, and that
`takedown.hide/purge` already mutates published content post-payment, so claims
belong *inside* that surface rather than beside it.

**WHAT SHIPPED.** The preview, which is the thing that prevents most claims from
existing; `/faq` reading **"a sold rectangle is not editable from this site"**;
and an address. No table, no signature, no queue. `takedown.ts` carries a header
naming itself as where an applied change request would live if one ever
arrives — a fourth operator statement beside `hide`, `unhide` and `purge`.

**THE WORDING WAS CHANGED ON PURPOSE.** *"Changes only by claim"* promises a
process — that a claim exists, is read, and can be granted. This site has no
claims mechanism, so that sentence would have described one it does not have.
The shipped wording is true of the code as well as the copy, and
`contact.test.tsx` asserts the old phrasing is absent.

### Why the preview needed no new pipeline

`prepareImage` is browser code and the form already called it to produce the
bytes it uploads — but at SUBMIT, so the first sight of what a rectangle would
really carry was the confirmation screen, after the content was attached. What
the form showed until then was the buyer's own photograph at whatever size they
picked it.

It now prepares on every change of file or fit and **renders that Blob**. The
preview is not a rendering OF the upload, it IS the upload, so "what you see is
what you bought" is structural rather than two implementations agreeing to stay
in step. The end-to-end test hashes the bytes the preview drew and asserts they
equal the `image_sha256` the row ends up with — **a server that re-encoded
anything on the way in would break that and nothing else in the suite would
notice.**

**Four views, because they are four questions:** the wall at 1× with the real
neighbours (the only one that says where it is), 4× (the only way to see what a
six-pixel-wide picture is), and the register and card thumbnails (where most
people will actually see it).

**Every note under them is a measurement from `docs/imagenes.md`**, not a
judgement: below 200 picture pixels only a colour or a bold shape reads, below a
40-pixel short edge words do not survive, and a `contain` fit on a rectangle
more than 2:1 away from the picture's shape names the exact share being spent on
bars — 88% on a 31×169. **None of them refuses anything.** The buyer chose the
rectangle; these are offered before payment, and the re-upload loop is the
mechanism.

---

## Settled: an owner is a chain and an address, and neither half is ever assumed

**Status: settled 2026-09-04, by the owner, as the batch BEFORE the Robinhood
Chain payment rail.**

**What shipped.** `blocks.buyer_pubkey` is now `blocks.owner_address`, beside a
new `owner_chain` that backfilled to `'solana'` for every existing row and is
constrained by `CHECK (owner_chain IN ('solana','robinhood'))`. `owner.ts`
holds the type, the list, the labels and `sameOwner`; `evm.ts` holds
`personal_sign` verification by public-key recovery. The reservation route, the
three signed routes, the purchase dialog and the client all carry the pair.
Nothing about the money path moved: no rail is built yet, and this batch was
deliberately sequenced first.

**Why the pair rather than the address alone.** An address does not say which
cryptography proves it. Today the two alphabets happen not to overlap — twenty
bytes of hex is never thirty-two bytes of base58 — but that is an accident of
two encodings, not a rule anybody wrote, and building on it would mean the
first chain that shares an address format with another silently merges two
people's ownership. `sameOwner` compares both halves and folds case on the
address, because an EVM address is the same account checksummed or not, and a
wallet that hands back `0xAb…` must recognise the hold it created as `0xab…`.

**The chain is required and has no default, at every boundary.** `readProof`
refuses a proof that does not name one; `parseReserveBody` answers 400 rather
than assuming Solana. Defaulting would be the cheap move and the wrong one: the
row a reservation writes is the row a signature is later checked against, so a
hold that guessed would be a rectangle its own buyer could not prove they
owned, with nothing in the failure to say why. Pre-migration clients are broken
LOUDLY rather than served a guess.

**One verifier per chain, picked by what the proof says it is — never tried in
turn.** ed25519 and secp256k1 refuse each other's signatures outright, so
falling through from one to the other would not be leniency; it would let the
CLAIM decide which cryptography applies, and the chain field would be
decorative. `challenge.test.ts` presents a real Solana signature as a Robinhood
one and requires null.

**The trigger names the pair too.** Migration 011's `blocks_owner_is_final`
watched `owner_address` alone. Migration 016 rewrote its WHEN clause to fire on
either column, because an UPDATE that moved a sale from one chain to the other
would hand the row to whoever controls those same characters on the chain it
was moved to, without a single character of the address changing.
`permanence.test.ts` runs that statement and requires the database to refuse it.

### The migration is an ATOMIC RENAME, and expand/contract was refused on purpose

**Decided by the owner, 2026-09-04.** Migration 016 renames `buyer_pubkey` to
`owner_address` in one statement, which means the currently-deployed build —
which selects that column by its old name — is broken from the instant the
migration lands until the new build is serving. The migration and the deploy go
out **in one sequence**, and the window between them is the only outage this
change has.

**The alternative was expand/contract**, and it is the textbook answer: add
`owner_address` beside `buyer_pubkey`, teach the code to write both, deploy,
backfill, deploy again reading only the new one, then drop the old column in a
third migration. Three deploys and two weeks of a table with two columns meaning
one thing. It was refused for three reasons, in order of weight:

1. **The site is `noindex` and has no payment rail.** There is no buyer to
   inconvenience and no money in flight. The whole cost of the window is that a
   page might 500 for whoever happens to be looking, and the owner weighed that
   against the alternative and took it.
2. **A period where both columns exist is a period where they can disagree**,
   and the thing they hold is who owns a rectangle. `blocks_owner_is_final` can
   only guard the column it names; during the expand phase the trigger watches
   one of the two, and the other is writable. That is a worse hazard than a
   minute of 500s.
3. **A `contract` step is a migration somebody has to remember to run.** Two of
   the three deploys are the easy ones and the third is the one that gets
   forgotten, and a `buyer_pubkey` column left behind for a year is exactly the
   lie migration 016 exists to remove.

**What this does NOT license.** Once a rectangle has been sold for money, this
argument stops working — reason 1 is the load-bearing one and it expires on the
first real purchase. A rename after that is expand/contract or it does not
happen.

**What did not change.** `/buyers` still selects no owner column at all, and
`blocks.ts` still refuses to let one join the board payload — the chain is not
identifying, but the rule there is about the SELECT list and not about how
identifying each column happens to be. The takedown console never read the
owner and still does not.

### Open: ETH native as a later rail

A second rail on the same chain, paying in native ETH rather than a dollar
stablecoin, **requires an oracle, a staleness policy and a slippage policy
decided in writing** before any of it is built. The wall is priced in USDC base
units and there is no exchange rate anywhere in this repository; introducing one
is a product decision about who absorbs a move between quote and settlement, not
an implementation detail. Nothing here blocks it: the owner is already a pair,
and a rail is a way of paying, not a way of owning.

---

## Settled: the first payment rail is Robinhood Chain, and it is paid in USDG

**Status: settled 2026-09-04, by the owner, after an adversarial round. Built
against the eight-point contract above; not switched on — the treasury address
is the owner's to provide.**

**What ships.** `src/lib/payments/usdg.ts` (the token and the treasury),
`robinhood-rpc.ts` (the only place this repository speaks to an EVM node),
`robinhood.ts` (the verifier), a boot guard, `scripts/usdg-check.mts`, and the
confirm route choosing its verifier off the ORDER'S OWN CHAIN. `/faq` names both
ways to pay, `/how-to-buy` carries the Robinhood route as a second way in, and
`/b/<id>` prints which rail each sale was settled on.

**A dollar stablecoin, not native ETH — and this is the decision, not an
implementation detail.** The wall is priced in USDC base units and there is no
exchange rate anywhere in this repository. Paying in ETH would require one, and
an exchange rate is three product decisions in a trench coat: which oracle, how
stale is too stale, and who absorbs a move between the quote and the
settlement. USDG has six decimals, exactly as USDC does, so **the price quoted
and the integer the chain must show are the same number.** Nothing is converted,
so nothing can be converted wrongly.

**The token was verified three ways, on 2026-09-04**: Paxos — the issuer —
publishes `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` for "Robinhood Mainnet";
the Global Dollar Network states USDG is the first stablecoin natively issued on
that chain and Robinhood Wallet lists it among the assets it manages; and the
contract itself, called on chain id 4663, answers `symbol() = "USDG"`,
`name() = "Global Dollar"`, `decimals() = 6`, with a total supply of about 627
million. **It is an ERC-1967 proxy**, so `decimals` is a fact with a date on it
rather than a fact for ever — `scripts/usdg-check.mts` is what re-asks the
chain, and it passed against mainnet on the day this was written.

**No custom contract, deliberately.** A plain ERC-20 transfer to a treasury
address is the whole payment. A contract of ours would be a second thing to
audit, a second thing to upgrade, and a second thing a wallet has to be
persuaded is safe to sign — for a mechanism that adds nothing a `Transfer` log
does not already carry.

**The transfer is matched on the conjunction of four facts**, never one at a
time: emitted BY the USDG contract, TO the treasury, FROM the order's own owner,
for EXACTLY the amount that order was quoted — the unique fraction included. The
`from` check is what closes the pixelwar C-1 class outright: a stranger who
copies a hash out of an explorer credits nothing, because they are not the
address that sent it.

**The chain is checked first and from our own node.** `eth_chainId` must answer
4663 before a single log is read. A testnet payment costs nothing to make and
looks identical in every other respect, and that is precisely how a wall becomes
free.

### The rail ships OFF, and `/api/status` is how anybody can tell

**Decided by the owner, 2026-09-04.** `ROBINHOOD_TREASURY_ADDRESS` stays empty
and `ROBINHOOD_PAYMENTS` stays unset until the owner hands over the mainnet
address. Everything below is built and tested behind that flag.

`GET /api/status` answers the question that until now could only be answered by
reading Vercel's environment page — **"robinhood rail: off by flag, no
treasury"** — because a deploy that turned the rail on and a deploy that thought
it had are otherwise indistinguishable. It reports STATE and never VALUES:
whether a treasury is set, never which address; that the rail is off, never
which node it would have used. `status-api.test.ts` reads the whole body in
every configuration the route can be in and requires neither the address nor the
node URL to appear in any of them.

### The boot guard fires only when the rail is on — confirmed by the owner

Raised as a judgement call and settled the same day. The owner asked for the
treasury to be an empty variable "with a test that refuses to start without it";
a guard that fired on **every** deployed instance would take this site — which
has no payment rail at all today — down at the next deploy. So the guard is tied
to the rail being switched on: `ROBINHOOD_PAYMENTS=true` is the deliberate act,
and the moment it is taken, an empty or absent treasury refuses the boot. With
the rail off the instance starts normally and `/api/status` says why.

A treasury that is present but MALFORMED refuses the boot either way, rail on or
off, because a typo boots, takes money, and sends it where nobody holds a key.

### The eight points, each against the test that proves it

Written out because a contract nobody can point at a test for is a contract
nobody is keeping. Checking it line by line is what found point 8 unmet in
three routes.

| # | The point | What proves it |
|---|---|---|
| 1 | A payment cannot be forged or replayed | `robinhood-rail.test.ts` → "refuses to settle a second rectangle with the same transaction" (the UNIQUE constraint, not the code); `robinhood.test.ts` → "refuses an amount that is one base unit short, and one too many" |
| 2 | Amount, destination and network are read FROM THE CHAIN, never from the body | `robinhood-rail.test.ts` → "ignores an amount, a recipient and a chain id sent in the body" — a body carrying a forger's own numbers settles identically to one without them |
| 3 | The cluster is verified server-side; a devnet payment cannot settle a mainnet order | `robinhood.test.ts` → "refuses a payment read on the testnet, and reads nothing else" (one RPC call, then refusal); `robinhood-rail.test.ts` → "refuses a payment read on the testnet" |
| 4 | Presenting a payment is separated from controlling the paying wallet — the pixelwar C-1 class | `robinhood.test.ts` → "refuses a real payment presented by somebody who did not make it"; `robinhood-rail.test.ts` → "refuses a transfer somebody else made, and leaves the hold standing" and "refuses a proof from a different wallet even with the payment on the chain" |
| 5 | One on-chain transaction settles at most one order, by database constraint | `robinhood-rail.test.ts` → "refuses to settle a second rectangle with the same transaction", which asserts the SECOND rectangle is still `reserved` |
| 6 | A payment landing after the reservation expired has a defined outcome | `orders-api.test.ts` → "answers 410 for an expired hold, to the wallet that can prove it holds it". A late payment is a refund conversation, not a rectangle, and `markPaid` refuses rather than papering over it |
| 7 | The stub payment path cannot be reached in any deployed environment | `config.test.ts` → "refuses to start in production with stub payments enabled", including "refuses whatever the flag says, not only the word true" |
| 8 | Every write route on the money path is rate limited | `limits.test.ts` → "allows a purchase's worth of writes and then refuses, naming when"; `reserve.test.ts` → "answers 429 with a retry-after once the caller's ceiling is reached" |

**Point 8 was NOT met, and this table is how that was found.** `/reserve` and
`/content` had ceilings; `/confirm`, `/challenge` and the release `DELETE` had
none — and `/challenge` inserts a row for anybody who asks, which is an
unbounded insert and a way to spend a database. All three now share one budget,
`SIGNED_WRITE_LIMITS`, thirty in ten minutes per caller, because they are steps
of one act: a purchase is a challenge and a confirm, a release is a challenge
and a DELETE, and three separate budgets would be three times the ceiling for
the same abuse. A real purchase spends four or five.

The `DELETE` route's header comment used to say, correctly at the time, "there
is no `identify()` — no rate limit hangs off this". It says something else now,
and the reason is in it.

### The testnet rehearsal RAN, against real data and with no faucet

**2026-09-04, testnet 46630.** The first plan needed a funded account and a
stablecoin deployed there, and both were blocked: USDG's mainnet address has no
code on 46630 (checked), and the deployer key that put `keys` on that chain is
in no repository, correctly. Every faucet on that chain is behind a captcha.

**So the rehearsal reads a transfer that already exists** rather than making
one. `scripts/rail-rehearsal.mts` points the REAL verifier at a real ERC-20
transfer on 46630 — a receipt this repository did not write and could not have
tailored to itself — and then re-reads the same receipt four more times with one
fact moved each time:

```
  ok  the transfer as it really happened         settles  0x538391f5…7c83cb
  ok  one base unit more than was sent           refused
  ok  the same transfer, a different treasury    refused
  ok  presented by somebody who did not send it  refused
  ok  read as if this node were mainnet          refused  wrong_chain
```

**It found a bug on its first run**, which is the entire argument for rehearsing
against real data. The token it was pointed at has eighteen decimals, and the
transfer moved 2.98 × 10¹⁶ base units — past 2⁵³. `Order.paymentBaseUnits` is a
JavaScript number, so the amount rounded on the way into the comparison and a
transfer that really happened was **refused**. It cannot reach a real order here
(six decimals put the whole wall at 10¹²), but the verifier now refuses an
amount it cannot represent exactly instead of comparing a rounded one, and
`robinhood.test.ts` carries the case with the incident in its comment. No
fixture would have produced it.

**What the rehearsal does NOT cover**: the wallet. A person pressing a button in
Robinhood Wallet, and what that prompt says, is the other half — see
`docs/wallet-warnings.md` — and it needs a funded account somebody claims from a
faucet by hand.

**The testnet treasury is ours and receive-only.** `0x9f8666d8d7ba0c3ac5ef1b936483ea2a21f9c09d`,
generated for this, with its private key **discarded rather than stored** — which
is exactly the shape of the mainnet one: `SECURITY.md`'s rule is that this
repository holds no key that spends, and a testnet exception would be a habit
rather than a convenience.

### What is not built, and what it is waiting on
- **The treasury address itself**, which is the owner's to provide and is the
  reason the rail is off.
- **A Solana rail.** Still unbuilt. `stubVerifyPayment` remains the only path a
  Solana-owned order has, and it is refused on any deployed instance.

---

## Built: the review queue, the wall's encoding, and the default fit

**Status: built 2026-09-05, behind no flag. Three decisions that were already
settled and unbuilt, plus one that changed on contact with the code.**

### The review queue

Migrations 018 adds `approved_at` and `approval_note` and **backfills every
existing sale as approved, dated to its own settlement**. That backfill is a
decision, not a formality: leaving them NULL would have taken pictures off the
wall that have been on it since the day they were bought, which is a review
queue applied retroactively to purchases nobody agreed to review.

`approvedSql()` folds into `publishesTextSql`, exactly as the round predicted,
and eight readers got it in one edit — the composite, the words, the image, the
card, the badge, `/go`, `/buyers` and the board list.

**`/b/<id>` is the one reader that deliberately does NOT use that predicate.**
It asks the two older halves — a sale, not taken down — because a buyer who has
just paid needs a page to look at, and a 404 there is the site losing a purchase
in front of the person who made it. The page says **"This one is in review"**
and withholds the picture and the words, which are what the queue is about.

**There is no `reject`.** A refusal is a takedown, with its reason, through the
mechanism that already exists — a refused purchase and one taken down a week
later are the same thing to every reader: a sale that stands whose picture is
not on the wall. A third state would be a second way to say one fact.

**The copy went in before the wallet opens**, which the earlier round made the
condition of shipping at all: the confirmation step says it above the price, and
`/faq` answers "How soon does my picture appear?".

### WebP for the wall, and NOT the way `docs/imagenes.md` recommended

That file said WebP with a PNG fallback chosen by `Accept`. **The fallback was
refused.** The wall's version is a hash of its bytes, so content negotiation
would mean one URL with two bodies — a `Vary` header, a split in every shared
cache, and the end of the immutability the whole versioning scheme exists for.
The build encodes both and **keeps whichever is smaller**; migration 017 gives
the row a `mime` so the route serves what it stored instead of guessing.

**Lossless, which gives up most of the saving that section measured.** Lossy
WebP is smoothing, and `DESIGN.md` says a smoothed bitmap is no longer the
picture the buyer uploaded. A buyer of a 6×40 block paid for two hundred and
forty exact pixels. Flat art — which is most of this wall — still compresses
better than PNG losslessly, and where it does not, PNG is kept.

### `cover` by default past a 2× aspect gap

`defaultFit` in `image-fit.ts`, applied once per picture so it is a starting
point and not a rule the buyer has to fight. The threshold is the measurement:
twenty real flags, and the three awkward shapes spending 85–90% of a paid
rectangle on flat grey. **It flips just past two and not at it** — a square
picture in a 2:1 banner is the commonest deliberate shape there is.

### And the scaling table is in `DESIGN.md`

"The same purchase, on four surfaces, at four scales", so the next reader finds
`nearest` going up and `lanczos3` coming down as a rule rather than as a bug.

---

## Built: the backup, and the expunge script that had to come first

**Status: built 2026-09-05. The workflow is committed and its first scheduled
run is the night after it merges; no copy exists yet.**

**THE ORDER WAS THE DECISION.** The owner's rule was that the daily backup does
not start before the script that can expunge it exists, because a copy kept for
ninety days turns an irreversible deletion into a removal with three months of
copies behind it. So `scripts/backup-expunge.mts` and its test came first, and
`SECURITY.md` now says what a purge covers **in the present tense** rather than
promising something about a mechanism that did not exist.

**The expunge is tested against a real repository, not a mock.** Three commits
with the bytes in all three, the real script, and the requirement that no object
anywhere in the object database still contains them — `refs/original` deleted,
the reflog expired and `gc --prune=now` run, because a rewrite that leaves the
old history reachable is not an expunge. It also refuses to delete an image a
block that was NOT purged still points at, which is the one way
content-addressing could have destroyed the wrong picture.

**The role that reads cannot write.** `mdp_backup_reader`, `SELECT` and nothing
else — verified by attempting an `INSERT` against it and being refused, not by
reading a grant. A scheduled job holding the owner's credentials would be a
second key to the wall, running unattended, every night.

**The workflow names no host, no repository, no branch and no path**, because it
lives in a public repository. `BACKUP_REPO` and `BACKUP_TOKEN` are secrets, and
the clone URL is assembled inside the runner and never printed. Somebody reading
the workflow learns that a backup exists and nothing about where it is.

**Content-addressed images are what make a daily copy cheap**: an unchanged
picture is the same path with the same contents, so a day on which nothing was
bought is a commit that is never made. `manifest.json` carries a hash per row
and per image, which is also what the expunge reads to decide what may go.

### What is NOT done, and it is the part that matters

**No restore has ever been rehearsed**, because no copy exists yet.
`docs/backup.md` carries the procedure and an empty table at the bottom with the
words "Never run" in it. Until a line appears in that table, this is a backup by
construction and not by evidence — and `/faq` may not say the picture cannot rot
until it is.

**There is deliberately no restore script.** Writing one before a restore has
been done by hand would be writing it against a guess at what goes wrong. The
first rehearsal is what tells us; the script comes after, and its first test is
that transcript.
