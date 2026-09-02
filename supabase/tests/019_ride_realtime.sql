-- 20260902140000_enable_ride_realtime.sql: `rides` is in the realtime publication, and nothing else
-- was swept in with it.
-- Rationale: docs/decisions/0020-realtime-ride-status.md
--
-- WHY A TEST FOR ONE LINE OF DDL. Because publication membership is the single silent failure in
-- this feature. Every other way realtime can break is loud — a bad channel name throws, a missing
-- env var throws, an RLS refusal is visible in the network tab. A table that is not in the
-- publication produces a channel that joins successfully and then sits there forever receiving
-- nothing: no error, no warning, no log line, nothing to grep for. This file is the difference
-- between finding that out here and finding it out from a rider staring at "Looking for a driver"
-- while their driver is parked outside.
--
-- These are catalog assertions, not policy assertions, so there is no `set local role` here and no
-- fixture data. pgTAP has `tables_are` and friends for this shape; none of them cover publications,
-- so these read `pg_publication_tables` directly.
begin;
select plan(4);

-- ------------------------------------------------------------- the publication exists at all

select is(
  (select count(*) from pg_publication where pubname = 'supabase_realtime')::int,
  1,
  'the supabase_realtime publication exists — created by the platform on a hosted project, by the migration''s DO block on a bare Postgres like this one'
);

-- ------------------------------------------------------------- rides is a member

select is(
  (select count(*) from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rides')::int,
  1,
  'rides is in supabase_realtime — without this row the client subscribes to silence, with no error anywhere'
);

-- ------------------------------------- and nothing else is, because membership is opt-in per table

-- The anti-goal. `create publication ... for all tables` would satisfy the assertion above and
-- stream driver_payouts, ride_charges and rider_payment_profiles to anyone who could read them —
-- a far wider blast radius than this feature asked for, arrived at by a one-word difference in the
-- migration. Asserting the exact set is what makes that difference visible.
-- `schemaname`/`tablename` are `name`, whose collation is "C". Compared against a plain text literal
-- that carries the database default, the comparison has no determinate collation and errors out
-- rather than failing an assertion — so both halves are pinned to "default" explicitly. Aggregated
-- into one string rather than compared with results_eq for the same reason: one value, one
-- collation, one thing that can go wrong.
select is(
  (select string_agg(
            (schemaname::text collate "default") || '.' || (tablename::text collate "default"),
            ', ' order by 1)
     from pg_publication_tables where pubname = 'supabase_realtime'),
  'public.rides',
  'rides is the ONLY table published — realtime membership is opt-in per table, never "for all tables"'
);

-- --------------------------------------------------- REPLICA IDENTITY is DEFAULT, not FULL

-- Nothing in this feature reads the OLD tuple: an event is a bare "this ride moved" notification
-- and the client refetches through the normal server read (ADR-0020). FULL would roughly double WAL
-- volume on a table that keeps every ride forever, to carry data the design has decided not to look
-- at — so if someone sets it, it should be because they changed the design, and this fails first.
select is(
  (select relreplident from pg_class where oid = 'public.rides'::regclass),
  'd'::"char",
  'rides keeps REPLICA IDENTITY DEFAULT — the OLD tuple is never read, so FULL would be WAL volume bought for nothing'
);

select * from finish();
rollback;
