# Reference reading: the original, and three Solana descendants

Read before designing the grid, the block selector, the checkout, and the
content rules. This file records what we learned from the 2005 original and from
three Solana imitators, so our own choices are made against something real
rather than against a memory of a famous webpage.

## What this file is, and is not

This is a record of **patterns and decisions**, written in our own words.

It deliberately contains no copy, no code, no markup, and no asset from any of
these sites. An earlier draft of this document quoted their interface copy
verbatim and described the internals of a live competitor's published
JavaScript bundle. Both were removed, and the history was rewritten so neither
was ever published. Two reasons, and the second matters more than the first:

1. One of these sites is not a loose inspiration but the **same product**,
   already live. Reproducing its copy — even inside a research note — is how
   borrowed phrasing ends up in a product by accident. It nearly did: a string
   in our own selector had to be rewritten during review because it echoed one
   of theirs.
2. A public repository is read by the people it describes. A teardown of a
   competitor's shipped code is legitimate research and an unnecessary thing to
   hand them.

What we take is knowledge: which interaction patterns work, which business
models we are declining, and why. Ideas are not the licensed thing.

## The original: milliondollarhomepage.com (2005)

Alex Tew sold 1,000,000 pixels at $1 each to avoid graduating with student debt.
It sold out in four months. Everything since is a restaging of it.

**The page is one image.** A single 1000×1000 image map, a plain-text counter in
the corner, no zoom, no pan, no interactivity beyond the links. The whole
product is one picture.

**Blocks were never chosen interactively.** You paid, then submitted an image
and a link, and the owner placed it by hand within a day or two. The buy page
was a wall of terms, not a selector.

**The 10×10 minimum has a stated reason**, and every descendant inherits the
rule without restating it: a single pixel cannot display anything meaningful or
be clicked, and a board of scattered single pixels looks like noise. We are the
descendant that does not inherit it. The reasoning is sound and it is about
what a single pixel can SHOW; it is not a reason to refuse to sell one, and a
buyer who wants a dollar's worth of a permanent record knows what a pixel
looks like.

**What was asked of a buyer:** an image at exactly the purchased dimensions,
GIF or JPEG, not animated, at a reasonable file size; a link to a real web page;
and an assertion that the buyer had the right to supply both.

**Permanence was a term with a date, not a vibe.** Five years guaranteed, with
the stated aim of forever, sold explicitly as the value: an internet time
capsule. Notably, the original's permanence had written exceptions — a dead
site or a legal problem could justify a change — where every clone since
presents permanence as absolute.

**The moderation shape is the part worth stealing.** Rejection *before*
publication was refunded; removal *after* publication was not. Obscene or
offensive material was refused at the owner's discretion, with a chance to
substitute something else before any money was returned. And if a buyer's linked
site later turned bad, the link came down with no refund for the downtime —
link rot was the buyer's problem, not the site's.

## 1millionpixels.xyz — the near-exact competitor

Same million pixels, same price, same currency, same chain, same three fields.
The canvas and the minimum are where we have since parted company: theirs is
1000×1000 sold in 10×10 blocks, ours is 1250×800 sold by the pixel. This is
our product, already live. At the time of writing it had sold roughly 300 of
its million pixels, so the board is effectively empty.

**Their selector offers two paths side by side:** a row of preset block sizes,
each priced inline, and freehand drag for anything else. The presets are the
detail worth taking — a buyer never has to do arithmetic to find out what a
50×50 costs. A running pixel-and-price total sits under the live selection.

**Their purchase form is three fields:** an image upload, a link, and a caption
whose label states that it appears on hover. That label doubles as the entire
specification for the hover behaviour, which is a neat trick.

**Their board state is a flat array**, one entry per cell — the same conclusion
we reached independently and the same one the sibling project `pixelwar` uses.

**They store images on Arweave**, via the same provider we are proposing, and
they enforce region availability in an on-chain program rather than only in a
database. That last point is the one material advantage they have over a
Next+Postgres design, and it is discussed under the risk note below.

**Their published rules commit them to blocks that are permanent and that
cannot be resold** — bought once, held forever by the wallet that bought them.
That is a factual statement about their product and it is recorded here as
one. What it is NOT is an argument about ours: see "On positioning" below,
where an earlier draft of this file treated their choice as settling a
question we have not actually answered.

**Their differentiator is narrative, not mechanics.** The site is built around a
first-person account of the founder's trading history and an endgame in which
the finished board is minted as a single artwork and auctioned for charity.

## thewallsolana.com — a different business model

The same 1,000,000-pixel canvas, but **nothing is sold**. Block size is a
function of how much of their token a wallet holds, across six tiers, and a
block stays live only while that balance is maintained. Included because its
interaction design and its moderation posture are both better than the
competitor's.

**There is no wallet connection at all.** A visitor pastes a public address and
the site reads its balance on chain. The address is treated as private data and
is never shown on the board.

**Position is chosen by dragging a fixed-size square, not by drawing one** —
because the size is already determined by the tier. Content is entered first and
position last, which inverts the usual order and works well.

