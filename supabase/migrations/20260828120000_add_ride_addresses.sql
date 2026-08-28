-- rides gains the two address columns, and the routed/actual question gets its answer.
--
-- Rationale, evidence and the grey area: docs/decisions/0011-what-a-completed-ride-records.md
--
-- ── WHY AN ADDRESS AND NOT A COORDINATE ─────────────────────────────────────────────────────
--
-- RIDO searches with Mapbox's Search Box API, because Geocoding v6 carries no POI data and our
-- riders type "Geisel Library", not "9500 Gilman Dr". The catch is that Search Box results may
-- not be stored — permanent storage rights are a Geocoding API feature, and Search Box has no
-- storable tier at any price short of an enterprise contract.
--
-- The storable path exists (apps/web/src/lib/maps/geocode.ts, Geocoding v6 with permanent=true)
-- and is deliberately SWITCHED OFF for the pilot. An address string doesn't change, so the whole
-- back catalogue can be geocoded in one batch whenever the geometry is actually wanted — and that
-- backfill is CHEAPER than paying as we go, because it bills only completed rides where
-- pay-as-you-go bills every booking including cancellations.
--
-- So: pickup_lat/lng and dropoff_lat/lng stay null through the pilot, and these two columns are
-- what a later backfill reads. pickup_geog/dropoff_geog are GENERATED, so they populate themselves
-- the day lat/lng arrive; the GiST indexes are already built and waiting.

alter table rides
  add column pickup_address  text check (length(pickup_address)  between 1 and 500),
  add column dropoff_address text check (length(dropoff_address) between 1 and 500);

comment on column rides.pickup_address is
  'The address line the rider saw when they chose this pickup. Nullable — a dropped pin in a '
  'parking lot has no address, and every row predating this column has none. This is the input to '
  'a future permanent-geocode backfill that fills pickup_lat/lng. See ADR-0011.';

comment on column rides.dropoff_address is
  'The address line the rider saw when they chose this destination. Same nullability and same role '
  'as pickup_address. See ADR-0011.';

-- ── SUPERSEDING THE ROUTED-ESTIMATE COMMENT ─────────────────────────────────────────────────
--
-- 20260825120000_enable_postgis_and_ride_geometry.sql said these were "for the ROUTED figures".
-- ADR-0011 decides otherwise, on two grounds that happen to agree: Mapbox's terms permit caching
-- a Directions result but not storing one without an enterprise plan, AND a completed ride ought
-- to record what happened rather than what was predicted. Those are different numbers — traffic,
-- detours, a rider walking to the next corner — and the difference is exactly the signal a future
-- dispatch optimizer needs.
--
-- The applied migration is not edited (supabase/CLAUDE.md); the comment is replaced here instead.

comment on column rides.distance_meters is
  'The distance ACTUALLY driven, from the driver device''s location trace. NEVER the routed '
  'estimate — storing a Mapbox Directions result requires an enterprise plan, and a prediction is '
  'not a record of what happened. Stays null until the driver app exists. See ADR-0011.';

comment on column rides.duration_seconds is
  'The trip''s actual elapsed time, completed_at - started_at. RIDO''s own clock, so it needs '
  'neither Mapbox nor the driver app and is fillable from the first completed ride. Materialized '
  'rather than computed on read so a more precise GPS-derived figure can replace it later without '
  'changing any query. Note Prop 22''s "engaged time" is a different window '
  '(completed_at - accepted_at). See ADR-0011.';

-- Deliberately NOT a generated column. A GPS-derived duration may later be more accurate than
-- wall-clock, and a generated column would foreclose that.
