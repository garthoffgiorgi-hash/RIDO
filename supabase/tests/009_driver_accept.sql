-- 20260830120000_enable_driver_accept.sql: an active driver can see the open pool and nothing
-- else new, an inactive one sees nothing, and the conditional UPDATE the accept write actually
-- runs is what decides a race — not a lock, not a retry loop. docs/decisions/0013-*.md.
--
-- What this file cannot prove is the race itself: pg_prove runs one connection at a time, so two
-- drivers really accepting the same ride simultaneously is supabase/tests/concurrent-accept-ride.sh,
-- run separately. Same division 004/005 already use for their own concurrency claims.
--
-- 002_rides_rls_isolation.sql is re-run unmodified alongside this file to prove the new
-- PERMISSIVE policy widened access exactly as far as intended: every ride in that fixture already
-- has a driver assigned, so rides_select_open_requests_as_active_driver (driver_id IS NULL) grants
-- it nothing extra.
begin;
select plan(11);

insert into auth.users (id) values
  ('f0000000-0000-0000-0000-000000000001'), -- Driver F: active, does the accepting
  ('f0000000-0000-0000-0000-000000000002'), -- Driver G: pending, never went active
  ('f0000000-0000-0000-0000-000000000003'), -- Driver H: active, already holds an assigned ride
  ('f0000000-0000-0000-0000-000000000004'), -- rider 1
  ('f0000000-0000-0000-0000-000000000005'), -- rider 2
  ('f0000000-0000-0000-0000-000000000006'); -- rider 3, books driver H's ride

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values
  ('f0000000-0000-0000-0000-000000000001', 'Driver F', 'active', 'passed', 'passed'),
  ('f0000000-0000-0000-0000-000000000002', 'Driver G', 'pending', 'pending', 'pending'),
  ('f0000000-0000-0000-0000-000000000003', 'Driver H', 'active', 'passed', 'passed');

create temporary table t_ids (label text primary key, id uuid) on commit drop;

insert into t_ids
select 'driver_f', id from drivers where auth_user_id = 'f0000000-0000-0000-0000-000000000001';
insert into t_ids
select 'driver_h', id from drivers where auth_user_id = 'f0000000-0000-0000-0000-000000000003';

-- Two open requests nobody has accepted yet.
with r as (
  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('f0000000-0000-0000-0000-000000000004', null, 'requested', 1000)
  returning id
)
insert into t_ids (label, id) select 'ride_open_1', id from r;

with r as (
  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('f0000000-0000-0000-0000-000000000005', null, 'requested', 2000)
  returning id
)
insert into t_ids (label, id) select 'ride_open_2', id from r;

-- Already assigned to driver H — the open-requests policy must not leak this to anyone else.
with r as (
  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('f0000000-0000-0000-0000-000000000006',
          (select id from t_ids where label = 'driver_h'), 'accepted', 1500)
  returning id
)
insert into t_ids (label, id) select 'ride_h_assigned', id from r;

-- Scaffolding only: the RLS assertions below run as `authenticated` and look up ids from this
-- temp table inside their subqueries, so that role needs read access to it. Nothing under test
-- depends on this grant — it's how the fixture ids reach the switched-role queries at all.
grant select on t_ids to authenticated;

-- --------------------------------------------------------------------- RLS: who sees the pool

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from rides
     where status = 'requested' and driver_id is null)::int,
  2,
  'an active driver sees both open requests'
);

select is(
  (select count(*) from rides where id = (select id from t_ids where label = 'ride_h_assigned'))::int,
  0,
  'an active driver still cannot see a ride already assigned to another driver'
);

set local request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from rides
     where status = 'requested' and driver_id is null)::int,
  0,
  'a pending (non-active) driver sees no open requests at all'
);

set local request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000003';

select is(
  (select count(*) from rides where id = (select id from t_ids where label = 'ride_h_assigned'))::int,
  1,
  'driver H still sees their own already-accepted ride — the existing own-rides policy is unaffected'
);

reset role;

