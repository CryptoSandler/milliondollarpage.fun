-- Who owns a sold rectangle is not something an UPDATE gets to change.
--
-- This belongs to the same family as 001's exclusion constraint, and it is
-- here for the same reason: the invariant is too important to be a thing the
-- application has to remember. No route, no script and no console session can
-- reassign a sold block by writing to this column, because the database
-- refuses the write itself. An application check would hold only for the code
-- paths somebody thought of.
--
-- WHAT IT FORBIDS: an unauthorised mutation of `buyer_pubkey` on a row that
-- has been paid for. It fires on paid, minted and removed rows — removed
-- included on purpose, because a takedown hides content and does not move
-- ownership (see SECURITY.md, "Takedown"). A `reserved` row is a free
-- thirty-minute hold rather than a sale; its buyer is written once at INSERT
-- and the sweep deletes it if it is never paid, so it is left out.
--
-- WHAT IT DOES NOT FORBID: the concept of transfer. Whether a block can change
-- hands on a signature from its current owner is an OPEN DECISION, recorded as
-- one in SECURITY.md, and this trigger is deliberately compatible with either
-- answer. Building transfer later means another migration that teaches this
-- one function which mutation is authorised — the signature check would live
-- in the same statement that writes the new owner — and nothing here has to be
-- torn out first. What cannot happen in the meantime is a silent reassignment.
--
-- It covers UPDATE only, which is the whole of the mutation surface for
-- ownership: `blocks_paid_never_expires` (002) already keeps a paid row out of
-- the sweep's reach, and the sweep deletes reserved rows exclusively.

CREATE FUNCTION blocks_refuse_owner_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'block % is sold: buyer_pubkey cannot be changed by an UPDATE', OLD.id
    USING ERRCODE = 'restrict_violation',
          HINT = 'Ownership of a sold rectangle moves only with its owner''s signature, and no signed transfer path exists.';
END;
$$;

-- The WHEN clause is the trigger's whole predicate, so the function body is
-- only ever reached by a statement that is already wrong. `IS DISTINCT FROM`
-- rather than `<>` because NULL is a value here: a paid row that somehow
-- carries no buyer must not quietly acquire one either.
CREATE TRIGGER blocks_owner_is_final
  BEFORE UPDATE ON blocks
  FOR EACH ROW
  WHEN (OLD.status IN ('paid', 'minted', 'removed')
        AND NEW.buyer_pubkey IS DISTINCT FROM OLD.buyer_pubkey)
  EXECUTE FUNCTION blocks_refuse_owner_change();
