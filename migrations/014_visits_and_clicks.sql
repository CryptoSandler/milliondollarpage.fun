-- Two counts the wall can show, and neither of them knows who anybody is.
--
-- WHAT THIS IS FOR. The page can say how much of the wall is sold and how many
-- people are on it right now. What it cannot say is how many have EVER been —
-- which is the number a buyer weighing a rectangle actually wants — or what a
-- rectangle's link has been worth to the person who bought it. These are those
-- two, and both are built so that the privacy argument is a property of the
-- columns rather than a promise in a comment, exactly as `013_presence.sql`
-- argues for the table it adds.
--
-- WHAT IS NOT HERE, AND MAY NOT BE ADDED WITHOUT A DECISION THE OWNER TAKES ON
-- PURPOSE: an IP address, a cookie, a session id, a referrer, a user agent, a
-- country, a path, or any column that stands for one person across two visits.
-- `visit_total` has two columns and neither is text. `block_clicks` has a block
-- and an integer. There is nowhere in either to put a visitor even by accident,
-- which is the only kind of guarantee worth writing down.

-- ---------------------------------------------------------------- total views
--
-- ONE ROW AND ONE NUMBER, and that is the whole design. The obvious
-- implementation is a row per visit, which is a table of visitors under another
-- name; this is a counter that the roll-up adds to and nothing else ever reads
-- per-person.
--
-- A VISIT IS A NEW PRESENCE SESSION. `presence_seen` already holds (hash,
-- minute) pairs from the anonymous heartbeat, and a session STARTS at a minute
-- whose visitor has no minute immediately before it. That is countable in one
-- query over rows that already exist, so this adds no new collection at all —
-- it adds arithmetic over collection the owner already decided on.
--
-- `counted_through` is what makes the roll-up idempotent. The cron may run
-- twice, or run after a failure, and a counter that added the same day twice
-- would be a number that only ever grew wrong. Every run counts sessions
-- strictly after this mark and moves it; running it again counts nothing.
--
-- ONE HONEST IMPRECISION, RECORDED RATHER THAN HIDDEN: a session that straddles
-- the mark is counted in both runs, because the raw minutes on each side are
-- counted separately. It is the same class of imprecision `presence_rollup`
-- already carries for a visitor who spans midnight, and it is bounded by one
-- session per visitor per roll-up rather than by anything that grows.
CREATE TABLE visit_total (
  -- A one-row table, enforced. Without this the counter is a table that can
  -- silently acquire a second answer to a question with one answer.
  only_row        boolean PRIMARY KEY DEFAULT true,
  visits          bigint NOT NULL DEFAULT 0,
  counted_through timestamptz NOT NULL DEFAULT '-infinity',

  CONSTRAINT visit_total_is_one_row CHECK (only_row),
  CONSTRAINT visit_total_never_negative CHECK (visits >= 0)
);

INSERT INTO visit_total (only_row) VALUES (true);

-- ------------------------------------------------------------ clicks per block
--
-- A row per BLOCK, not per click. A click table would be a log with a time in
-- it, and a time plus a block is close enough to a person to be worth refusing:
-- two clicks a second apart on the same rectangle are one visitor, and a schema
-- that can express that is a schema somebody will one day query that way.
--
-- The counter is created on the first click rather than with the block, so a
-- rectangle nobody has clicked has no row and reads as zero. `ON DELETE
-- CASCADE` because a block that is gone has no clicks; there is no such thing
-- as a click belonging to nothing.
CREATE TABLE block_clicks (
  block_id uuid PRIMARY KEY REFERENCES blocks (id) ON DELETE CASCADE,
  clicks   bigint NOT NULL DEFAULT 0,

  CONSTRAINT block_clicks_never_negative CHECK (clicks >= 0)
);
