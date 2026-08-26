-- What a wallet has to sign before a hold can be handed back.
--
-- DELETE /api/orders/:id used to authenticate with the buyer's address in the
-- request body. That address is public by construction — /api/board publishes
-- every live block's id and a wallet address was never a secret — so anyone
-- could walk the board and release a stranger's rectangle. The fix is a
-- signature, and a signature needs something single-use to sign, which is what
-- this table holds.
--
-- One row per challenge. Issued by POST /api/orders/:id/release-challenge,
-- spent by the DELETE, and never spendable twice: `used_at` is stamped by the
-- same UPDATE that reads the row, so a captured signature is worth nothing the
-- second time it is presented.
--
-- The message the wallet signs is rebuilt from these columns rather than
-- stored, so the format lives in one place (src/lib/wallet/signature.ts) and a
-- row cannot disagree with it.
CREATE TABLE release_challenges (
  nonce       text PRIMARY KEY,
  -- ON DELETE CASCADE because a spent challenge's whole purpose was to delete
  -- this block: the successful release takes its own challenges with it, and
  -- so does the expiry sweep. Nothing has to remember to tidy up after either.
  order_id    uuid NOT NULL REFERENCES blocks (id) ON DELETE CASCADE,
  issued_at   timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,

  -- 32 random bytes as hex or it did not come from us.
  CONSTRAINT release_challenges_nonce_shape CHECK (nonce ~ '^[0-9a-f]{64}$'),
  -- A challenge that never expires is a replay window that never closes.
  CONSTRAINT release_challenges_expires_after_issue CHECK (expires_at > issued_at)
);

-- Issuing a challenge deletes the expired ones first; this is the index that
-- makes that a cheap range scan rather than a scan of the whole table.
CREATE INDEX release_challenges_expiry ON release_challenges (expires_at);
