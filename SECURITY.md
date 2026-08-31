# Security

This project holds one private key. That is a deliberate exception to how its
two ancestors were built, it was approved with conditions, and this document
exists so that nobody — including us, later — has to reconstruct the reasoning
from the code.

The first three sections are the promises the product makes to a buyer and the
mechanisms that hold them up. Everything after them is about the key.

## What a buyer is sold

One sentence, and it is the product:

> a sold pixel does not change owner or content without its owner's signature;
> it never expires

Each clause is held up by something, and this section says by what — including
where the answer is "nothing yet", because a promise with no mechanism under it
is the kind of thing this file exists to stop us believing.

**Does not change owner.** A Postgres trigger, `blocks_owner_is_final`, added
by `migrations/005_owner_is_final.sql`, re-stated by 006 when `removed` was
retired. It refuses any UPDATE that changes `buyer_pubkey` on a row that has
been paid for — `paid` or `minted`, which since 006 is every status a sold row
can hold, taken-down ones included.
This is the same family of control as 001's exclusion constraint and it is here
for the same reason: the database refuses the write, so no route, no script and
no console session can reassign a sold rectangle by forgetting a check.
`blocks_owner_is_final` is the answer to "what stops somebody taking my
pixels", and it is a mechanism rather than a policy.

It forbids an unauthorised mutation, not the concept of transfer. Whether a
block may change hands on a signature from its owner is an open decision — see
below — and the trigger is deliberately compatible with either answer.

**Does not change content — PARTLY BUILT, and this is the gap.** Today the
guard is in the application: `attachContent` refuses once an order is paid, so
the caption, the link, the image and the fit are writable up to the payment and
not after. There is no database constraint behind that, unlike ownership, so
the honest statement is that content immutability is currently a code path
somebody could remove. When minting lands, the on-chain half becomes the real
one: every asset carries `ImmutableMetadata`, which permanently locks its name
and URI, and the metadata JSON on Arweave is content-addressed. See "What the
key can and cannot do" below.

**Never expires.** `blocks_paid_never_expires`, from `migrations/002_orders.sql`:
a reserved row must carry an expiry and every other status must not have one. A
paid row therefore has `expires_at IS NULL`, which makes it invisible to the
sweep — and the sweep deletes reserved rows only. There is no rent, no renewal,
no balance to maintain and no code path that can expire a sale. This is a
deliberate divergence from one of the references, where a block stays live only
while a token balance is held.

## Takedown

Content can have to come down. Ownership does not come with it.

**Normal takedown is a visibility flag — BUILT, `migrations/006_takedown.sql`.**
`hidden_at` on a row that stays `paid` or `minted`. The block stops being
published: the composite wall is regenerated without it, the image route does
not serve it, the caption and link are not returned. Nothing is deleted. It is
one statement, and so is undoing it:

```sql
UPDATE blocks SET hidden_at = now(), takedown_reason = '...' WHERE id = '...';
UPDATE blocks SET hidden_at = NULL, takedown_reason = NULL WHERE id = '...';
```

Reversible matters because the common case is a report that turns out to be
wrong, and an irreversible answer to a reversible question is how a mistake
becomes permanent. The bytes are never touched, so what comes back is the same
picture byte for byte.

**Legal purge is a deletion of bytes — BUILT, same migration.**
`block_purge_content(id, reason)`. Where the law requires the material itself
to be destroyed rather than hidden, the image, its mime, its hash, the caption
and the link are actually erased, and `purged_at` records that they were. It is
not reversible and it is not meant to be. `blocks_purged_keeps_nothing` is the
CHECK that says what "erased" means, so a purge that missed a column is a
statement the database refuses rather than a residue nobody notices.

**Both levels are also operator statements run by hand, and that has not
changed.** The SQL above is the definition; everything else is a caller of it.
What did change is that the owner asked for a console, so there is now one: a
token-gated admin surface that performs exactly these two statements and lists
what is currently hidden. It adds no third level and no new semantics — a route
that could hide something this section does not describe would be a route
contradicting its own specification.

The console is off by default. With `ADMIN_TOKEN` unset there is no admin
surface at all, and clearing it is how an operator takes the surface down in a
hurry: sessions already signed in stop resolving with it.

**What is deliberately not written here: any deadline.** This document does not
say how quickly a report is looked at, how long a takedown takes, or what an
appeal returns, and neither does the product copy. Those are promises, and the
owner has not made them.

**In neither case does ownership of the rectangle transfer or lapse.** A
takedown is about what is displayed. The buyer still owns the pixels, is not
refunded (moderation after publication is not refunded — see
`docs/references.md`), and nobody else can buy those pixels.

