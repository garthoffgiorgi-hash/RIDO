-- PostGIS, and the spatial-temporal shape a ride needs to be optimizable later.
--
-- Nothing in this migration is used by complete-ride (the next one). It exists because
-- ADR-0008 puts heavy spatial-temporal computation OUTSIDE the completion path — and a future
-- optimizer, wherever it ends up running, can only work with what we recorded at the time.
-- Indexes and columns are cheap to add later; a coordinate we never wrote down is gone forever.
-- That asymmetry is the whole argument for doing this now rather than "when we need it".
--
-- What a plausible consumer needs, and what pays for each addition below:
--   demand heatmaps / surge      -> pickup points, indexed, bucketable by time
--   driver <-> ride matching     -> ST_DWithin on an indexed geography
--   ETA and speed models         -> when the ride actually started, plus distance and duration
--   dead-mile analysis           -> one driver's rides in completion order
--
-- geography, not geometry: distances come back in metres over a spheroid with no projection
-- step, which is what every one of the above actually wants. San Diego is one metro today, but
-- picking geometry would bake a projection choice into the schema for no gain.

create extension if not exists postgis with schema extensions;

-- The existing double precision lat/lng columns stay the source of truth — they're what a
-- mapping SDK hands back, and supabase/CLAUDE.md already carves them out of the no-floats rule.
-- These are GENERATED ... STORED rather than ordinary columns so they cannot drift from that
-- source and no application code has to remember to populate them. (Verified locally: the
-- geometry -> geography cast is IMMUTABLE, which is what makes a generated column legal here.)
-- ST_MakePoint is strict, so a null coordinate yields a null point without a CASE guard.
-- Note the argument order — ST_MakePoint takes (x, y), i.e. (longitude, latitude).
alter table rides
  add column pickup_geog extensions.geography(Point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_makepoint(pickup_lng, pickup_lat), 4326)::extensions.geography
    ) stored,
  add column dropoff_geog extensions.geography(Point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_makepoint(dropoff_lng, dropoff_lat), 4326)::extensions.geography
    ) stored,

  -- rides already records requested_at, accepted_at and completed_at but never when the ride
  -- actually started moving, so ride duration is currently not derivable at all. Set on the
  -- accepted -> in_progress transition once the driver app exists.
  add column started_at timestamptz,

  -- Filled at completion from the mapping provider when there is one. Nullable because Mapbox
  -- isn't wired yet — the point of adding them now is that the column exists on the day it is,
  -- so no window of rides is lost. Straight-line distance is always recoverable from the two
  -- geographies; these are for the ROUTED figures, which are not.
  add column distance_meters integer check (distance_meters >= 0),
  add column duration_seconds integer check (duration_seconds >= 0);

-- Spatial indexes. Partial on non-null because the booking flow doesn't exist yet, so today
-- every row's coordinates are null — and they stay null for any ride canceled before pickup.
create index rides_pickup_geog_idx on rides using gist (pickup_geog)
  where pickup_geog is not null;
create index rides_dropoff_geog_idx on rides using gist (dropoff_geog)
  where dropoff_geog is not null;

-- Temporal indexes, partial on completed rides — completed_at is null for every ride that
-- hasn't finished, and an unfinished ride is not something an optimizer trains on.
--
-- (driver_id, completed_at) serves per-driver ordering: this dropoff -> that pickup, which is
-- how dead miles get measured. completed_at alone serves global time windows: demand by hour,
-- by day of week. The existing rides_driver_id_idx is kept rather than folded into the
-- composite — the composite is partial, so it can't serve a bare driver_id lookup.
create index rides_driver_id_completed_at_idx on rides (driver_id, completed_at)
  where completed_at is not null;
create index rides_completed_at_idx on rides (completed_at)
  where completed_at is not null;
