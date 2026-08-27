-- A takedown hides content. It never hands the rectangle back to the board.
--
-- 001 wrote the opposite in as many words: "'removed' is absent on purpose: a
-- moderated block's rectangle goes back on sale, so it must stop conflicting
-- with anything." SECURITY.md's takedown rule says the reverse — "normal =
-- bandera de visibilidad, contenido intacto y reversible; legal = purga real de
-- bytes cuando la ley obliga, la propiedad del rectángulo NO se transfiere ni
-- se pierde" — and it named the collision as the open question of that section.
-- The owner has decided it: ownership survives a takedown. This migration is
-- that decision, not a new one.
--
-- The mechanism is a VISIBILITY FLAG on a row that stays `paid` or `minted`.
-- That is the whole trick: status is what the exclusion constraint's predicate
-- reads, so a hidden block keeps holding its pixels against every other buyer,
-- and no route, no script and no console session can resell them by forgetting
-- a check. A flag is orthogonal to status; a status was not.
--
-- WHAT HAPPENS TO 'removed'. It is retired rather than left lying around as a
-- value nothing writes and every reader has to keep remembering not to trust.
-- The status CHECK below drops it, which makes the value unwritable from this
-- migration forward. Any row still carrying it — there are none: 004 emptied
-- the table and nothing has launched — becomes a hidden sale, because that is
-- what a removed row was always meant to be.
--
-- WHAT HAPPENS TO removed_reason / removed_at. Renamed rather than dropped and
-- replaced. `removed_at` is exactly the timestamp a normal takedown needs, and
-- `removed_reason` is exactly the reason both levels need, so they are
-- repurposed under names that say what they now mean. Nothing is left dead in
-- the table and nothing new is added for a job a column already did.
--
-- WHAT IS NOT TOUCHED: the exclusion constraint itself. Its predicate,
-- `status IN ('reserved', 'paid', 'minted')`, is now the whole of
-- `blocks_status_known` — every status a row may hold is inside it — so the
-- overlap semantics are unchanged and the WHERE clause has simply stopped
-- excluding anything. Rewriting it would rebuild a GiST index to say the same
-- thing.

-- The two columns, under names that describe the mechanism rather than a status
-- that no longer exists.
ALTER TABLE blocks RENAME COLUMN removed_at TO hidden_at;
ALTER TABLE blocks RENAME COLUMN removed_reason TO takedown_reason;

-- The second level. `hidden_at` says the content is not published; this says
-- the bytes are gone and are not coming back. Two columns rather than one
-- enum, because they are not alternatives: a purge is a hide that went
-- further, and the CHECK below says so.
ALTER TABLE blocks ADD COLUMN purged_at timestamptz;

-- Every 'removed' row becomes what it was always trying to be: a sale whose
-- content is not published, whose owner is unchanged, and whose rectangle
-- nobody else can buy. Written before the CHECK that makes 'removed'
-- unwritable, so the constraint has nothing left to reject.
UPDATE blocks
   SET status = 'paid',
       hidden_at = COALESCE(hidden_at, now())
 WHERE status = 'removed';

ALTER TABLE blocks DROP CONSTRAINT blocks_status_known;
ALTER TABLE blocks ADD CONSTRAINT blocks_status_known
  CHECK (status IN ('reserved', 'paid', 'minted'));

-- A hold has nothing to take down. Its content is already unpublished (the
-- image route and the board serve `paid` and `minted` alone), it is unpaid,
-- and it ends by itself within thirty minutes — so a flag on one would be a
-- second, weaker way to say what the sweep already says. Only a sale can be
-- hidden.
ALTER TABLE blocks ADD CONSTRAINT blocks_takedown_only_when_sold CHECK (
  (hidden_at IS NULL AND takedown_reason IS NULL) OR status IN ('paid', 'minted')
);

-- A purge is a hide that went further, never an alternative to one. Bytes that
-- have been destroyed cannot be published, so a row that claims to be purged
-- and visible is a row whose two columns disagree.
ALTER TABLE blocks ADD CONSTRAINT blocks_purge_implies_hidden CHECK (
  purged_at IS NULL OR hidden_at IS NOT NULL
);

-- What "the bytes are really gone" means, stated as a constraint rather than
-- trusted to whoever writes the UPDATE. A purge that forgot the mime column,
-- or the caption, or the link, would leave the material it was legally
-- required to destroy sitting in three quarters of a row.
ALTER TABLE blocks ADD CONSTRAINT blocks_purged_keeps_nothing CHECK (
  purged_at IS NULL OR (
    pending_image IS NULL
    AND pending_image_mime IS NULL
    AND image_sha256 IS NULL
    AND caption IS NULL
    AND link IS NULL
  )
);

-- The ownership trigger, re-stated without the status that no longer exists.
--
-- 005 fired it on 'removed' deliberately, "because a takedown hides content and
-- does not move ownership". That reasoning is untouched; it is simply that a
-- taken-down block is now a `paid` or `minted` row with a flag on it, so the
-- two statuses left in the WHEN clause cover exactly what the three used to.
-- Everything else about the trigger — what it forbids, what it deliberately
-- does not forbid, and the open decision it stays compatible with — is 005's
-- and is unchanged. The function is not touched at all.
DROP TRIGGER blocks_owner_is_final ON blocks;
CREATE TRIGGER blocks_owner_is_final
  BEFORE UPDATE ON blocks
  FOR EACH ROW
  WHEN (OLD.status IN ('paid', 'minted')
        AND NEW.buyer_pubkey IS DISTINCT FROM OLD.buyer_pubkey)
  EXECUTE FUNCTION blocks_refuse_owner_change();

-- The legal purge, as one statement nobody can get half right.
--
-- WHO RUNS IT: an operator, by hand, through psql — there is no moderation
-- console in this repository and writing a route for one nobody has asked for
-- would be a route with no caller. It is a database function rather than an
-- application module for the same reason the exclusion constraint is a
-- constraint: it is the definition of what a purge erases, and the definition
-- belongs next to the CHECK that enforces it.
--
-- A normal takedown needs no function. It is one UPDATE either way:
--
--   UPDATE blocks SET hidden_at = now(), takedown_reason = '...' WHERE id = '...';
--   UPDATE blocks SET hidden_at = NULL, takedown_reason = NULL WHERE id = '...';
--
-- and the second of those is the whole of "reversible": the bytes were never
-- touched, so clearing the flag brings back the same image, byte for byte.
--
-- WHAT THIS DOES NOT DO: change `status`, `buyer_pubkey`, `x`, `y`, `w` or
-- `h`. The row stays a sale, the owner stays the owner, and the rectangle stays
-- theirs. That is the point of the whole migration, and it is why this function
-- lists the columns it clears rather than deleting the row.
CREATE FUNCTION block_purge_content(block_id uuid, reason text) RETURNS void
LANGUAGE sql AS $$
  UPDATE blocks
     SET hidden_at = COALESCE(hidden_at, now()),
         purged_at = now(),
         takedown_reason = reason,
         pending_image = NULL,
         pending_image_mime = NULL,
         image_sha256 = NULL,
         caption = NULL,
         link = NULL
   WHERE id = block_id
     AND status IN ('paid', 'minted');
$$;