-- ------------------------------------------------------------- the conditional UPDATE itself
--
-- Run as the connection's own privileges, same as 004/005's write-path assertions: the app never
-- issues this UPDATE as `authenticated` (no grant exists — accept goes through the service role),
-- so what's under test here is the WHERE clause's atomicity, not RLS.
--
-- A data-modifying WITH has to be the top-level statement — Postgres refuses one nested inside a
-- function argument — so each attempt runs as its own statement, landing its affected-row count
-- in a temp table for is() to read back, rather than being inlined into the assertion itself.

create temporary table t_result (n int) on commit drop;

with accepted as (
  update rides
  set driver_id = (select id from t_ids where label = 'driver_f'),
      status = 'accepted',
      accepted_at = now()
  where id = (select id from t_ids where label = 'ride_open_1')
    and status = 'requested'
    and driver_id is null
  returning id
)
insert into t_result select count(*) from accepted;

select is(
  (select n from t_result),
  1,
  'the first accept matches the ride and updates exactly one row'
);

select results_eq(
  $$ select status, driver_id, accepted_at is not null
     from rides where id = (select id from t_ids where label = 'ride_open_1') $$,
  $$ select 'accepted'::text, id, true from t_ids where label = 'driver_f' $$,
  'the accepted ride carries the driver, the status, and a timestamp — all from the one UPDATE'
);

delete from t_result;

with accepted as (
  update rides
  set driver_id = (select id from t_ids where label = 'driver_f'),
      status = 'accepted',
      accepted_at = now()
  where id = (select id from t_ids where label = 'ride_open_1')
    and status = 'requested'
    and driver_id is null
  returning id
)
insert into t_result select count(*) from accepted;

select is(
  (select n from t_result),
  0,
  'replaying the identical accept affects zero rows — it is no longer requested/unassigned'
);

-- ---------------------------------------------------------- rides_one_active_per_driver bites

select throws_ok(
  $$ update rides
     set driver_id = (select id from t_ids where label = 'driver_f'),
         status = 'accepted',
         accepted_at = now()
     where id = (select id from t_ids where label = 'ride_open_2')
       and status = 'requested'
       and driver_id is null $$,
  '23505',
  null,
  'the same driver cannot hold a second accepted ride at once'
);

-- ------------------------------------------ a taken ride leaves EVERY other driver's visibility
--
-- This is the property the open-pool realtime board rests on (ADR-0021), and it is why that board
-- can be told about arrivals but never about removals. Supabase Realtime authorises each
-- postgres_changes event by checking whether the subscriber can still SELECT the changed row *as
-- it now stands*. The moment driver F accepts, this row matches none of driver H's policies —
-- not rides_select_own_as_driver (it is F's), not rides_select_open_requests_as_active_driver
-- (driver_id is no longer null) — so there is no subscriber left for the event to reach.
--
-- If a future policy change makes a taken ride visible to the rest of the pool again, this fails,
-- and whoever changed it should read ADR-0021 before deciding that is what they meant.

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000003';

select is(
  (select count(*) from rides where id = (select id from t_ids where label = 'ride_open_1'))::int,
  0,
  'once driver F accepts it, driver H cannot see that ride at all — the removal a realtime board can never be told about'
);

-- The control. Without this, the assertion above would also pass under a blanket denial, and the
-- board would be broken in the *other* direction — no arrivals either.
select is(
  (select count(*) from rides where id = (select id from t_ids where label = 'ride_open_2'))::int,
  1,
  'and driver H still sees the request nobody has taken — arrivals stay visible, which is what makes the subscription work at all'
);

reset role;

-- A rider cancelling before anyone accepts removes it the same way, for the same reason: the row
-- stops being 'requested', so the open-pool policy stops matching it.
update rides set status = 'canceled', canceled_at = now()
where id = (select id from t_ids where label = 'ride_open_2');

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000003';

select is(
  (select count(*) from rides where id = (select id from t_ids where label = 'ride_open_2'))::int,
  0,
  'a rider cancelling an untaken request also drops it out of every driver''s view, undeliverable for the same reason'
);

reset role;

select * from finish();
rollback;
