# The arrival round, part two: what starts this wall

**Date: 2026-09-01. One round, no code, closed before anything is built.**

Part one of this round chose a register and is recorded in
[`references.md`](references.md) ("Second reading: the degen register") and in
the three mockups under [`design/`](design/). This is part two, and it asks a
different question: not *what should the wall look like* but *how does a wall
with nothing on it get its first hundred purchases*.

It follows the process rule in `CLAUDE.md`: the strongest case AGAINST each
proposal; the collision with the real code — what survives, what gets thrown
away, and what this repository knows that the discussion does not; and an
honest recommendation, with standing permission to say the idea is wrong.

Two proposals were put. A third section is this round's own strongest
objection to both of them, which is the part the owner asked for by name.

Nothing here is a decision. Decisions live in `DECISIONS.md`, and none of these
has been taken.

---

## Proposal A — seed the wall with real purchases from the owner's own projects

**What it is.** Before launch, CryptoSandler buys rectangles at list price,
paying real USDC from a real wallet into the treasury, and puts the artwork of
projects they already run on them. Not fixtures, not admin inserts: purchases
that go through the same checkout everybody else uses.

### The strongest case against

**1. The register turns it into a wash trade that anybody can read.** This is
the objection that did not exist a week ago and exists now. The bottom rail
this batch ships prints, per settled purchase, the amount and a fragment of the
signature that settled it, ordered by `paid_at`. The treasury address is public
by construction. So the round trip — owner's wallet funds treasury, owner's
wallet buys from treasury — is one query on any explorer, and the register is
the thing that tells you where to look. The tape's entire claim, in the words of
the mockup it comes from, is that "the fast-moving object IS the evidence".
Seeding it silently makes the evidence evidence of self-dealing.

**2. There is no budget at which it works.** The arithmetic is the argument. To
move the board's own counter by a visible amount — say 5% — costs $50,000,
which is not a marketing budget, it is the product. To spend a plausible
launch budget — say $500 — buys 500 pixels, which is 0.05% of the wall and
reads on screen as `<0.01%` rounded up. It is either unaffordable or
imperceptible, and nothing in between is available, because the price is fixed
at a dollar a pixel and the settled decision is that it stays fixed all the way
down.

**3. It contradicts a standard this project has already met once.**
`formatPercentSold` deliberately prints `<0.01%` rather than `0%` for a board
that has sold a handful of pixels, and the reason written beside it is that
`0%` "would be a lie in the other direction: it would claim the board is
untouched when it is not". A project that reasoned that carefully about a
rounding decision does not get to seed its own counter without saying so.

### The collision with the real code

**What survives:** all of it. `markPaid` does not care whose wallet pays.
`blocks_payment_signature_unique`, `blocks_owner_is_final`, `blocks_stay_sold`
and `blocks_sale_is_not_deletable` all hold exactly as they do for a stranger.
A seeded purchase is not a special code path and needs none — which also means
it cannot be un-seeded later, because the permanence triggers refuse to delete
a sale. **Whatever goes on the wall on day one is on the wall forever**, and
that is a database guarantee, not an intention.

**What gets thrown away:** nothing. This proposal needs no code.

**What the repository knows that the discussion does not:** `paid_at`, added in
this batch, dates every settlement to the second, and `blocks_settled_recently`
indexes it. Forty purchases inside ninety seconds on day zero followed by
silence is a shape, it is permanent, it is queryable by anyone with the
`/stats` page open, and no copy explains it away afterwards. The seeding is not
merely discoverable in principle — this batch built the index that makes
finding it fast.

### Recommendation

**Proceed, and stop calling it a cold start.** Call it a launch cohort and say
so on the page. The owner's projects go on the wall, at the same dollar a pixel
as everybody else, paid for real — and `/faq` gains one question:

> **Did the owner buy pixels?** Yes. N rectangles on the first day, at a dollar
> a pixel, for projects the owner runs. They are not marked on the board,
> because a sold rectangle is a sold rectangle.

The disclosure costs one FAQ entry. Being found out without it costs the whole
trust position the register was built to establish. And keep the spend small on
purpose: the sentence does the work, not the pixel count.

**Verdict A: PROCEED WITH DISCLOSURE. Do not proceed silently — silence is the
only version of this that can fail badly.**

---

## Proposal B — sell to memecoin communities

**What it is.** Approach Solana memecoin communities and sell them rectangles,
as a community rather than one buyer at a time.

### The strongest case against

