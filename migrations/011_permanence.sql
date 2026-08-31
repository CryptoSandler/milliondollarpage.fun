-- Two doors the ownership trigger left open, and the audit walked through both.
--
-- 005 forbade changing `buyer_pubkey` on a sold row, and 006 restated it after
-- `removed` was retired. Its WHEN clause reads OLD.status, which is exactly the
-- right question and exactly one statement too late:
--
--   UPDATE blocks SET status='reserved', expires_at=now()+interval '1 hour' WHERE id='…';
--   UPDATE blocks SET buyer_pubkey='ATTACKER' WHERE id='…';
--   UPDATE blocks SET status='paid', expires_at=NULL WHERE id='…';
--
-- The middle statement sees OLD.status = 'reserved', so the trigger never
-- fires, and the sale comes out the other side owned by somebody else. The
-- 2026-08-28 audit reported this; it was reproduced against a test database
-- before this migration was written, and the sequence above is the one that
-- actually worked — an earlier three-statement version of it does not, because
-- `blocks_paid_never_expires` refuses a paid row with an expiry.
--
-- DELETE was never guarded at all. `DELETE FROM blocks WHERE id='…'` on a sold
-- row succeeds and hands the pixels straight back to the exclusion constraint,
-- which is ownership lapsing by the most direct route available.
--
-- WHAT THIS DOES NOT DO: forbid the takedown. SECURITY.md's two levels are a
-- flag and a content purge on a row that stays `paid` or `minted`, and neither
-- touches status, owner or rectangle — so neither is affected by anything here.
-- Nor does it forbid deleting a HOLD: the expiry sweep deletes reserved rows
-- constantly and must go on doing so.

-- A sale never becomes a hold again.
--
-- Separate from the owner trigger rather than folded into it, because it is a
-- different sentence: that one says who a sold rectangle belongs to, this one
-- says a sold rectangle stays sold. Folding them would make one condition that
-- has to be read twice to see it covers two things.
CREATE FUNCTION blocks_refuse_unsale() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'block % is sold: status cannot go back to %', OLD.id, NEW.status
    USING ERRCODE = 'restrict_violation',
          HINT = 'A sold rectangle does not become available again. A takedown hides content and leaves the sale standing.';
END;
$$;

CREATE TRIGGER blocks_stay_sold
  BEFORE UPDATE ON blocks
  FOR EACH ROW
  WHEN (OLD.status IN ('paid', 'minted') AND NEW.status NOT IN ('paid', 'minted'))
  EXECUTE FUNCTION blocks_refuse_unsale();

-- A sale is never deleted.
--
-- The sweep deletes holds, so this cannot be a blanket refusal; it is scoped to
-- the two sold statuses by its WHEN clause, exactly like the others.
CREATE FUNCTION blocks_refuse_sold_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'block % is sold: it cannot be deleted', OLD.id
    USING ERRCODE = 'restrict_violation',
          HINT = 'Deleting a sale returns its pixels to the board, which is ownership lapsing. Hide or purge the content instead; the sale stays.';
END;
$$;

CREATE TRIGGER blocks_sale_is_not_deletable
  BEFORE DELETE ON blocks
  FOR EACH ROW
  WHEN (OLD.status IN ('paid', 'minted'))
  EXECUTE FUNCTION blocks_refuse_sold_delete();
