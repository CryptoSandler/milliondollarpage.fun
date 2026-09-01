-- Who is here, counted without knowing who anybody is.
--
-- WHAT THIS IS FOR. A wall filling up is the only social proof this product
-- has, and until now the page could only say how much of it was sold. "Nine
-- people are looking at this right now" is the other half, and on a board where
-- two buyers cannot have the same rectangle it is also useful rather than
-- decorative.
--
-- WHAT IT IS NOT. Not analytics. There is no path, no referrer, no user agent,
-- no session, no country and no cookie in this schema, and none may be added
-- without a decision the owner takes on purpose. The only column that stands
-- for a person is `caller_hash`, which is `hashIp` — sha256 over a salted IP,
-- the same one-way key the rate limiter already counts against. Rotating
-- RATE_LIMIT_SALT makes every row here permanently unlinkable to a visitor,
-- which is the property that lets this table exist at all.
--
-- WHY MINUTES AND NOT TIMESTAMPS. A row per heartbeat would be a row per
-- visitor per minute forever, and dating each one to the millisecond would
-- make two heartbeats from the same person in the same minute two rows. Both
-- problems disappear if the minute IS the key: a heartbeat is an upsert that
-- does nothing when it repeats, so the table's size is bounded by distinct
-- visitors times minutes present, and no more.

CREATE TABLE presence_seen (
  caller_hash  text NOT NULL,
  minute       timestamptz NOT NULL,
  PRIMARY KEY (caller_hash, minute)
);

-- Both reads this table serves scan by time: who is here now, and who was here
-- during an hour that is being rolled up. Neither ever asks about one visitor.
CREATE INDEX presence_seen_by_minute ON presence_seen (minute);

-- The roll-up.
--
-- EVERY BUCKET IS COUNTED FROM RAW ROWS, AND THAT IS THE WHOLE DESIGN. The
-- obvious implementation collapses minutes into hours and then hours into days
-- by ADDING them up, and it is wrong in a way that is invisible until somebody
-- checks: a visitor present at 09:05 and 09:40 is two minute-buckets and one
-- visitor, and a visitor present in three hours of a day is three hour-buckets
-- and one visitor. Summing counts visitor-minutes and calls them visitors.
--
-- So `rollUpPresence` computes an hour's count from the raw minutes inside that
-- hour, and a day's count from the raw minutes inside that day — both with
-- `count(DISTINCT caller_hash)`, both exact — and only then deletes the raw
-- rows. Which is why raw rows are kept for a little over a day rather than a
-- couple of hours: the day bucket needs them.
CREATE TABLE presence_rollup (
  span         text NOT NULL,
  bucket_start timestamptz NOT NULL,
  visitors     integer NOT NULL,

  PRIMARY KEY (span, bucket_start),
  CONSTRAINT presence_rollup_span_known CHECK (span IN ('hour', 'day')),
  CONSTRAINT presence_rollup_visitors_not_negative CHECK (visitors >= 0),
  -- A bucket starts on its own boundary or it is not that bucket. Cheap, and
  -- it is what stops a roll-up written against the wrong `date_trunc` from
  -- quietly producing hours that begin at seventeen minutes past.
  CONSTRAINT presence_rollup_starts_on_boundary CHECK (
    bucket_start = date_trunc(span, bucket_start)
  )
);
