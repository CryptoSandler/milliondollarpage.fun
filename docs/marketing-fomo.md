# How this genre sells, what the evidence actually says, and the five I would do

**Research only. Nothing here is built, and nothing here is a decision.** The
owner asked for the round before the batch, which is CLAUDE.md's rule for a
product decision of this size: *"Adversarial review before building any model
change or large product decision."* This document is that round for the
marketing surface, and it is written to be argued with rather than approved.

**Read 2026-09-02.** Every source below carries the URL and the date this
repository read it. Dates are when we read the page, not when it was written; a
figure quoted here may have been revised since.

**Every verdict below cites the written rule it rests on**, quoted from the
document it lives in, because a verdict that recites the rule from memory is a
verdict that will confidently enforce a rule that was edited last week.

---

## 1. What the original actually did

The genre's whole evidence base is one page that sold out, and it is worth
being precise about what happened on it, because most of what gets attributed
to it is not there.

| When | What | Source |
|---|---|---|
| 26 Aug 2005 | Launch. 1,000,000 pixels, sold in 10×10 blocks minimum, **$1 a pixel, flat**. Setup cost about €50. Dollars rather than pounds *deliberately*, so a pixel stayed cheap. | Wikipedia (read 2026-09-02) |
| ~29 Aug 2005 | First sale: 400 pixels, to a friend's music site. | Wikipedia |
| ~9 Sep 2005 | Friends and family had bought 4,700 pixels. | Wikipedia |
| At $1,000 taken | **A press release**, paid for out of that first $1,000, picked up by the BBC. This is the hinge of the entire story. | Wikipedia; The Hustle |
| Sep 2005 | The Register ran it twice; by end of September **$250,000** taken and **#3 on Alexa's "Movers and Shakers"**. | Wikipedia |
| 6 Oct 2005 | 65,000 unique visitors; 1,465 Diggs. | Wikipedia |
| 17 Oct 2005 | 100,000 unique visitors a day. | Wikipedia |
| 26 Oct 2005 | **500,900 pixels sold to 1,400 customers** — half the wall, and an average purchase of about 358 pixels. | Wikipedia |
| 31 Dec 2005 | 999,000 sold. 25,000 unique visitors an *hour*. Alexa rank 127. | Wikipedia |
| 1–11 Jan 2006 | **The last 1,000 pixels auctioned on eBay.** 99 legitimate bids; a $160,109.99 top bid retracted as a hoax; **won at $38,100**. Gross $1,037,100 in five months. | Wikipedia |
| 7 Jan 2006 | **DDoS and a $5,000 extortion demand**, later $50,000, from a group calling itself "The Dark Group". Site down about a week, three days before the auction closed. | Wikipedia |
| 2017 | Harvard study: of 2,816 links, **547 dead** (342,000 pixels, $342,000 paid) and **489 redirected elsewhere** (145,000 pixels). | Wikipedia |
| Apr 2019 | BBC: **~40% of the links rotted**, and the page still gets thousands of viewers a day. | Wikipedia |

**Three things follow from that table, and they are not the three the genre
repeats.**

**(a) The mechanic that sold the page was a press release, not a widget.** Sales
were flat for two weeks and came from friends. The curve turns at the BBC pickup
and never comes back down. Everything on the page — the counter, the grid, the
"own a piece of internet history" line — was the *thing the press wrote about*,
not the thing that converted. Any plan here that consists only of on-page
mechanics is a plan to reproduce the first two weeks.

**(b) Scarcity did the work of a price rise, and the price never rose.** Tew
charged $1 for the last pixel and $1 for the first. What changed over five
months was how much was left, and that was legible from the picture itself. The
one place he departed from it — the eBay auction of the tail — is also the one
place the story acquires a $160k hoax bid.

**(c) The failure mode of this genre is link rot, and it is 40%.** Somebody who
paid $342,000 in 2005 money now owns pixels pointing at nothing. That is the
single most useful fact in this document, and section 6 spends a recommendation
on it.

