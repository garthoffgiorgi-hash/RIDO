-- Realtime on rides — a rider's screen and a driver's stop lying between reloads.
--
-- Rationale: docs/decisions/0020-realtime-ride-status.md
--
-- WHAT THIS IS. Publication membership, and it is the entire database half of the feature. Adding a
-- table to `supabase_realtime` is what puts that table's changes on the logical replication slot
-- Supabase's Realtime server reads. Without it the client's channel joins happily and no event ever
-- arrives — no error, no warning, nothing to grep for. That silence is exactly why one line of
-- effective DDL still gets a pgTAP assertion (019_ride_realtime.sql): it is the difference between
-- a working feature and a dead one, and it is completely invisible from the app.
--
-- WHY A DO BLOCK RATHER THAN A BARE ALTER. The publication is created by the Supabase PLATFORM, not
-- by any migration in this repo. So it exists on the hosted project and does *not* exist on a bare
-- Postgres built from `supabase/migrations/` alone — which is precisely how `supabase/tests/` is
-- run. A bare `alter publication supabase_realtime add table rides` is therefore correct against
-- production and fails against the test database, and a migration that cannot be applied to the
-- test database is a migration whose pgTAP file can never run. The block creates the publication
-- only in that second case, and is a no-op on a project that already has it.
--
-- Both halves are guarded, so re-running this is a no-op rather than an error ("relation is already
-- member of publication"). Migrations run once, but the local rebuild-from-scratch loop and
-- `supabase db push` against a partially-applied project both replay it.
--
-- WHY NO RLS CHANGE. Realtime authorizes every event through the table's existing SELECT policies,
-- evaluated with the subscribing client's own JWT — a rider gets events for rows
-- `rides_select_own_as_rider` already lets them read, a driver gets events for rows
-- `rides_select_own_as_driver` (and `rides_select_open_requests_as_active_driver`) already let them
-- read, and an anonymous socket gets nothing. This opens a NEW CHANNEL for data each party could
-- already SELECT. It does not widen what anyone can see by one column.
--
-- BUT KNOW WHAT IT BROADCASTS. postgres_changes sends the whole NEW row. There is no column
-- scoping — you cannot publish `status` and withhold `fare_cents`. That is fine here only because
-- of the paragraph above: every column on the row is already readable by every party who will
-- receive it. It would NOT be fine on a table whose SELECT policy is broader than what you would
-- want streamed, so check that property before adding the next table to this publication.
--
-- REPLICA IDENTITY STAYS DEFAULT. Replica identity governs what the OLD tuple carries on an UPDATE
-- or DELETE — with DEFAULT, only the primary key. Nothing in this feature reads OLD: the client
-- treats an event as a bare "this ride moved" notification and refetches through the normal server
-- read (ADR-0020). Setting FULL would roughly double WAL volume on a table that keeps every ride
-- forever, to carry data the design has already decided not to look at.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rides'
  ) then
    alter publication supabase_realtime add table public.rides;
  end if;
end
$$;
