-- 20260829120000_enable_ride_requests.sql: a ride may exist before a driver accepts it, exactly
-- one may be live per rider, and the commission columns stay null on a fresh request. Every
-- assertion here is the shape a booking flow's INSERT actually produces, not a hypothetical.
--
-- 002_rides_rls_isolation.sql is re-run unmodified alongside this file (both are part of
-- `supabase/tests/*.sql`) to prove the authenticated-insert prohibition it asserts still holds —
-- this migration adds no write policy and no INSERT grant, so that test should not need to change
-- at all. If it starts failing, something here widened access further than intended.
begin;
select plan(9);

insert into auth.users (id) values
  ('c8000000-0000-0000-0000-000000000001'),
  ('c8000000-0000-0000-0000-000000000002');

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('c8000000-0000-0000-0000-000000000001', 'Driver C', 'active', 'passed', 'passed');

-- ------------------------------------------------------- driver_id nullable, but only when pending

select lives_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents)
     values ('c8000000-0000-0000-0000-000000000001', null, 'requested', 1240) $$,
  'a requested ride may exist with no driver assigned yet'
);

select lives_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents)
     values ('c8000000-0000-0000-0000-000000000002', null, 'canceled', 800) $$,
  'a canceled ride may also have no driver — nobody ever accepted it'
);

select throws_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents, commission_rate_bps, commission_cents, driver_payout_cents)
     values ('c8000000-0000-0000-0000-000000000002', null, 'completed', 800, 2000, 160, 640) $$,
  '23514',
  null,
  'a completed ride with no driver is rejected — someone has to have driven it'
);

select throws_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents)
     values ('c8000000-0000-0000-0000-000000000002', null, 'accepted', 800) $$,
  '23514',
  null,
  'an accepted ride with no driver is rejected — accepting IS assigning a driver'
);

select lives_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents)
     select 'c8000000-0000-0000-0000-000000000002', id, 'accepted', 800
     from drivers where auth_user_id = 'c8000000-0000-0000-0000-000000000001' $$,
  'an accepted ride WITH a driver is unaffected by any of the above'
);

-- ---------------------------------------------------------------- commission stays null on request

select is(
  (select commission_cents from rides
     where rider_id = 'c8000000-0000-0000-0000-000000000001' and status = 'requested'),
  null,
  'a freshly requested ride carries no commission snapshot'
);

-- --------------------------------------------------------------- one active ride per rider, enforced

select throws_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents)
     values ('c8000000-0000-0000-0000-000000000001', null, 'requested', 500) $$,
  '23505',
  null,
  'a rider with a live request cannot start a second one — rides_one_active_per_rider bites'
);

select lives_ok(
  $$ update rides set status = 'canceled', canceled_at = now()
     where rider_id = 'c8000000-0000-0000-0000-000000000001' and status = 'requested' $$,
  'canceling the live request releases the index'
);

select lives_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents)
     values ('c8000000-0000-0000-0000-000000000001', null, 'requested', 1500) $$,
  'the same rider can request again once the prior ride is no longer active'
);

select * from finish();
rollback;