**Every irreversible field carries its own warning, inline, directly under the
input** rather than collected into a terms section nobody reads. There is then a
separate final confirmation step that lists every locked value before
publishing. That screen is the single highest-value idea in any of these four
references.

**They solve the aspect-ratio problem with a fit control** — show the whole
image, or fill the block — instead of the original's demand for exact pixel
dimensions.

**Their rules are titled cards, each making one claim**, covering one block per
wallet, permanence of published content, protection of existing claims,
maintaining the required balance, what may not be published, and how reports
are handled. The banned categories are enumerated concretely rather than left
to a vague appeal to decency: illegal material, scams, phishing, malware,
impersonation, threats, and exploitation.

**Reporting is a mode of the canvas, not a form.** A visitor enters report mode
and clicks the offending block, and the report opens with that block already
identified. Reports are private, and the rules state up front that a report does
not automatically remove anything.

## milliondollarsolanapage.com — dead, but its selector was worth reading

The domain no longer resolves to a running deployment; what we read was an
archived snapshot of a pre-launch build, with nothing sold.

Its selector was the most explicit of the four. It showed **three counters** —
absolute, percentage to four decimal places, and a block count — rather than
one. It carried a **persistent legend of the available interactions**, with a
separate variant for touch. Selection snapped to its grid, and — the best idea —
**a red overlay marked any collision with already-sold pixels**, so "why can't I
select here?" was answered by the drawing rather than by an error message.

It also chose a 5×5 minimum at a fifth of the entry price, which buys a lower
barrier at the cost of a visibly noisier board.

## The competitive situation

1millionpixels.xyz is the same product, live, with the same per-pixel price,
the same million pixels, the same currency, chain, storage provider and form
fields. It is no longer the same canvas or the same unit: they sell 10×10
blocks on a 1000×1000 square, we sell single pixels on a 1250×800 wall.

**On conduct.** We take no code, no copy, no assets, and no CSS from it. Every
string in our product is written fresh. This matters more than usual precisely
because the resemblance is already so close that borrowed phrasing would be
conspicuous — and, as noted above, one such string did reach our code before
review caught it.

**On positioning.** They have first-mover status and a nearly empty board, so
the "good spots go to whoever shows up" argument has not yet paid off for them.

This paragraph used to say that their rule against resale handed us our
positioning, and that was wrong twice over. What is true:

- **Permanence is ours, and it is ours on its own terms.** A sold pixel does
  not change owner or content without its owner's signature, and it never
  expires. Each clause of that has a named mechanism behind it, written down in
  `SECURITY.md` — a database trigger for ownership, a CHECK for expiry — rather
  than a sentence in a terms page. That is a divergence from every reference
  here, including the one that lets a block lapse when a token balance drops.
- **Whether a block can change hands is an OPEN DECISION.** We considered it,
  we have not decided it, and nothing is built either way. Recorded as an open
  decision in `SECURITY.md`, with both outcomes and their consequences written
  out.
- **We do not claim the opposite of their rule, and we do not claim theirs.**
  No page, no FAQ and no rules card says a block can be resold, and none says
  it cannot. A competitor committing to an answer is not the same as us having
  one, and copy that borrowed the shape of their claim would be promising
  something nobody here has agreed to.
- **What we can say today** is the part that is built: a live board with
  moderation, where theirs is a fill-once artifact headed for a single auction.

We should not try to out-narrate them. We should out-build them.

## What we adopt, and what we don't

### Adopt

| From | What | Why |
| --- | --- | --- |
| original | ~~10×10 minimum~~ — **no longer adopted** | Taken at first, and dropped when the model changed: the wall is 1250×800 and every pixel is buyable at $1, with no grid and no minimum. The original's reasoning was about *legibility* — one pixel cannot display or be clicked — and that argument survives as a fact about what a buyer gets, not as a rule about what they may buy |
| original | Refund before publication, no refund after | Exactly the moderation posture we want, settled in 2005 |
| original | Link rot is the buyer's problem | Otherwise we own an unbounded maintenance obligation on a permanent board |
| original | Permanence as a written term, not a vibe | "Forever" is a promise; a stated commitment is a product |
| 1mp | Preset sizes priced inline, beside freehand drag | Removes arithmetic from the decision and teaches the pricing model at a glance |
| 1mp | The caption's label states that it shows on hover | The label is the specification |
| 1mp | A running pixel-and-price total under the live selection | The price moves as the rectangle moves; that feedback *is* the selector |
| 1mp | Flat array for board occupancy | Independently the same conclusion as `pixelwar`; it is what collision-checking wants |
| wall | Inline permanence warnings under each field | A warning at the point of the irreversible decision beats a terms section |
| wall | A dedicated final confirmation listing every locked value | The best single screen in any of these references |
| wall | An image-fit control | Solves aspect ratio without demanding exact dimensions |
| wall | A short cap on the display caption | A hover label is not a paragraph |
| wall | Report-as-canvas-mode: click the offending block | The block *is* the identifier; a form asking for coordinates is worse |
| wall | Stating that a report does not automatically remove anything | Sets expectations and defuses report-brigading in one sentence |
| wall | Rules as titled cards, one claim each | Same conclusion `pixelwar` reached from its own references |
| mdsp | Red overlay marking collisions with sold pixels | Answers "why not here?" without an error message |
| mdsp | A persistent interaction legend, plus a touch variant | Cheap, and drag-to-size is not self-evident |
| mdsp | Three counters: absolute, percentage, blocks | Early on, a four-decimal percentage is more motivating than a raw count |