**The schema used to contradict that last paragraph. It no longer does.**
`status = 'removed'` existed, and a removed row sat outside the exclusion
constraint's predicate on purpose: 001 said in as many words that a moderated
block's rectangle goes back on sale. That is ownership lapsing, and it was the
open question of this section. The owner decided it in favour of the paragraph
above, and 006 is that decision: a takedown is a flag, the row keeps its sold
status, the constraint keeps covering its rectangle, and `removed` is retired —
dropped from `blocks_status_known`, so it is not a value anything can write.
`removed_at` and `removed_reason` were renamed to `hidden_at` and
`takedown_reason` rather than replaced; they were already the right two
columns.

## Open decision: whether a block can change hands

**Not decided. Not built. Not promised, in either direction.** It is written
down here, with both outcomes spelled out, so that whoever picks it up sees the
fork rather than working it out again from first principles — and so that
nobody reads the trigger above as an answer to it.

**If it ships.** A later migration teaches `blocks_refuse_owner_change` which
mutation is authorised: an UPDATE carrying a signature from the current owner
over a message naming this block and the new owner, verified in the same
statement that writes it, the way `release_challenges` already does for giving
a hold back. Nothing above has to be torn out first. On chain the ground is
already prepared and was not prepared for this reason: a Core asset transfers
on its owner's signature, our authority key cannot move one, and `AddBlocker`
stops that ever changing. The consequences to accept are a secondary market to
support, ownership that has to be read from the chain rather than from
`buyer_pubkey`, and royalties that start to matter.

**If it does not ship.** The trigger is the whole answer and `buyer_pubkey` is
final for the life of the row. The consequences to accept are that a buyer
cannot exit, that a mistyped wallet address at purchase is unrecoverable, and
that the block is an NFT nobody can sell — which is a strange thing for an NFT
to be, and is the strongest argument on the other side.

**Until it is decided, no copy claims either.** Not the home page, not the FAQ,
not the rules, not this file. `docs/references.md` used to record a competitor's
choice here as our positioning handed to us; it has been corrected, because it
was a claim about a decision nobody had made.

## The two wallets

They are different things and must never be confused.

| | Treasury wallet | Collection authority keypair |
| --- | --- | --- |
| Purpose | Receives USDC for blocks and the SOL platform fee | Signs Core mints as the collection's update authority; signs Irys uploads |
| Private key | **Never touches this codebase.** Operated entirely outside it | `COLLECTION_AUTHORITY_SECRET`, a Vercel environment variable |
| Holds value | Yes, all of it | **Never** — the contract. NOT YET ENFORCED: see condition 1 |
| Configured as | `PAYMENT_WALLET`, a public address | A secret |

The treasury is receive-only from the application's point of view. There is no
withdrawal path, no signing, and no code that could construct one.

## Why the second key exists

Every purchased block is a Metaplex Core NFT in a single collection covering the
whole page. Metaplex Core requires the collection's update authority to sign
whenever an asset is created into that collection. There is no configuration
that removes this requirement.

Three options were considered:

1. **No on-chain collection.** Standalone assets, per-asset royalties, buyer
   signs alone, no server key. Rejected: marketplaces would not group the
   blocks, so there would be no collection page and no `getAssetsByGroup`, and
   ownership sync would degrade to per-mint queries.
2. **A custom Anchor program** holding the authority in a PDA. No server key.
   Rejected for v1: Rust, an audit, and an upgrade-authority question that
   re-opens the same custody problem one level down.
3. **A server-held authority key**, constrained as hard as the standard allows.
   Chosen.

## What the key can and cannot do

This is the blast radius if `COLLECTION_AUTHORITY_SECRET` leaks. It is bounded
by choices made at mint time, not by promises.

### It cannot

- **Take or move money.** It is not a payment destination, holds no balance, and
  the treasury is a different wallet whose key is not here.
- **Change a minted block's image, link or caption.** Every asset carries the
  `ImmutableMetadata` plugin, which permanently locks its name and URI. The
  metadata JSON on Arweave is content-addressed and equally unchangeable.
- **Change a block's royalty.** The `Royalties` plugin is added at the asset
  level with its plugin authority removed at creation, so 5% is fixed for the
  life of the asset.
- **Gain transfer or freeze rights over somebody's block.** Every asset carries
  the `AddBlocker` plugin, which forbids adding authority-managed plugins after
  creation. Without it, this key could have added `PermanentTransferDelegate` to
  any block and moved it. `AddBlocker` is the single most important control in
  this document.
- **Transfer an asset.** Transfer requires the owner's signature. Update
  authority is not ownership.
- **Fund anything.** Irys uploads are capped at 100 KiB, which is Irys's free
  tier, so the key never needs and never receives a balance.

### It can

