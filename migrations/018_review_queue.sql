-- Nothing is painted until a person has looked at it.
--
-- THE SALE IS NOT PENDING — THE PUBLICATION IS. The money settles, the
-- rectangle is the buyer's, the exclusion constraint holds it, the register
-- carries the settlement and `/stats` counts the pixels. What waits is the
-- artwork appearing on the wall. That distinction is the whole design and it is
-- what lets this migration touch no trigger and no constraint.
--
-- IT IS A COLUMN AND NOT A STATUS, and that was the adversarial round's finding
-- rather than a preference. A fourth status collides with the overlap
-- constraint's status list, with `blocks_stay_sold`, with
-- `blocks_paid_at_matches_status`, and with every reader that asks
-- `status IN ('paid','minted')`. A column folds into `publishesTextSql`
-- instead — one predicate that already gates the composite, the block's words,
-- its page, its image, its card, its badge, `/go` and `/buyers` — so eight
-- readers get this for free and nothing else moves.
--
-- NULL MEANS WAITING, which is the right default in both directions: a new
-- purchase is unreviewed, and so is every purchase that already exists.
ALTER TABLE blocks ADD COLUMN approved_at timestamptz;

-- What the owner wrote when they approved or refused it. Never shown to the
-- public and never returned to the buyer — the same rule the blocklist's
-- `reason` follows, and for the same reason: a refusal that explains itself is
-- a refusal somebody can iterate against.
ALTER TABLE blocks ADD COLUMN approval_note text;

-- ---------------------------------------------------------- the backfill
--
-- EVERY EXISTING SALE IS APPROVED, and the date says why: this wall published
-- them the moment they settled, because that was the rule when they were
-- bought. Leaving them NULL would take pictures OFF the wall that have been on
-- it — a review queue applied retroactively to purchases nobody agreed to
-- review — and that is a different decision from the one that was taken.
UPDATE blocks SET approved_at = paid_at
 WHERE status IN ('paid', 'minted') AND paid_at IS NOT NULL;

-- The queue is read oldest-first and is expected to be short; the index is for
-- the read that matters, which is "what is waiting".
CREATE INDEX blocks_awaiting_review ON blocks (paid_at)
  WHERE approved_at IS NULL AND status IN ('paid', 'minted');

COMMENT ON COLUMN blocks.approved_at IS
  'When a person looked at this purchase and let it onto the wall. NULL means waiting: the sale stands, the publication does not.';
