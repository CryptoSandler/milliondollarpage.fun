-- The wall stops being square, and the pixel becomes the unit.
--
-- 1250 × 800 is exactly 1,000,000 pixels, the same million the strapline has
-- always claimed, in a shape that fits a landscape window without wasting the
-- room a square board left beside it. Every one of those pixels is for sale on
-- its own at $1, so the three CHECKs that encoded the old model all go:
--
--   blocks_on_grid   — there is no 10-pixel grid any more. A rectangle is
--                      exact to the pixel, and x=137 is as legal as x=130.
--   blocks_min_size  — the minimum is 1×1. It was 10×10 because the 2005
--                      original could not show anything in one pixel; we sell
--                      the pixel itself, and a buyer who wants one gets one.
--   blocks_in_bounds — 1000×1000 becomes 1250×800.
--
-- What does NOT change, and is deliberately not touched here: the exclusion
-- constraint. It is already exact at pixel granularity, because int4range is
-- half-open — a block at x=0 with w=1 covers pixel 0 and does not touch pixel
-- 1 — so the same constraint that kept two 10×10 blocks apart keeps two single
-- pixels apart with no edit at all. That is the whole reason 001 chose two
-- int4ranges over a box.

-- The wall is blanked, and this is the honest place to do it rather than a
-- script somebody has to remember to run.
--
-- Every row in this table at the time of writing was invented: seven demo
-- rectangles a development seed put there so the collision overlay had
-- something to collide with, and one paid row from a manual test of the
-- purchase path. Nothing has been sold, because nothing has launched. A
-- permanent public record must not open carrying fictional sales, and one of
-- the seven (800,700 200×300) reaches y=1000, so it is out of bounds on the
-- new wall and the bounds CHECK below could not be added while it existed.
--
-- release_challenges rows go with them through their ON DELETE CASCADE.
DELETE FROM blocks;

ALTER TABLE blocks
  DROP CONSTRAINT blocks_on_grid,
  DROP CONSTRAINT blocks_min_size,
  DROP CONSTRAINT blocks_in_bounds;

ALTER TABLE blocks
  -- Still a floor, just a different one: w=0 makes an empty int4range that
  -- collides with nothing, and w<0 makes int4range raise. Neither is a
  -- rectangle anybody can buy, so neither is allowed to exist as a row.
  ADD CONSTRAINT blocks_min_size CHECK (w >= 1 AND h >= 1),
  ADD CONSTRAINT blocks_in_bounds CHECK (x >= 0 AND y >= 0 AND x + w <= 1250 AND y + h <= 800);
