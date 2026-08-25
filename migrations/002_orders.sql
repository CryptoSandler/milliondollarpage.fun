-- What an order needs on top of a rectangle.
--
-- Batch 1 shipped a blocks table that could hold a rectangle and nothing else.
-- These are the columns the purchase, the payment and the mint fill in. The
-- chain-side ones (arweave ids, mint address, owner) are unused until a later
-- batch and are added now so the shape of a row stops changing under us.

ALTER TABLE blocks
  ADD COLUMN payment_fraction     integer,
  ADD COLUMN payment_signature    text,
  ADD COLUMN image_arweave_id     text,
  ADD COLUMN metadata_arweave_id  text,
  ADD COLUMN image_sha256         text,
  ADD COLUMN is_animated          boolean NOT NULL DEFAULT false,
  ADD COLUMN mint_address         text,
  ADD COLUMN owner_wallet         text,
  ADD COLUMN removed_at           timestamptz,
  -- Not in the spec's column list, and deliberate: the validated image has to
  -- live somewhere between "validated, before payment" and "uploaded to
  -- Arweave, after payment", and a bytea column is the simplest thing that
  -- does that without introducing a storage service. Nulled once
  -- image_arweave_id is set.
  ADD COLUMN pending_image        bytea,
  ADD COLUMN pending_image_mime   text,
  -- Which caller created the hold, as a salted hash. Never a raw IP. Task 2
  -- uses it to stop one caller holding the whole board.
  ADD COLUMN ip_hash              text;

-- One transfer settles one order. Without this, a replayed signature could
-- mark a second rectangle paid for free.
ALTER TABLE blocks ADD CONSTRAINT blocks_payment_signature_unique UNIQUE (payment_signature);

-- One asset per block, and one block per asset.
ALTER TABLE blocks ADD CONSTRAINT blocks_mint_address_unique UNIQUE (mint_address);

-- The invariant the retry story rests on: a reservation expires, a paid order
-- never does. Enforced here rather than trusted to callers, because the cost of
-- getting it wrong is somebody who paid losing their rectangle to the sweep.
ALTER TABLE blocks ADD CONSTRAINT blocks_paid_never_expires CHECK (
  (status = 'reserved' AND expires_at IS NOT NULL)
  OR (status <> 'reserved' AND expires_at IS NULL)
);

-- A sha256 is 64 lowercase hex characters or it is not a sha256.
ALTER TABLE blocks ADD CONSTRAINT blocks_sha256_shape CHECK (
  image_sha256 IS NULL OR image_sha256 ~ '^[0-9a-f]{64}$'
);

CREATE INDEX blocks_buyer_pubkey ON blocks (buyer_pubkey) WHERE buyer_pubkey IS NOT NULL;
CREATE INDEX blocks_ip_hash_live ON blocks (ip_hash) WHERE status = 'reserved';
