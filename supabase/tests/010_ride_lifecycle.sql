-- 20260831120000_enable_ride_lifecycle.sql: started_at is required exactly while
-- status = 'in_progress' (never at completion — a ride may still complete straight from
-- 'accepted'), and duration_seconds is derived by trigger on completion when both timestamps
-- exist. Rationale: docs/decisions/0014-app-calls-complete-ride.md
--
-- What this file cannot prove is the network call to complete-ride itself — that's an Edge
-- Function invocation with no local equivalent to test against. What it proves is everything the
-- database is responsible for once that call lands: the constraint, the conditional UPDATE that
-- drives accepted -> in_progress, and that apply_ride_commission (already tested in
-- 005_apply_ride_commission.sql for the 'accepted' case) accepts 'in_progress' identically.
begin;
select plan(8);

insert into auth.users (id) values
  ('a9000000-0000-0000-0000-000000000001'), -- Driver
  ('a9000000-0000-0000-0000-000000000002'), -- rider A
  ('a9000000-0000-0000-0000-000000000003'), -- rider B — stays 'requested' (unassigned) throughout
  ('a9000000-0000-0000-0000-000000000004'); -- rider C — books ride_c; rider B is still live, so
                                              -- ride_c needs its own rider or it would trip
                                              -- rides_one_active_per_rider instead of what's under test

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('a9000000-0000-0000-0000-000000000001', 'Driver A9', 'active', 'passed', 'passed');

create temporary table t_ids (label text primary key, id uuid) on commit drop;

insert into t_ids
select 'driver', id from drivers where auth_user_id = 'a9000000-0000-0000-0000-000000000001';

with a as (
  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('a9000000-0000-0000-0000-000000000002',
          (select id from t_ids where label = 'driver'), 'accepted', 1000)
  returning id
)
insert into t_ids (label, id) select 'ride_a', id from a;

-- Unassigned for now — assigning it to the SAME driver while ride_a is still live is what test 4
-- proves rides_one_active_per_driver still refuses, whatever ride_a's exact status.
with b as (
  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('a9000000-0000-0000-0000-000000000003', null, 'requested', 500)
  returning id
)
insert into t_ids (label, id) select 'ride_b', id from b;

-- ------------------------------------------------------------ rides_started_at_present_iff_in_progress

-- An in-place UPDATE of ride_a's own row, not a new insert — deliberately, so this can't also
-- trip rides_one_active_per_driver (a same-row status change never adds a second row to the set
-- that index covers). Isolates exactly the constraint under test.
select throws_ok(
  $$ update rides set status = 'in_progress'
     where id = (select id from t_ids where label = 'ride_a') $$,
  '23514',
  null,
  'moving to in_progress without started_at is rejected'
);

-- --------------------------------------------------------------- the start-trip conditional UPDATE
--
-- Same shape as 009's accept assertions: a data-modifying WITH must be the top-level statement,
-- so each attempt lands its affected-row count in a temp table for is() to read back.

create temporary table t_result (n int) on commit drop;

with started as (
  update rides
  set status = 'in_progress', started_at = now()
  where id = (select id from t_ids where label = 'ride_a')
    and status = 'accepted'
    and driver_id = (select id from t_ids where label = 'driver')
  returning id
)
insert into t_result select count(*) from started;

select is(
  (select n from t_result),
  1,
  'the start-trip update matches ride_a and moves it to in_progress'
);

delete from t_result;

with started as (
  update rides
  set status = 'in_progress', started_at = now()
  where id = (select id from t_ids where label = 'ride_a')
    and status = 'accepted'
    and driver_id = (select id from t_ids where label = 'driver')
  returning id
)
insert into t_result select count(*) from started;

select is(
  (select n from t_result),
  0,
  'replaying the start-trip update affects zero rows — ride_a is no longer accepted'
);

-- ------------------------------------------------------- rides_one_active_per_driver, still in_progress

select throws_ok(
  $$ update rides
     set driver_id = (select id from t_ids where label = 'driver'),
         status = 'accepted', accepted_at = now()
     where id = (select id from t_ids where label = 'ride_b')
       and status = 'requested' and driver_id is null $$,
  '23505',
  null,
  'the driver cannot accept a second ride while the first is in_progress, not just accepted'
);

-- --------------------------------------------------------------- completion, and duration_seconds

select is(
  (select outcome from apply_ride_commission(
     (select id from t_ids where label = 'ride_a'), rido_year_month(now()), 0, 2000, 200, 800)),
  'applied',
  'apply_ride_commission accepts an in_progress ride, exactly like an accepted one'
);

select isnt(
  (select duration_seconds from rides where id = (select id from t_ids where label = 'ride_a')),
  null,
  'duration_seconds is derived on completion once started_at was set'
);

-- A second ride for the same driver, completed straight from 'accepted' with no started_at at
-- all — legal, ride_a is 'completed' now so it no longer occupies the one-active-ride slot.
with c as (
  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('a9000000-0000-0000-0000-000000000004',
          (select id from t_ids where label = 'driver'), 'accepted', 300)
  returning id
)
insert into t_ids (label, id) select 'ride_c', id from c;

select is(
  (select outcome from apply_ride_commission(
     (select id from t_ids where label = 'ride_c'), rido_year_month(now()), 1000, 1200, 36, 264)),
  'applied',
  'a ride can still complete straight from accepted, with no started_at at all'
);

select is(
  (select duration_seconds from rides where id = (select id from t_ids where label = 'ride_c')),
  null,
  'duration_seconds stays null when the ride never had a started_at — never invented'
);

select * from finish();
rollback;
