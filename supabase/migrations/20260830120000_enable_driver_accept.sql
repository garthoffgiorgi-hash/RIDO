-- Driver accept — the shape and access a driver needs to take a requested ride.
--
-- `rides_select_own_as_driver` reads `driver_id in (select id from drivers where auth_user_id =
-- auth.uid())`. With `driver_id` now nullable (20260829120000), that expression evaluates to NULL
-- for every unassigned ride — SQL's three-valued logic, not a bug in the policy — and RLS treats
-- anything that isn't TRUE as a refusal. So a driver could not see a single open request. Nothing
-- caught this because every existing rides fixture binds a driver at insert. Rationale for
-- everything below: docs/decisions/0013-driver-accepts-one-row-one-update.md

-- A driver may see work that is available to take — but only an active one. Reading who's
-- requesting a ride isn't money (ADR-0010's don't-trust-the-client reasoning is about who WRITES
-- a fare, not who reads a list), so this is a plain RLS policy rather than a service-role read.
-- PERMISSIVE, so it ORs with rides_select_own_as_rider and rides_select_own_as_driver rather than
-- narrowing either — an active driver sees their own rides AND the open pool.
create policy rides_select_open_requests_as_active_driver
  on rides for select
  to authenticated
  using (
    driver_id is null
    and status = 'requested'
    and exists (
      select 1 from drivers
      where auth_user_id = (select auth.uid()) and status = 'active'
    )
  );

-- Serves that policy's own query. No column indexed `status` before this — nothing needed one,
-- since every prior read was scoped by driver_id or rider_id. Partial, matching the idiom the
-- geog and completed_at indexes next door already use.
create index rides_open_requests_idx on rides (requested_at)
  where status = 'requested' and driver_id is null;

-- The driver-side mirror of rides_one_active_per_rider. Nothing stopped one driver holding two
-- simultaneously 'accepted' rides — this closes that the same way, at the database, rather than
-- an app check that races. driver_id cannot be null in these two statuses
-- (rides_driver_present_unless_pending guarantees it), so this index is total over every row it
-- covers, not partial-on-a-nullable-key.
create unique index rides_one_active_per_driver on rides (driver_id)
  where status in ('accepted', 'in_progress');

comment on policy rides_select_open_requests_as_active_driver on rides is
  'PERMISSIVE — ORs with rides_select_own_as_rider and rides_select_own_as_driver rather than '
  'narrowing them. Lets any active driver see every unassigned requested ride; there is no '
  'proximity filter because pickup_geog is null on every row (ADR-0011 defers coordinates). '
  'See docs/decisions/0013-driver-accepts-one-row-one-update.md.';
