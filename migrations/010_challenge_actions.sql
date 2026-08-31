-- What a challenge was issued FOR, stored beside the nonce that carries it.
--
-- 003 built this table for one act: handing a hold back. Its header states the
-- argument that made it necessary — "That address is public by construction …
-- so anyone could walk the board and release a stranger's rectangle" — and the
-- security audit of 2026-08-28 found the same sentence still true of the two
-- routes that were never converted: POST /api/orders/:id/content and
-- POST /api/orders/:id/confirm both read a wallet address out of the request
-- and treated a match against blocks.buyer_pubkey as proof. Both are now signed
-- the way the DELETE is, which means one table serves three acts.
--
-- WHY THE ACTION HAS TO BE A COLUMN. 003 also says: "The message the wallet
-- signs is rebuilt from these columns rather than stored, so the format lives
-- in one place (src/lib/wallet/signature.ts) and a row cannot disagree with
-- it." The message names the act — `Action: release` — so with three acts and
-- no column, the server rebuilding a message would have to guess which act the
-- row was for, and the only guess available is "whatever the route being called
-- happens to want". That guess is the hole: a challenge a holder was talked
-- into signing to let a hold go would verify perfectly at /content, and the
-- attacker would own the picture, the link and the caption on a rectangle
-- somebody else is about to pay for, permanently. The column is what makes the
-- rebuilt message the one that was actually agreed to.
--
-- The table keeps its 003 name. It is applied, and an applied migration is
-- never edited; renaming it here would buy a tidier noun and cost the ledger's
-- one honest record of what ran. The code that reads it is
-- src/lib/board/challenge.ts, which is named for what it does now.
ALTER TABLE release_challenges
  -- DEFAULT for the rows already in flight when this runs: every one of them
  -- was issued by the release path, because that was the only path there was.
  ADD COLUMN action text NOT NULL DEFAULT 'release';

-- And then the default goes away. A default that outlives the backfill is a
-- silent answer to a question every INSERT must state: an issuing path that
-- forgot to name its action would mint a release challenge and nothing would
-- say so. Without the default it is a NOT NULL violation at the statement that
-- got it wrong.
ALTER TABLE release_challenges
  ALTER COLUMN action DROP DEFAULT;

-- The three acts a wallet can be asked to prove, listed where the database can
-- refuse a fourth. Adding one is a migration, which is the point: a new act is
-- a new sentence a buyer is asked to sign, and that deserves a file rather than
-- a string appearing in a route. Mirrors ChallengeAction in
-- src/lib/wallet/signature.ts, in the same spirit as blocks_status_known.
ALTER TABLE release_challenges
  ADD CONSTRAINT release_challenges_action_known
  CHECK (action IN ('release', 'attach', 'pay'));