The page as it stands today shows no counter and no buyer list — it is sold out,
so there is nothing left to count. The counter is attested by the contemporary
write-ups rather than by the live page (Web Design Museum, read 2026-09-02).

## 2. What the successors did, and what happened to them

| Site | What it is | What happened |
|---|---|---|
| **Thousand Ether Homepage** | The same wall as an Ethereum contract, 1,000,000 pixels at 0.001 ETH. Contract deployed August 2017. | **About 79,400 pixels sold by October 2020** — under 8% of the wall, in three years. 1,621 ads total; 823 later wrapped as NFTs, 203 ETH of secondary trading. |
| **Million Ether Homepage** | Same idea, different contract, "own a piece of decentralised internet history". | Alive as documentation; no evidence of a sold wall. |
| **Million Dollar Token Page** | The wall reframed as NFT display space — you own the square and hang a collectible in it. | The reframing that got the most coverage, and it changes the product: the buyer is a collector, not an advertiser. |
| **One Million Checkboxes** (Jun 2024) | Not a wall for sale at all: a million checkboxes, shared state, everyone sees the same page change. | **~500,000 people, 650,000,000 checks in two weeks.** No money, no scarcity, no urgency mechanic — the entire draw was *watching a large shared surface change in real time*. |

**The lesson the clones teach is the one nobody wants.** Every crypto restaging
of this wall has the mechanics — scarcity, permanence, ownership, a public
grid — and none of them sold out. The one 2024 project that got half a million
people had no mechanics and no money. What they had that the clones did not was
a reason to look *now*: the surface moved while you watched it.

## 3. The walls this repository has already built, in its own words

Any mechanic below has to clear these. They are quoted, not remembered.

**Flat price, forever.** DESIGN.md, Settled decisions: *"The tail is a counter,
not an auction. […] what the wall shows is a plain count of the pixels
remaining, all the way down to zero, and the price stays a dollar a pixel for
the last one exactly as for the first. […] An auction would also be the first
thing on this page whose price is not knowable before you press Buy."*

**The board never promises revenue.** DESIGN.md: *"nothing on the board promises
revenue. Not a million dollars raised, not a total, not an implied one. […] the
board is never handed the number."* `/stats` is the single exception, taken by
the owner on 2026-09-01 and recorded in DECISIONS.md.

**Nobody is named, and nothing is ranked by what is happening.** DESIGN.md, on
the standings: *"No holder is named, on the ranking or anywhere else — the page
prints that sentence rather than leaving it to be noticed. […] Nothing is ranked
by activity, because nothing can happen to a rectangle after it is bought and a
'hot right now' sort would be the first dishonest thing here. […] no rank can be
taken by paying."*

**There is nowhere to put a visitor.** `migrations/014_visits_and_clicks.sql`:
*"an IP address, a cookie, a session id, a referrer, a user agent, a country, a
path, or any column that stands for one person across two visits […] There is
nowhere in either to put a visitor even by accident, which is the only kind of
guarantee worth writing down."* And DESIGN.md: *"there is no path, referrer,
session or cookie in the schema that could turn it back into somebody."*

**Counts must be true from one.** DESIGN.md, on presence: *"a number that
appears only when it is impressive is a claim rather than a count."*

**And the outside rule.** The FTC's 2024 review of 642 sites found ~76% using at
least one dark pattern, and names **fake urgency** and **fake social proof**
among the categories it enforces against under Section 5; the UK CMA took
binding undertakings from Booking.com, Expedia, Agoda, Hotels.com, ebookers and
trivago in February 2019 over *"making rooms seem more popular than they were in
reality"*. Read 2026-09-02. **Every mechanic in this document is therefore
allowed to be exciting and is not allowed to be false.** That is not a
compliance note bolted on the end; it is why half the table below is a no.

## 4. The table