**1. The promise and the audience's horizon are opposites, structurally.**
"Yours forever, and it never expires" is a decade-long claim. The audience it
would be sold to holds positions for hours. Worse, the property that makes this
product defensible — permanence — is, to that buyer, precisely what makes it
illiquid: there is no transfer, no floor, no secondary market, and
`DECISIONS.md` records transfer as *undecided and not to be answered by
anything shipped*. So the first question a memecoin buyer asks is "can I sell
it", and the only honest answer is "we have not decided", which is the worst
possible answer to give someone whose entire model is exit.

**2. It imports the moderation load this project is least equipped for.** A
takedown here is a flag and a content purge on a row that stays sold. The
rectangle does not come back. A wall of tickers therefore becomes a permanent
public record of dead coins whose rectangles the owner cannot reclaim and whose
artwork they can only blank. The moderation plan exists; what it cannot do is
un-sell.

**3. And one apparent objection that cuts the other way, recorded because it
would otherwise be raised as a fourth.** `DECISIONS.md` records that Argentina
and Chile have no local-currency rail at Ramp or Transak, which makes the
on-ramp weakest for exactly the Spanish-speaking Solana audience this proposal
targets. That is an argument *for* it, not against: this audience already holds
SOL. They are the one population for whom the unsolved on-ramp does not matter.

### The collision with the real code

**What survives:** the rate limits, and they are the reason this is survivable
at all. `RESERVATION_LIMITS` caps held pixels per caller and `hold_meter`
charges pixel-minutes over a rolling window, so a coordinated group cannot park
the wall for free while it decides. That was built against griefing and it is
what makes a community launch safe to attempt.

**What gets thrown away:** nothing in code. What would have to be thrown away is
a sales script, if one is written that implies resale.

**What the repository knows that the discussion does not:** `references.md`'s
second reading already established that this audience reads a dense tabular
surface as "plugged into something" and reads quiet as "nothing is happening
here", and that a truncated signature is the trust unit they already recognise.
The product is closer to this audience than the current warm-cream register
admits — which is the whole reason the register is being changed. It also
records that one competitor is not a loose inspiration but *the same product,
already live*: competing for this audience is competing on distribution against
somebody who already has it.

### Recommendation

**Proceed narrowly: sell sponsorship, refuse investment.** The pitch that
survives every objection above is the 2005 pitch — *your mark on a wall that
nobody, including us, can take down, for a dollar a pixel*. The pitch that does
not survive is any sentence implying the rectangle can be resold, because the
transfer door is open in both directions and a sales conversation is exactly
where it would get closed by accident.

Two words are forbidden in this material for the same reason, and the second is
the one people forget: never promise transfer, and never say
**"non-transferable"** either. `DECISIONS.md` forbids that phrase in copy, FAQ,
docs and `SECURITY.md`, because it answers a question the owner has not
answered.

**Verdict B: PROCEED AS SPONSORSHIP. REFUSE AS INVESTMENT. Neither door on
transfer gets closed by a sales conversation.**

---

## The strongest case against both, which is this round's own finding

**This project is solving a supply problem and it has a demand problem, and
every mechanism built so far has made supply better.**

The board, the pixel-exact selector, the exclusion constraint, the permanence
triggers, the single-bitmap wall, the settled register, the stats page: all of
it makes the *inventory* excellent. Not one of it makes a person want a pixel.
Both proposals in this round are ways of making the wall *look* started — one
by buying its own product, one by finding a crowd — and neither answers the
question underneath, which is what brings the thousandth buyer.

The evidence in this repository is not encouraging on that point. The 2005
original worked once, as news, and the news is spent. Of the three Solana
descendants in `references.md`, one is dead, one is a different business, and
one is the same product already live.

**And there is one genuine demand argument here that nothing is currently
using.** A sold rectangle cannot be changed, moved, expired or deleted by
anyone, including the owner, and that is enforced by four database triggers
rather than by a promise; the wall is one bitmap whose URL is its own sha256.
No competitor in the reference file makes that claim, and it is the only
sentence on this page a buyer could not get somewhere else. If the arrival is
going to spend money, it should spend it making *that* legible — not on buying
its own pixels, and not on renting a crowd whose horizon is measured in hours.

**Verdict C: the strongest case against is unanswered by both proposals, and
that is the finding of this round. Neither proposal should be treated as an
arrival strategy. A is a disclosure decision; B is a sales-channel decision;
the arrival strategy has not been written yet.**
