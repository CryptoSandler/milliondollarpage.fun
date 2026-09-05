-- An owner is a CHAIN and an address, not an address.
--
-- WHY NOW. This wall is about to take money on Robinhood Chain (4663), and an
-- EVM address is not a Solana public key: they are different alphabets, they
-- are different lengths, and — the part that matters — the same twenty bytes
-- can be a valid address on both while belonging to two different people. A
-- column called `buyer_pubkey` holding either one is a column that cannot
-- answer "who owns this" without somebody remembering which chain it came
-- from, and "somebody remembers" is the failure this project writes migrations
-- to avoid.
--
-- SO THE COLUMN IS RENAMED AND A SECOND ONE JOINS IT. `owner_address` is what
-- it always was; `owner_chain` says which alphabet it is written in. Existing
-- rows are `solana` — every purchase this wall has ever taken was specified for
-- Solana, and the DEFAULT backfills them in one statement without a rewrite.
--
-- WHY A RENAME RATHER THAN A NEW PAIR OF COLUMNS. `pubkey` is a Solana word. A
-- column holding an EVM address under that name is a lie that every reader
-- after today has to know to ignore, and this repository has renamed a column
-- on this table before for exactly that reason — 006 turned `removed_at` into
-- `hidden_at` when "removed" stopped being what it meant, and recreated the
-- trigger that named it. This is that, again.
--
-- WHAT DOES NOT CHANGE, and this is most of the file's job to keep true: the
-- permanence rules. A sold rectangle still cannot change owner, still cannot
-- become unsold, and still cannot be deleted. The trigger below is recreated
-- rather than altered because a WHEN clause naming a column that no longer
-- exists is a trigger Postgres refuses to keep — and while it is being written
-- again it gains the second half of the same sentence: changing the CHAIN of a
-- sold row is changing its owner just as surely as changing the address.

-- ---------------------------------------------------------------- the chain
--
-- NOT NULL WITH A DEFAULT, which Postgres 11 and later apply without rewriting
-- the table. `solana` for everything that exists, because everything that
-- exists was bought under a specification that named it.
ALTER TABLE blocks ADD COLUMN owner_chain text NOT NULL DEFAULT 'solana';

-- The two this wall knows about, and a CHECK rather than an enum: adding a
-- third chain should be a migration somebody reads, not an ALTER TYPE that
-- slips past in a diff.
ALTER TABLE blocks ADD CONSTRAINT blocks_owner_chain_known
  CHECK (owner_chain IN ('solana', 'robinhood'));

-- ------------------------------------------------------------- the address
ALTER TABLE blocks RENAME COLUMN buyer_pubkey TO owner_address;

-- The index follows its column. Postgres rewrites the index's own definition
-- on a rename; only the NAME is left saying something that is no longer true.
ALTER INDEX blocks_buyer_pubkey RENAME TO blocks_owner_address;

-- ------------------------------------------------------- and the permanence
--
-- The function's message named the old column, and an exception that names a
-- column nobody can find is a bad half-hour for whoever hits it.
CREATE OR REPLACE FUNCTION blocks_refuse_owner_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'block % is sold: its owner (chain, address) cannot be changed by an UPDATE', OLD.id
    USING ERRCODE = 'restrict_violation',
          HINT = 'A sold rectangle does not change hands. See DECISIONS.md, which holds whether it ever may as an open question.';
END;
$$;

DROP TRIGGER blocks_owner_is_final ON blocks;
CREATE TRIGGER blocks_owner_is_final
  BEFORE UPDATE ON blocks
  FOR EACH ROW
  WHEN (OLD.status IN ('paid', 'minted')
        AND (NEW.owner_address IS DISTINCT FROM OLD.owner_address
             OR NEW.owner_chain IS DISTINCT FROM OLD.owner_chain))
  EXECUTE FUNCTION blocks_refuse_owner_change();

COMMENT ON COLUMN blocks.owner_chain IS
  'Which chain owner_address is written for. An EVM address and a Solana pubkey are not comparable without it.';