Vote is one line. **Collision** names the written rule, where there is one.

| Mechanic | What it does | Evidence it worked | What it costs here | Collision | Vote |
|---|---|---|---|---|---|
| **Pixels remaining, on the wall** | The scarcity is the picture. | The original's only permanent on-page mechanic; the count is what the press wrote about. | **Zero — shipped.** `BoardCounters`. | None. It is the settled design. | Already ours. Leave it alone. |
| **Purchase register ("last sold X ago")** | Proof the wall is alive, with the age attached. | OMCB: a surface visibly changing was the entire product for 500k people. | **Near zero — shipped.** `PurchaseTape` already renders `12s ago` / `4h ago` and tickers in both orientations. | None. | Yes, and it is already there. Make sure it is *visible where the rails are off*. |
| **"N sold today"** | A count with a window, so a quiet wall reads as a moving one. | Weak-to-none directly; it is the standard commerce nudge. Honest version only. | One query over `blocks`. No new table. | Not the board's — a count is not revenue — but it is a **forecast-shaped** number, so `/stats`, per the board's contract. | Yes, on `/stats` only. |
| **Total views** | Says the wall has an audience before it has buyers. | The original published visitor numbers to the press, not on the page. | **Zero — shipped** in the traffic batch. | None; `visit_total` has two columns and neither is text. | Already ours. |
| **Clicks per rectangle** | Turns a buyer's rectangle into a measurable ad. | The direct answer to the link-rot critique: an owner can see it worked. | **Zero — shipped.** `/go/<id>` 302 plus `block_clicks`. | None. | Already ours. **Under-used** — see recommendation 1. |
| **Buyer list / featured buyers** | Social proof with faces on it. | The original had none. Modern "recent buyer" popups are the FTC's named *fake social proof* category when invented, and unremarkable when true. | Cheap to build, expensive to own: it needs an identity per purchase. | **Refused by a written rule:** *"No holder is named, on the ranking or anywhere else."* | No. Named because it was asked for; refused by a settled rule, not by taste. |
| **Rankings / leaderboard** | The genre's engine. | Universal in the genre. | **Zero — shipped**, and inverted: rectangles by pixels held, ties broken by who was there first. | Bound by *"no rank can be taken by paying"* and *"nothing is ranked by activity"*. | Already ours, in the only form this page allows. |
| **Hot zones / heat map of demand** | Shows where the wall is filling so a buyer hurries to a good spot. | None found. It is inference dressed as data. | A tile-density query, plus an overlay on the board. | **Collides:** *"Nothing is ranked by activity […] a 'hot right now' sort would be the first dishonest thing here."* A heat map is that sort, drawn. | No. |
| **Price rising by zone** | Prime real estate costs more. | The original refused it and sold out at flat $1. | Would rewrite checkout, the readout, the hover price and every price claim on the page. | **Refused, twice:** *"the price stays a dollar a pixel for the last one exactly as for the first"* and *"a price that is not knowable before you press Buy"*. | No. Dead on a settled decision. |
| **Price rising over time** | Early buyers rewarded, latecomers punished. | Kickstarter early-bird tiers work; the original did not use it and did not need it. | Same rewrite, plus a promise about future prices that cannot be taken back. | Same rule. Also **one-way**: CLAUDE.md, *"What is irreversible gets written once."* | No. |
| **Premium blocks** | A tier above the wall. | The original's only tier was the eBay tail, which drew a $160k hoax bid. | A second product with a second set of rules. | Same flat-price rule. | No. |
| **Auction of the last pixels** | The genre's famous finale: $38,100 for the last 1,000. | **It demonstrably worked** — the single highest-value sale in the story. | Bidding, escrow, a settlement path, and a price nobody can know before pressing Buy. | **Refused by name** in DESIGN.md's settled decisions. | No — and this is the one refusal that costs real money, so it is recorded as costing it. |
| **Referrals** | Dropbox: 100k → 4M users in 15 months (~3900%), ~35% of daily signups at peak. **Source quality is poor** — every retelling traces to one 2010 talk, and the primary is not online in a citable form. | Strong in SaaS, unevidenced here. | Attribution needs a code that survives from click to purchase: a param, a store, a per-purchase referrer column. | **Collides with the schema guarantee:** a referrer column is on migration 014's forbidden list. And there is no reward to give: the price is flat and there is no account to credit. | No, unless the owner reopens the flat price — which is settled. |
| **Per-rectangle share card** | Every buyer gets a page and an image to post; each post is a link back. | This is *how the original actually spread* — 1,400 customers with a reason to tell people, plus a press pickup. | A permalink route and an OG image. `ImageResponse` ships with Next 16 (`next/server`), so no dependency is added. | None. It names a rectangle, never a person. | **Yes. First.** |
| **Milestone moment, planned** | Half the wall, the last 100k, the first day — announced off-page, to press. | The strongest evidence in the whole document: the BBC pickup at $1,000. | Zero code. A number decided in advance and a paragraph written before it arrives. | None. Must be a real number: *"a number that appears only when it is impressive is a claim rather than a count."* | **Yes.** |
| **Permanence, argued against link rot** | The buyer's real fear is that this is a 2005 page with 40% dead links. | 547 dead links, 489 redirected, ~40% rot by 2019 — cited, not asserted. | Landing copy plus the citation. The mechanism is already built: the permanence trigger and our own serving of the artwork. | None. | **Yes.** |
| **Live arrival of new sales** | The wall changes while you are looking at it. | OMCB, 500k people, no other mechanic. | **Zero — shipped.** `BoardView` re-fetches `/api/board` every 30s and again on `visibilitychange`, the counter flashes for 900ms on a drop, and the newest sale is marked. | None. | Already ours. The only open question is whether 30s is the right resolution of "live", and tightening it is cost with no product. |
| **A badge on the buyer's own site** | A small snippet the buyer pastes where their artwork already lives: *this is on the wall*, linking back to their rectangle. | Indirect. It is the mechanism behind the 2005 spread — 1,400 customers who were advertisers and had somewhere to put a link — rather than a measured lift. | A snippet on the permalink from recommendation 1. No data, no endpoint, no script: an `<a>` and an image the wall already serves. | None. | **Yes**, after the permalink exists to point at. |
| **Sold-out theatre / countdown timers** | Manufactured deadline. | Works, and is the CMA's exact complaint. | Cheap. | **Falsity.** There is no deadline; inventing one is the FTC's *fake urgency*. | No, permanently. |

