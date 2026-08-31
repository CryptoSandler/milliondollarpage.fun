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

## Settled: what the side rails show, and what lives only on /stats

**Status: settled 2026-08-28 — see the traffic-stats batch.**

Recorded when that batch lands.

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
