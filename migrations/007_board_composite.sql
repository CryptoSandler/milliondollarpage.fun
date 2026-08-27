-- The wall, as one bitmap, versioned.
--
-- WHY A TABLE AT ALL, for data that is derived. The composite is rebuildable
-- from `blocks` at any moment, which is an argument against storing it — and
-- it loses to two facts about where this runs. Serverless instances do not
-- share a filesystem or a heap, so a composite built in one process is
-- invisible to the next request; and the URL has to be the SAME URL for every
-- visitor or the CDN caches one wall per instance. A row is the smallest thing
-- that is shared, immutable per version, and reachable from a request. There is
-- no cache to invalidate and nothing to keep in sync: if this table were
-- emptied, the next board request would rebuild it and carry on.
--
-- VERSION IS THE CONTENT'S OWN sha256, not a counter. Three things follow, and
-- all three are the reason:
--   * the URL is immutable by construction, so it is served with a year of
--     `immutable` cache and a new wall busts the CDN by BEING a different URL
--     rather than by asking anyone to purge anything;
--   * regeneration is idempotent — rebuilding unchanged rows produces the same
--     bytes, the same version, the same URL, and no CDN churn;
--   * two instances racing to rebuild the same wall write the same row, so the
--     upsert in `composite.ts` has nothing to resolve.
--
-- FINGERPRINT is the other half: a digest of the ROWS the composite was built
-- from. It is what makes "has anything changed" one cheap read instead of a
-- rebuild, and it is stored beside the bytes so the answer travels with them.
CREATE TABLE board_composites (
  version      text PRIMARY KEY,
  png          bytea NOT NULL,
  fingerprint  text NOT NULL,
  built_at     timestamptz NOT NULL DEFAULT now(),

  -- A version that is not a sha256 did not come from us.
  CONSTRAINT board_composites_version_shape CHECK (version ~ '^[0-9a-f]{64}$')
);

-- The current wall is the most recently built one, and this is the index that
-- makes finding it a single-row lookup rather than a sort of the table. The
-- table is kept to a handful of rows by `composite.ts`, which prunes on every
-- successful build; the index is here because "handful" is a property of the
-- code and not of the schema.
CREATE INDEX board_composites_recent ON board_composites (built_at DESC);
