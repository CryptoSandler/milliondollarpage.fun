# Phantom's warnings, what actually causes them, and what to do

A buyer who sees a red banner in their wallet does not buy. This file exists so
that when one appears, the first move is diagnosis rather than guessing — and so
that nobody "fixes" a simulation failure by asking Phantom to review a domain.

**Status of the money path:** not built. There is no `@solana/*` dependency, no
RPC client and no transaction construction in this repository yet, so nothing
here has been observed against this product. It is written before the payment
batch on purpose: these are the rules that batch has to satisfy, and finding
them out afterwards means finding them out from buyers.

**What was verified, and how.** The "could be malicious" warning and its cause
were confirmed against Phantom's own material
([developer docs](https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings),
[help centre](https://help.phantom.com/hc/en-us/articles/43483612411411-Why-am-I-seeing-This-dApp-could-be-malicious-when-interacting-with-an-app)),
including the `simulateTransaction` with `sigVerify: false` advice and the
existence of a domain review form. Testnet Mode and its banner are documented
([testnet mode](https://docs.phantom.com/developer-powertools/testnet-mode),
[help centre](https://help.phantom.com/hc/en-us/articles/5997313271699-Turn-on-devnet-or-testnet-mode-in-Phantom)).
The exact wording of each banner and the "about a week" figure for a new domain
come from the owner's own experience across projects and are **not** quoted from
Phantom — treat the wording as approximate and the week as a rule of thumb.

---

## The three warnings

### 1. A new domain

**What it looks like:** a warning that the site is new or unrecognised.

**What causes it:** the domain has no reputation yet. Nothing is wrong with the
code.

**What to do:** wait. Roughly a week of ordinary traffic is usually enough. If it
persists after that, submit the domain review form linked from
[Phantom's domain and transaction warnings page](https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings).

**What NOT to do:** rush the review form on day one. It is the slow path, and a
domain that would have settled by itself does not settle faster for being asked.

### 2. "This dApp could be malicious"

**What it looks like:** an explicit malicious-app warning, often on a domain that
has been up for a while.

**What causes it: A SIMULATION THAT FAILED.** Phantom simulates the transaction
before showing it. When it cannot simulate accurately — because the transaction
would fail on chain, or behaves in a way the simulator cannot follow — it cannot
offer its usual protection, and it warns instead.

**Diagnose the transaction before the domain.** This is the important line in
this file. The reflex is to assume reputation, ask for a review, and wait a week
while every buyer sees a red banner. The cause is almost always a transaction
that does not simulate: a stale blockhash, an insufficient balance, an account
that does not exist yet, an instruction ordering that fails.

**What to do:** run the server-side pre-flight below. If our own simulation
fails, Phantom's will too.

### 3. "Only valid on mainnet" — or a transaction the wallet will not send

**What it looks like:** the wallet says the transaction is for a different
network, or a testnet banner is showing.

**What causes it:** the person has Testnet Mode enabled in their wallet. This is
a setting on their side, not a bug on ours.

**What to do:** say so in one sentence and tell them where the setting is. Do not
change the chain we ask for to match their mode — see the single-signer rules
below; we ask for `solana:mainnet` explicitly, always.

---

## The rules for every transaction this product ever asks a wallet to sign

These are binding on the payment batch.

1. **One signer, and it is the buyer.** A transaction presented with more than
   one required signature is a transaction Phantom cannot fully account for, and
   it is also a transaction this project has no business building: the server
   holds no key that spends (see `SECURITY.md`).
2. **The chain is named, and it is `solana:mainnet`.** Explicit, never inferred
   from the wallet's current mode. A wallet in Testnet Mode must be told it is in
   Testnet Mode, not quietly served a testnet transaction.
3. **`signAndSendTransaction`**, so the wallet owns the send and its own retry
   behaviour, rather than the page holding a signed transaction it then has to
   broadcast itself.

## The server-side pre-flight, before the wallet ever opens

**Nothing opens Phantom until the server has checked that the transaction would
work.** A wallet prompt that ends in a red banner or a failed transaction costs
a buyer's trust; a sentence explaining what is missing costs nothing.

Two checks, both on our own RPC:

1. **The payer can afford it.** Balance ≥ amount + estimated fee.
2. **It simulates.** `simulateTransaction` with `sigVerify: false` — the
   signature does not exist yet, which is the whole point of doing this before
   the wallet is opened.

If either fails, the order does not open a wallet and the interface says why in
**one sentence**, naming the number where there is one: *"You need 0.0021 more
SOL for this."* Not a stack trace, not a generic failure, and not a retry button
that will fail the same way.

`src/lib/payments/preflight.ts` is that decision, with a test per branch.

---

## The rehearsal, before any change to the money path

Every change to how money moves gets rehearsed against a real wallet before it
reaches a buyer. Not a mock, and not a simulation — those are what the pre-flight
already does, and they are exactly the checks that pass while the wallet still
refuses.

1. On a preview deployment, with a real Phantom and a real funded wallet holding
   an amount close to the smallest real purchase.
2. Watch for a banner. A banner is a result, and it means stop and diagnose by
   the table above — starting with the transaction, not the domain.
3. Complete one purchase end to end and confirm on chain that the amount, the
   destination and the attribution fraction are what the order says.
4. Repeat with a wallet that has slightly too little to pay, and confirm the
   pre-flight refuses BEFORE the wallet opens, with the sentence naming the
   shortfall.

Step 4 is the one that gets skipped and is the one that matters: the happy path
is what everybody tests, and the near-miss is what buyers actually hit.
