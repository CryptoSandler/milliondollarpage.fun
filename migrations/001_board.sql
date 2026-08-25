-- The board.
--
-- Non-overlap is a database invariant, not application logic: the exclusion
-- constraint below is the only thing standing between us and selling the same
-- pixels twice, and it holds under concurrency without a lock we have to
-- remember to take.
--
-- Two int4range columns rather than one box column, deliberately. Postgres's
-- `box &&` reports two boxes that merely share an EDGE as overlapping, and on
-- a full board every block touches its neighbours — a box constraint would
-- have rejected the second block ever sold. int4range is half-open and exact.
-- The ranges are GENERATED from x/y/w/h so the two representations can never
-- disagree.

CREATE TABLE blocks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  x                     integer NOT NULL,
  y                     integer NOT NULL,
  w                     integer NOT NULL,
  h                     integer NOT NULL,
  x_range               int4range GENERATED ALWAYS AS (int4range(x, x + w)) STORED,
  y_range               int4range GENERATED ALWAYS AS (int4range(y, y + h)) STORED,

  status                text NOT NULL,
  buyer_pubkey          text,
  price_per_pixel_usdc  bigint NOT NULL,
  total_usdc            bigint NOT NULL,

  caption               text,
  link                  text,
  image_fit             text,

  expires_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  minted_at             timestamptz,
  removed_reason        text,

  CONSTRAINT blocks_status_known CHECK (status IN ('reserved', 'paid', 'minted', 'removed')),
  CONSTRAINT blocks_on_grid CHECK (x % 10 = 0 AND y % 10 = 0 AND w % 10 = 0 AND h % 10 = 0),
  CONSTRAINT blocks_min_size CHECK (w >= 10 AND h >= 10),
  CONSTRAINT blocks_in_bounds CHECK (x >= 0 AND y >= 0 AND x + w <= 1000 AND y + h <= 1000),
  CONSTRAINT blocks_caption_length CHECK (caption IS NULL OR char_length(caption) <= 32),
  CONSTRAINT blocks_image_fit_known CHECK (image_fit IS NULL OR image_fit IN ('contain', 'cover'))
);

-- 'removed' is absent on purpose: a moderated block's rectangle goes back on
-- sale, so it must stop conflicting with anything.
ALTER TABLE blocks ADD CONSTRAINT blocks_no_overlap
  EXCLUDE USING gist (x_range WITH &&, y_range WITH &&)
  WHERE (status IN ('reserved', 'paid', 'minted'));

-- Reservations are swept by expiry; a paid order has expires_at nulled and is
-- therefore invisible to this index, which is the point.
CREATE INDEX blocks_live_reservations ON blocks (expires_at)
  WHERE status = 'reserved';

CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- The one default this batch is allowed: one dollar per pixel, in USDC base
-- units. Every other price arrives with the admin console.
INSERT INTO settings (key, value) VALUES ('price_per_pixel_usdc', '1000000');
