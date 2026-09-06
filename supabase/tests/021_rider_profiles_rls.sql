-- 20260904120000_create_rider_profiles.sql and 20260904120100_create_driver_public_profiles.sql,
-- the first cross-party RLS in the schema: a driver reads their current rider's name, a rider
-- reads their current driver's name and vehicle, and both stop the moment the ride they share
-- stops being live. Rationale: docs/decisions/0022-rider-identity-and-ratings.md.
--
-- The property under test is genuinely two-sided — visibility must be granted during the ride AND
-- withdrawn once it ends — so every denial below is paired with a positive control on an unrelated,
-- still-live pair, the way 009_driver_accept.sql pairs "driver H can't see the taken ride" with
-- "driver H still sees the untaken one." Without the pair, a blanket denial (the RLS equivalent of
-- the table not existing) would pass the same assertions.
begin;
select plan(12);

insert into auth.users (id) values
  ('b1000000-0000-0000-0000-000000000001'), -- Rider R1: rides with D1
  ('b1000000-0000-0000-0000-000000000002'), -- Rider R2: rides with D2, the isolation control
  ('b1000000-0000-0000-0000-000000000003'), -- Driver D1
  ('b1000000-0000-0000-0000-000000000004'); -- Driver D2

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status, vehicle_make, vehicle_model, vehicle_year, vehicle_plate)
values
  ('b1000000-0000-0000-0000-000000000003', 'Driver D1', 'active', 'passed', 'passed', 'Honda', 'Civic', 2019, '8ABC123'),
  ('b1000000-0000-0000-0000-000000000004', 'Driver D2', 'active', 'passed', 'passed', 'Toyota', 'Prius', 2021, '9XYZ789');

insert into rider_profiles (rider_id, display_name) values
  ('b1000000-0000-0000-0000-000000000001', 'Rider R1'),
  ('b1000000-0000-0000-0000-000000000002', 'Rider R2');

create temporary table t_ids (label text primary key, id uuid) on commit drop;
insert into t_ids select 'driver_d1', id from drivers where auth_user_id = 'b1000000-0000-0000-0000-000000000003';
insert into t_ids select 'driver_d2', id from drivers where auth_user_id = 'b1000000-0000-0000-0000-000000000004';

-- Two live rides, each accepted. ride_r1 is the one that will complete partway through this file;
-- ride_r2 stays live throughout and is what proves each denial isn't a blanket one.
with r as (
  insert into rides (rider_id, driver_id, status, fare_cents, accepted_at)
  values ('b1000000-0000-0000-0000-000000000001',
          (select id from t_ids where label = 'driver_d1'), 'accepted', 1000, now())
  returning id
)
insert into t_ids (label, id) select 'ride_r1', id from r;

with r as (
  insert into rides (rider_id, driver_id, status, fare_cents, accepted_at)
  values ('b1000000-0000-0000-0000-000000000002',
          (select id from t_ids where label = 'driver_d2'), 'accepted', 1500, now())
  returning id
)
insert into t_ids (label, id) select 'ride_r2', id from r;

grant select on t_ids to authenticated;

-- ------------------------------------------------------------------ rider_profiles: own-row shape

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';

select is(
  (select display_name from rider_profiles where rider_id = (select auth.uid())),
  'Rider R1',
  'a rider reads their own display name'
);

select lives_ok(
  $$ update rider_profiles set display_name = 'Rider R1, renamed'
     where rider_id = 'b1000000-0000-0000-0000-000000000001'::uuid $$,
  'a rider renames themselves through the column grant'
);

select throws_ok(
  $$ update rider_profiles set rating_count = 999
     where rider_id = 'b1000000-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  null,
  'a rider cannot write their own rating_count — the column grant is display_name/phone/avatar_url only, not the aggregate'
);

reset role;

-- --------------------------------------------------- cross-party read, while the ride is live

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000003'; -- Driver D1

select is(
  (select display_name from rider_profiles where rider_id = 'b1000000-0000-0000-0000-000000000001'),
  'Rider R1, renamed',
  'D1 reads R1''s (renamed) display name while their ride together is accepted'
);

select is(
  (select count(*) from rider_profiles where rider_id = 'b1000000-0000-0000-0000-000000000002')::int,
  0,
  'D1 cannot see R2''s profile at all — R2 is not D1''s rider'
);

reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001'; -- Rider R1

select is(
  (select display_name from driver_public_profiles where driver_id = (select id from t_ids where label = 'driver_d1')),
  'Driver D1',
  'R1 reads D1''s public profile while their ride together is accepted'
);

select is(
  (select vehicle_description from driver_public_profiles where driver_id = (select id from t_ids where label = 'driver_d1')),
  '2019 Honda Civic',
  'the vehicle description was assembled by the sync trigger from drivers'' own columns, not typed into this fixture'
);

select is(
  (select count(*) from driver_public_profiles where driver_id = (select id from t_ids where label = 'driver_d2'))::int,
  0,
  'R1 cannot see D2''s public profile at all — D2 is not R1''s driver'
);

reset role;

-- No write grant to authenticated exists on driver_public_profiles at all — it has exactly one
-- writer, the SECURITY DEFINER sync trigger. Proven here rather than only claimed in a comment.
-- Must run as `authenticated`, not the reset table-owner role: a privilege check is what's under
-- test, and the table owner has full access regardless of any grant.
set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000003'; -- Driver D1, own row

select throws_ok(
  $$ update driver_public_profiles set display_name = 'Hijacked'
     where driver_id = (select id from drivers where auth_user_id = 'b1000000-0000-0000-0000-000000000003') $$,
  '42501',
  null,
  'a driver cannot rewrite their own public profile directly — it is a projection, not editable'
);

reset role;

-- ---------------------------------------------------------------- visibility ends at completion

update rides set
  status = 'completed', completed_at = now(),
  commission_rate_bps = 2000, commission_cents = 200, driver_payout_cents = 800
where id = (select id from t_ids where label = 'ride_r1');

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000003'; -- Driver D1

select is(
  (select count(*) from rider_profiles where rider_id = 'b1000000-0000-0000-0000-000000000001')::int,
  0,
  'once ride_r1 completes, D1 can no longer see R1''s profile at all'
);

reset role;

-- The control. Without it, the assertion above would also pass if the policy denied everyone
-- everything — proving nothing about completion specifically.
set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000004'; -- Driver D2

select is(
  (select count(*) from rider_profiles where rider_id = 'b1000000-0000-0000-0000-000000000002')::int,
  1,
  'and D2 still sees R2 — ride_r2 never completed, so that visibility is unaffected'
);

reset role;

-- The mirror direction, proven once rather than duplicated in full: the rider side of the same
-- policy pair withdraws on the same transition.
set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001'; -- Rider R1

select is(
  (select count(*) from driver_public_profiles where driver_id = (select id from t_ids where label = 'driver_d1'))::int,
  0,
  'and R1 symmetrically loses D1''s public profile the moment their shared ride completes'
);

reset role;

select * from finish();
rollback;
