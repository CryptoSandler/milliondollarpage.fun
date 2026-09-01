-- When a sale settled, which is the one fact the tape needs and the only one
-- `blocks` never wrote down.
--
-- WHAT ASKED FOR IT. The bottom rail is a running register of settled
-- purchases, and every row on it says how long ago it landed. There was no
-- column that could answer that. `created_at` is when the HOLD was taken, which
-- is up to `RESERVATION_MINUTES` before the money moved — so a tape built on it
-- would print "just now" against a purchase that settled half an hour ago and
-- call itself a register of settlements. A feed that is wrong about time is
-- worse than no feed, because its whole claim is that it is watching.
--
-- `minted_at` exists and is not it either: it belongs to the mint, which is a
-- later batch and a different event.
--
-- WHY A TRIGGER AND NOT `markPaid`. Setting it in the one UPDATE that makes a
-- sale was the first draft, and it is the version that reads best and is wrong.
-- `markPaid` is not the only statement in this repository that produces a paid
-- row: twenty test files insert one directly, the admin console reads and
-- writes sold rows, and a person with a console is a writer too. Every one of
-- those would have produced a sale the tape could not date, and the CHECK below
-- would have turned each into a failure at the INSERT rather than a missing
-- row somebody notices later. The trigger makes the stamp a property of the
-- ROW's state instead of a habit of one function — which is the same argument
-- `001_board.sql` makes for the overlap constraint, and it is the reason those
-- twenty files did not have to be touched.
ALTER TABLE blocks ADD COLUMN paid_at timestamptz;

-- Rows that predate this column.
--
-- There are none in production: nothing has ever been sold, because the money
-- path is specified and not built (`DECISIONS.md`). This statement is here for
-- the test and branch databases that DO carry sold rows, put there by a suite,
-- and for those the hold's own creation is the closest thing to the truth that
-- exists — wrong by at most the length of one hold, and never wrong about the
-- order two sales happened in. It is a backfill of fixtures, not of history.
UPDATE blocks SET paid_at = created_at WHERE status IN ('paid', 'minted') AND paid_at IS NULL;

-- It only ever FILLS. A statement that supplies its own `paid_at` — the
-- backfill above, a fixture pinning a row to a known moment so a "3 minutes
-- ago" can be asserted — keeps it. Nothing here can move or clear a settlement
-- time that already exists, so this cannot be used to rewrite when a sale
-- happened.
CREATE FUNCTION blocks_stamp_paid_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('paid', 'minted') AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER blocks_paid_at_is_stamped
  BEFORE INSERT OR UPDATE ON blocks
  FOR EACH ROW
  EXECUTE FUNCTION blocks_stamp_paid_at();

-- A sale knows when it settled; a hold has not settled.
--
-- Both halves matter, and neither is made redundant by the trigger. The first
-- is unfalsifiable while the trigger stands and is what would catch its
-- removal. The second the trigger cannot enforce at all: it never clears a
-- value, so only this refuses a RESERVED row carrying a settlement time, which
-- is a rectangle nobody has paid for on a register of things people have.
ALTER TABLE blocks ADD CONSTRAINT blocks_paid_at_matches_status CHECK (
  (status IN ('paid', 'minted') AND paid_at IS NOT NULL)
  OR (status NOT IN ('paid', 'minted') AND paid_at IS NULL)
);

-- The tape's only read: the newest settled purchases, in order. Partial,
-- because holds are most of the table while the board is filling and none of
-- them belongs in this index.
CREATE INDEX blocks_settled_recently ON blocks (paid_at DESC)
  WHERE status IN ('paid', 'minted');
