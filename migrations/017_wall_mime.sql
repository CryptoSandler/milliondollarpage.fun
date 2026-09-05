-- The wall is not necessarily a PNG any more.
--
-- WHY. `docs/imagenes.md` §5 measured a full wall of photographs at 3.8 MiB of
-- PNG and recommended WebP, which is roughly a third of that on photographic
-- content. What it recommended alongside — a PNG fallback chosen by `Accept` —
-- is not what shipped, and the reason is in `composite.ts`: content negotiation
-- means one URL with two bodies, which needs a `Vary` header, splits every
-- shared cache in two, and undoes the property the whole versioning scheme
-- exists for. The version is a hash of the BYTES, so a different encoding is
-- simply a different URL, and the build can encode both and keep the smaller.
--
-- WHICH MEANS THE ROW HAS TO SAY WHICH IT KEPT. A `content-type` guessed from
-- the bytes would be a sniff, and a column that says so is one word.
--
-- ADDITIVE, DELIBERATELY. `DEFAULT 'image/png'` is true of every row that
-- already exists — they were all PNGs — so this can be applied to production
-- BEFORE the build that reads it, which is the ordering migration 015 used and
-- 016 could not.
ALTER TABLE board_composites ADD COLUMN mime text NOT NULL DEFAULT 'image/png';

-- Two, and a CHECK rather than an enum, for the reason migration 016 gives:
-- a third encoding should be a migration somebody reads.
ALTER TABLE board_composites ADD CONSTRAINT board_composites_mime_known
  CHECK (mime IN ('image/png', 'image/webp'));

COMMENT ON COLUMN board_composites.mime IS
  'Which encoding won on size for this version. The version is a hash of these exact bytes, so the encoding is part of the identity rather than a negotiation.';