## 5. The case against each of the five, before the five

Each of these is the strongest argument I can make against my own
recommendation. **One survives intact. The other four are recommended with a
named weakness**, and one of them — the badge — cannot be measured at all under
this project's own privacy rules, which is written into the objection rather
than discovered next year.

**Against the share card.** It is a growth mechanic that only pays after the
three noindex locks come off — `robots.ts`, `metadata.robots`, and the
`X-Robots-Tag` in `next.config.ts` — because Twitterbot and friends honour
robots.txt, and a wall with no buyers has nobody to share anything. So it is a
build whose value is entirely in the future, on a page nobody can reach yet.
**It survives**: it is the only mechanic in the table that compounds per buyer,
and the alternative — building it in a hurry the week the wall is busy — is how
a share image ends up with somebody's uploaded artwork rendered wrong at 1200×630
in front of an audience.

**Against the milestone.** It is not code, so it will be postponed forever, and
"send a press release" is advice rather than work. **It survives, weakened**: the
concrete deliverable is not the release, it is *the number chosen in advance and
written into `DECISIONS.md`*, so the moment is recognised when it happens rather
than noticed a week later.

**Against the link-rot argument.** It advertises the genre's biggest failure on
our own landing page, in front of a buyer who had not thought of it. It also
invites the obvious question — what happens to these pixels if this site stops
paying its hosting bill? — which this project cannot answer with a guarantee.
**It survives, and the objection changes the copy**: the page states only the
permanence invariant in the words `DECISIONS.md` already uses — *"a sold pixel
does not change owner or content without its owner's signature, and it never
expires"* — plus the fact that the artwork is served from here and that a
takedown removes what is displayed and never who owns it. It promises no number
of years, and **it must not answer the transfer question in either direction**:
`DECISIONS.md` holds that open, and *"the words 'non-transferable' must not
appear in copy, FAQ, docs"*. That is CLAUDE.md's *decisions with a door*, and
this recommendation is the likeliest place in the whole document to walk through
one by accident.

