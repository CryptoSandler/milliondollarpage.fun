-- A picture that has been purged cannot come back on another rectangle.
--
-- WHAT WAS ALREADY TRUE AND WHAT WAS NOT. Every upload has had its SHA-256
-- computed and stored since 001 — `image_sha256` — and it has never been
-- compared against anything. It exists to fingerprint the wall for cache
-- invalidation (`wallFingerprint` in composite.ts) and for nothing else. So a
-- takedown was a single EVENT: the same bytes could be bought onto a different
-- rectangle five minutes later, and nothing anywhere would notice.
--
-- `docs/imagenes.md` measured the rest of the moderation surface and named this
-- as the most urgent thing missing, which is why it is one table and not a
-- programme of work: format, weight and dimensions are already checked, a
-- takedown already exists for what is published, and the gap is only that
-- refusing something once did not refuse it again.
--
-- WHAT THIS IS NOT. It is not a perceptual hash. A one-pixel edit produces a
-- different SHA-256 and walks straight past this table, and that is understood
-- rather than overlooked — `DECISIONS.md` carries pHash as a later layer, and
-- the argument for doing the exact match first is that it costs one index
-- lookup and stops the case that actually happens: the same file, again.
--
-- AND IT IS NOT A RECORD OF PEOPLE. There is no wallet here, no block id and no
-- order. A row is a hash, a reason and a moment — the same subtraction
-- `tape.ts` makes for the register, for the same reason: this table will be
-- read by an admin screen, and a column that named a buyer would be a column
-- somebody eventually shows.

CREATE TABLE blocked_images (
  -- Lower-case hex, exactly as `createHash("sha256").digest("hex")` writes it
  -- and exactly as `blocks.image_sha256` stores it. The CHECK is what stops a
  -- hand-inserted row in another shape from silently never matching.
  sha256      text PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),

  -- Why, in the words of whoever refused it. Required: a blocklist entry with
  -- no reason is one nobody can review, and this table's whole value is that it
  -- outlives the person who wrote the row.
  reason      text NOT NULL CHECK (length(btrim(reason)) > 0),

  -- Where the row came from. `purge` writes automatically; `admin` is a person
  -- deciding in advance. Two sources, so a review can tell an automatic
  -- consequence from a judgement.
  source      text NOT NULL CHECK (source IN ('purge', 'admin')),

  blocked_at  timestamptz NOT NULL DEFAULT now()
);

-- The lookup this exists for is by hash and only by hash: the primary key IS
-- the index, and no second one is needed. The listing an admin screen reads is
-- by recency.
CREATE INDEX blocked_images_recent ON blocked_images (blocked_at DESC);

COMMENT ON TABLE blocked_images IS
  'SHA-256 of images refused at upload. A purge writes here so a takedown is a rule rather than an event.';