### Don't adopt

| From | What | Why not |
| --- | --- | --- |
| original | Manual placement with a multi-day turnaround | The buyer picks their own rectangle; that *is* the interaction |
| original | Exact-dimension image requirement | We scale and fit server-side; demanding exact pixel dimensions in 2026 is hostile |
| original | Banning animation outright | We sell animated GIF as a paid upgrade; the original's objection was aesthetic, and a per-block opt-in bounded by size, dimension and duration limits is a different thing |
| 1mp | Committing in writing to whether a block can ever be resold | Not because we take the other side — we have not decided, and it is recorded as an open decision in `SECURITY.md`. What we decline is publishing an answer we do not have |
| 1mp | Fill once, lock, auction the board as a single artwork | A fine story, but it makes the product an event with an end date. We are building a live board with a secondary market |
| 1mp | A first-person confessional as the pitch | Not our voice, and imitating it would be transparent |
| 1mp | A very large upload cap | Too generous for a block that renders at most 1000×1000. Ours is stricter and enforced by dimensions as well as bytes |
| wall | Token-gated, hold-to-keep-it-live blocks | We have no token. Ours is bought outright and stays bought |
| wall | Pasting an address instead of connecting a wallet | We need a real signature: the buyer signs the payment and the mint |
| wall | One block per wallet | An arbitrary cap on revenue for a board this size |
| wall | Blocks that expire when a balance drops | Directly contradicts permanence |
| wall | Upgrades and disputes by private review over chat | A manual process masquerading as a feature |
| wall | A chatbot mascot | An FAQ that answers questions is an FAQ |
| mdsp | 5×5 minimum | Moot: we have no minimum at all. Kept in this table because their reason for choosing 5 over 10 — a lower barrier at the cost of a noisier board — is the trade we made in full, and somebody will ask whether it was made knowingly. It was |
| 1mp/mdsp | A custom on-chain program as the source of truth | See the risk note — this is the one we decline with our eyes open |

### The risk note we are choosing to accept

The competitor enforces region availability **in an on-chain program**, so a
double-sell is refused by the chain itself rather than by a web server. Ours is a Postgres exclusion constraint, with the mint following the
payment. That is a weaker integrity story in exactly one scenario: if our
database is wrong or compromised, two people can hold NFTs claiming the same
rectangle, and nothing on chain contradicts them.

We accept it because a custom Solana program means Rust, an audit, and an
upgrade-authority question that partly re-opens the key-custody problem the
spec spends a section constraining. The mitigations are real: the rectangle is
written into the asset's immutable attributes, so a duplicate is publicly
detectable and provably second by mint order; the constraint makes a double-sell
impossible short of a database compromise; and reservations are bound to a
pubkey. Recorded as the first thing to reach for if the board ever gets big
enough to be worth attacking.

## Changes this research makes to the spec

1. **The selector gets preset sizes alongside freehand drag**, each showing its
   pixel count and price. Freehand alone is a worse first experience.
2. **A collision overlay replaces collision error messages.** Sold blocks and
   live reservations render red under the dragging rectangle, and the buy action
   is simply unavailable while the selection intersects one.
3. **A persistent interaction legend ships with the board**, in pointer and
   touch variants. Not polish; drag-to-size is not discoverable.
4. **The counter becomes three numbers, not one**: pixels sold, percentage to
   four decimals, and block count.
5. **Per-field permanence warnings are required copy**, rendered under each
   input rather than collected in a terms section.
6. **A final confirmation step is added to checkout**, listing image, link,
   caption, rectangle and price with an explicit statement that none of it can
   be changed. It lands before the payment, not between payment and mint.
7. **An image-fit choice is part of the purchase**, and is therefore part of the
   permanent record — captured in the block row and in the NFT metadata like
   everything else.
8. **The caption is capped and labelled "shown on hover"** at the point of entry.
9. **Reporting is a canvas mode**: a report button puts the board in
   select-a-block state and opens the form with that block identified. Reasons
   are a fixed list plus free text, and the UI states that a report does not
   automatically remove anything.
10. **The refund rule is published**: rejected before publication is refunded;
    removed after publication is not. This gives the admin deletion path a
    published basis rather than an internal policy.
11. **Link rot is explicitly the buyer's problem**, stated in the rules.
12. **The upload cap is set by dimensions and bytes, not bytes alone**, and the
    animated upgrade carries its own ceilings for size, dimensions and duration.
13. **Permanence becomes headline copy; resale becomes no copy at all.** What
    the home page can say is the sentence with mechanisms under it: a sold
    pixel does not change owner or content without its owner's signature, and
    it never expires. Whether a block can ever change hands is an open
    decision (`SECURITY.md`), so no page answers it — not affirmatively, and
    not by denial either. The nearest competitor publishes an answer; that
    tells us what they have committed to and nothing about what we have.