**Against the badge.** Nobody uses these. A snippet nobody pastes is a file in
the repository and a line in a document, and the buyers most likely to paste it
are the ones whose sites already have traffic — which is to say the ones who
needed us least. **It survives, weakened, and only because it is nearly free**:
it is one `<a>` and one image on a page recommendation 1 is building anyway, and
its whole cost is the paragraph explaining it. If it turns out nobody uses it,
`block_clicks` and the permalink's own referrers will say so — except that we
deliberately store no referrer, so in fact **nothing will say so**, and that is
the honest weakness of this recommendation: it cannot be measured under this
project's own privacy rules.

**Against "N sold today" on `/stats`.** A count that reads `0 sold today` on
most days is a scoreboard for a quiet wall, and the honest version of a nudge
is often an anti-nudge. **This is the weakest of the five and it is recommended
last for that reason.** It survives only because the alternative — hiding it
until it flatters — is the exact thing DESIGN.md refuses.

## 6. The five, in order

### 1. A permalink and a share card for every rectangle — ready to start

**The gap.** A buyer owns a rectangle and has nothing to link to. There is
`/api/blocks/[id]` for machines, the hover card for somebody already on the
wall, and `/go/[id]` for the outbound click. There is no page whose subject is
one rectangle.

**What it is.** A route — `/b/[id]` — that shows one rectangle: its artwork at
its own scale, its coordinates and size, what it cost, when it was bought, how
many times its link has been followed (`clicksFor`, already built), and a way
back to that spot on the wall. Plus `generateMetadata` giving it an OG image
drawn by `ImageResponse` from `next/server`: the wall, dimmed, with this
rectangle lit and captioned. **No person is named on it** — it is a page about a
rectangle, which is the same line the standings already hold.

**Why it is first.** It is the only mechanic in the table that compounds: every
sale creates a new page and a new reason for one more person to post a link. It
is how the original spread before the press found it, and it collides with no
written rule.

**What it costs.** One route, one metadata function, one image route. No new
table, no new column, no dependency — `ImageResponse` is in the installed Next.
The lazier alternative, named per CLAUDE.md's posture: **skip the OG image
entirely** and ship the permalink with the site's existing card. That is one
file instead of three and gets most of the linking benefit; the image is what
makes the link look like something in a timeline.

**What it depends on.** The three noindex locks, which come off together or not
at all — `robots.ts` says so in as many words. Until then the page works and the
card is invisible to crawlers, which is the correct order: build it closed,
open it once.

**The guard it needs.** That the share card and the permalink name no buyer,
and that the OG route reads its subject from the block and never from a query
parameter — the same rule `/go/[id]` already carries.

### 2. The milestone, chosen before it arrives

Pick the number now — the first day, the first 100,000 pixels, half the wall —
write the paragraph now, and record it in `DECISIONS.md` with the door open on
which number it is. The original's entire curve turns on one press release sent
at $1,000. The deliverable is the decision, not the release.

### 3. Permanence, argued with the citation

