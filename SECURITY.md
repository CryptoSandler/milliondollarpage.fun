# Security

This project holds one private key. That is a deliberate exception to how its
two ancestors were built, it was approved with conditions, and this document
exists so that nobody — including us, later — has to reconstruct the reasoning
from the code.

## The two wallets

They are different things and must never be confused.

| | Treasury wallet | Collection authority keypair |
| --- | --- | --- |
| Purpose | Receives USDC for blocks and the SOL platform fee | Signs Core mints as the collection's update authority; signs Irys uploads |
| Private key | **Never touches this codebase.** Operated entirely outside it | `COLLECTION_AUTHORITY_SECRET`, a Vercel environment variable |
| Holds value | Yes, all of it | **Never.** Enforced at startup |
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

These are not policy, they are code, and they fail the deployment when violated.

1. **Zero balance.** `startup-check.ts` reads the authority's SOL and USDC
   balances at boot and refuses to serve if either is non-zero. A funded
   authority key is treated as a configuration error, because a key that can
   hold value is a key somebody will eventually be tempted to use for value.
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
   redeploy. The startup check will refuse to boot if the new key holds any
   balance, which is the intended smoke test.
5. Confirm a mint end to end on a paid order, or on a devnet equivalent.
6. Destroy the old secret everywhere it exists: Vercel history, any local shell
   history, any password manager entry.

**What rotation does not do.** Already-minted assets are unaffected either way —
that is the point of the plugins in §"It cannot". Rotation stops future misuse;
it does not repair anything, because nothing repairable is at risk.

**If junk assets were minted before rotation**, they can be removed from the
collection by the new authority. They are not on the page and never were.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository. Do not open a public
issue for anything touching keys, payments, or the mint path.
