-- What holding pixels costs a caller, and the one fact `blocks` cannot keep.
--
-- THE HOLE THIS CLOSES. A hold is free, and until now the only ceiling on one
-- was a count of rectangles: `liveHoldsPerCaller: 3`, with no cap on the area
-- of any of them. One caller could therefore hold a 1250x800 rectangle — the
-- whole wall, a million dollars of inventory at list — indefinitely, renewing
-- it twice an hour, for nothing. Capping the AREA per caller is the first half
-- of the answer and needs no schema at all. This table is the second half:
-- bounding how LONG a caller may keep pixels off the board.
--
-- WHY IT CANNOT LIVE IN `blocks`. The sweep DELETEs an expired reservation
-- (`sweepExpiredReservations`), and it has to: an expired row still sits inside
-- the exclusion constraint's predicate, so leaving it behind would block its
-- rectangle forever. But a charge that vanishes when the row does is a charge
-- an attacker clears by waiting — re-take the same rectangle every half hour
-- and the meter reads zero every time. The ledger therefore outlives the hold
-- it charges for, which is exactly why it is a different table.
--
-- DELIBERATELY NO FOREIGN KEY to blocks(id). A cascade, or even a restrict,
-- would undo the paragraph above the first time the sweep ran. `block_id` names
-- the hold this row charges for so a payment or a release can settle it; it is
-- not a claim that the block still exists, and usually it does not.
--
-- THE UNIT IS THE PIXEL-MINUTE. Area, duration and renewal collapse into one
-- number: a row's charge is `pixels` times the minutes from `started_at` to
-- `charged_until`, and a caller's spend is the part of that which falls inside
-- a rolling window. One knob instead of three, and it cannot be gamed by
-- splitting a big hold into small ones or a long one into repeats.
--
-- THE TWO WAYS A CHARGE STOPS EARLY, both of which move `charged_until` back
-- rather than deleting the row:
--   * a hold GIVEN BACK stops costing at the moment it was given back, so a
--     buyer who changes their mind pays for the minutes they actually used;
--   * a hold that BECAME A SALE costs nothing at all — `charged_until` is set
--     to `started_at`. Somebody who pays for a rectangle was never griefing
--     with it, and the budget must not be what stops them buying again.
CREATE TABLE hold_meter (
  block_id       uuid PRIMARY KEY,
  ip_hash        text NOT NULL,
  pixels         integer NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  charged_until  timestamptz NOT NULL,

  CONSTRAINT hold_meter_pixels_positive CHECK (pixels > 0),
  -- A charge is never negative. Both settlement paths above clamp rather than
  -- subtract, and this is what makes that a database rule instead of a habit:
  -- a statement that would hand a caller back more than they spent is refused.
  CONSTRAINT hold_meter_charge_not_negative CHECK (charged_until >= started_at)
);

-- The one read this table exists for: one caller's rows still inside the
-- rolling window. `charged_until` leads because that is what the window is
-- tested against.
CREATE INDEX hold_meter_caller_window ON hold_meter (ip_hash, charged_until);