On the landing, next to what the wall is: 40% of the 2005 page's links no longer
go anywhere, 547 of 2,816 dead outright, $342,000 of pixels pointing at nothing
(BBC 2019; Harvard 2017). Then the invariant, in the words `DECISIONS.md`
already uses and with no promise of years: *a sold pixel does not change owner
or content without its owner's signature, and it never expires* — plus the fact
that the artwork is served from here, and that a takedown removes what is
displayed and never who owns it.

**The copy may not say "non-transferable", or its opposite.** Whether a block
can ever change hands is open in `DECISIONS.md` and *"not to be answered by
anything shipped"*, and a landing paragraph about permanence is exactly the
sentence that answers it without meaning to.

The citation is the argument. We do not need to say we are better; we need to
say what rotted, and what the mechanism here is.

### 4. A badge the buyer can paste where their artwork already lives

One `<a>`, one image, and the copy-paste box that hands them both, on the
permalink from recommendation 1. It says the rectangle is on the wall and links
to it. This is the mechanism behind the original's spread — buyers who were
advertisers, with somewhere of their own to put a link — reduced to the smallest
thing that can carry it. It stores nothing, so we will never know whether it
worked; that is written into the objection above rather than discovered later.

### 5. "N sold today", on `/stats`

One query, on the page whose title is already "what the wall has done", never on
the board. Recommended last, and recommended with its own weakness written
above.

## 7. What is refused, so the next round does not spend its time here

Buyer lists and featured buyers (*"No holder is named […] anywhere else"*), hot
zones (*"nothing is ranked by activity"*), premium blocks, price rises by zone
or by time, an auction for the tail (all four: *"the price stays a dollar a
pixel for the last one exactly as for the first"*), referrals (no column to put
a referrer in, no reward to give), and any countdown or scarcity claim that is
not a true count.

**The auction is the expensive one.** $38,100 for 1,000 pixels is the highest
per-pixel number in this genre's history and the settled decision gives it up.
That is recorded here as a cost the owner has already accepted, not as an
oversight — and the door, if it is ever reopened, is DESIGN.md's own sentence
about a price that is not knowable before you press Buy.

---

## Sources

All read 2026-09-02.

- The Million Dollar Homepage — <https://en.wikipedia.org/wiki/The_Million_Dollar_Homepage> (timeline, prices, the eBay auction, the DDoS, the Harvard and BBC link-rot figures)
- Web Design Museum, Million Dollar Homepage (2005) — <https://www.webdesignmuseum.org/web-design-history/million-dollar-homepage-2005>
- The Hustle, on Alex Tew — <https://thehustle.co/how-the-million-dollar-homepage-kid-became-the-250m-app-man>
- milliondollarhomepage.com — <https://milliondollarhomepage.com/> (the page as it stands: sold out, no counter left to read)
- The Thousand Ether Homepage — <https://thousandetherhomepage.com/> and <https://dappradar.com/nft-collection/thousand-ether-homepage>
- Million Dollar Token Page — <https://dappradar.com/blog/million-dollar-token-page-homepage-of-the-metaverse>
- One Million Checkboxes — <https://en.wikipedia.org/wiki/One_Million_Checkboxes> and Nolen Royalty's own account, <https://eieio.games/blog/the-secret-inside-one-million-checkboxes/>
- FTC, dark patterns review of 642 sites (July 2024) — <https://www.ftc.gov/news-events/news/press-releases/2024/07/ftc-icpen-gpen-announce-results-review-use-dark-patterns-affecting-subscription-services-privacy>
- CMA, online hotel booking undertakings (February 2019) — <https://www.gov.uk/cma-cases/online-hotel-booking>
- Dropbox referral figures — <https://www.saasquatch.com/blog/dropbox-customer-referral-program-by-the-numbers/> **(secondary; every retelling traces to one 2010 talk and the primary is not citable. Treated as weak evidence above, and it changes no recommendation.)**

**No copy, markup, asset or code from any of these sites is reproduced here**,
which is the rule `docs/references.md` set for the first research round and
which applies to this one unchanged.