- **Mint new assets into the collection.** An attacker could create junk assets
  that appear in the collection on marketplaces. They would not appear on this
  page, which renders from the database, not from the chain.
- **Change the collection's own name and image**, and thereby how the collection
  is presented on marketplaces. The blocks themselves are unaffected.
- **Remove assets from the collection**, detaching them from the group. The
  asset and its owner are unaffected; ownership sync via `getAssetsByGroup`
  would stop seeing them until they are re-added.
- **Upload arbitrary data to Arweave** under our Irys identity, bounded by the
  free tier.

Summarised: a leak is a reputational and bookkeeping incident, not a theft. No
user loses a block, no block changes, and no money moves.

## Enforced conditions

**ONE of these is enforced by code today: condition 3, the 100 KiB cap, in
`src/lib/board/content.ts`.** The other three are contracts the key must arrive
under, and they are unenforceable until it does — there is no key, so there is
nothing reading a secret to keep out of a log or off a disk. They are written
here so the batch that introduces the key knows what it owes, and marked so that
nobody reads this page and believes a guard is standing that is not.

An audit of this repository checked exactly that and found the count above used
to say three. It said three because conditions 2 and 4 are true of the code as
written — nothing logs the secret, because nothing reads it. That is a property
of absence, not a guard, and stating it as enforcement is how a document starts
lying slowly.

1. **Zero balance — SPECIFIED, NOT YET BUILT.** There is no `startup-check.ts`
   in this repository, nothing reads `COLLECTION_AUTHORITY_SECRET`, and no
   balance is checked anywhere. There is also no key and no minting yet, so
   there is nothing to check — writing the check now would be code with no
   caller, which this project's own rules forbid.

   The contract it must satisfy when the key lands: read the authority's SOL
   and USDC balances at boot and refuse to serve if either is non-zero. A
   funded authority key is a configuration error, because a key that can hold
   value is a key somebody will eventually be tempted to use for value.

   **This must ship in the same batch as the key itself.** A key introduced
   without it is a key with no guard, and this paragraph is the reminder.
2. **Environment only.** The secret is read from `process.env` and never written
   to disk, never logged, and never included in an error message or a response
   body. It must not appear in `.env.example` beyond its name.
3. **100 KiB upload cap**, enforced before any upload is attempted. This is a
   security control: it is what makes condition 1 satisfiable forever.
4. **Mandatory plugins.** A mint that would not carry `ImmutableMetadata`,
   `AddBlocker`, and an authority-less `Royalties` plugin must fail rather than
   proceed. The blast radius above is only true if all three are present on
   every asset.

## Rotating the collection authority

Do this on suspicion, not on proof. It is cheap and it is the whole mitigation.

**Prerequisites.** The current secret, a machine that is not a production
server, and a new keypair generated offline.

1. Generate the new keypair offline: `solana-keygen new --no-outfile` and record
   the seed phrase somewhere that is not a computer.
2. From an operator machine — never from the deployed application — transfer the
   collection's update authority to the new public key, signing with the current
   authority:

   ```
   mplx core collection update <COLLECTION_ADDRESS> \
     --new-update-authority <NEW_PUBKEY>
   ```

   Equivalently, `updateCollection` with `newUpdateAuthority` via the JS SDK.
3. Verify on-chain that `updateAuthority` on the collection account is the new
   key before touching anything else.
4. Replace `COLLECTION_AUTHORITY_SECRET` in the Vercel project settings and
   redeploy. Once the startup check of condition 1 exists it will refuse to boot
   on a funded key, and that is the intended smoke test — but it does not exist
   yet, so until it ships this step is a manual balance check before the
   redeploy, not an automatic one.
5. Confirm a mint end to end on a paid order, or on a devnet equivalent.
6. Destroy the old secret everywhere it exists: Vercel history, any local shell
   history, any password manager entry — **and the build cache.** The 2026-08-28
   audit found `ADMIN_TOKEN`, `RATE_LIMIT_SALT` and the database password
   written verbatim into `.next/cache/turbopack/*.sst`: Turbopack stores the
   environment it uses as cache keys, and Vercel preserves that cache between
   builds, so a rotated secret would go on living in build infrastructure after
   the rotation was declared done. `npm run build` now deletes that cache and
   then runs `scripts/check-build-secrets.mts`, which refuses the build if any
   secret's value is anywhere in `.next` — and refuses just as loudly if it
   cannot prove its own scan works.

**What rotation does not do.** Already-minted assets are unaffected either way —
that is the point of the plugins in §"It cannot". Rotation stops future misuse;
it does not repair anything, because nothing repairable is at risk.

**If junk assets were minted before rotation**, they can be removed from the
collection by the new authority. They are not on the page and never were.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository. Do not open a public
issue for anything touching keys, payments, or the mint path.
