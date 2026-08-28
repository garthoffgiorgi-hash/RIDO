-- The two address columns ADR-0011 added: the length constraint bites, null is legitimate, and
-- the existing rides RLS policies cover them without a new policy.
--
-- The point of the last assertion is easy to miss: a column added to a table with RLS inherits
-- that table's policies. This proves it rather than assuming it — a rider must not be able to
-- read the address of someone else's ride, and nothing about adding a column should change that.
begin;
select plan(7);

insert into auth.users (id) values
  ('a7000000-0000-0000-0000-000000000001'),
  ('b7000000-0000-0000-0000-000000000001'),
  ('b7000000-0000-0000-0000-000000000002');

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('a7000000-0000-0000-0000-000000000001', 'Driver A', 'active', 'passed', 'passed');

-- ------------------------------------------------------------------- the length constraint

select lives_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents, pickup_address, dropoff_address)
     select 'b7000000-0000-0000-0000-000000000001', id, 'requested', 1240,
            '9500 Gilman Dr, La Jolla, CA 92093', '1600 Pacific Hwy, San Diego, CA 92101'
     from drivers where auth_user_id = 'a7000000-0000-0000-0000-000000000001' $$,
  'a ride with both addresses is accepted'
);

select lives_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents)
     select 'b7000000-0000-0000-0000-000000000002', id, 'requested', 800
     from drivers where auth_user_id = 'a7000000-0000-0000-0000-000000000001' $$,
  'both addresses may be null — a dropped pin has no address, and pre-existing rows have none'
);

select throws_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents, pickup_address)
     select 'b7000000-0000-0000-0000-000000000001', id, 'requested', 800, ''
     from drivers where auth_user_id = 'a7000000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'an empty-string address is rejected — null means "none", empty means a bug upstream'
);

select throws_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents, dropoff_address)
     select 'b7000000-0000-0000-0000-000000000001', id, 'requested', 800, repeat('x', 501)
     from drivers where auth_user_id = 'a7000000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'an address over 500 characters is rejected'
);

-- --------------------------------------------------- coordinates stay null through the pilot

select is(
  (select count(*) from rides where pickup_lat is not null or pickup_lng is not null)::int, 0,
  'nothing writes coordinates — the pilot stores addresses and defers the geocode (ADR-0011)'
);

-- ------------------------------------------------------------------- RLS covers the new columns

set local role authenticated;
set local request.jwt.claim.sub = 'b7000000-0000-0000-0000-000000000001';

select is(
  (select pickup_address from rides where rider_id = 'b7000000-0000-0000-0000-000000000001'),
  '9500 Gilman Dr, La Jolla, CA 92093',
  'a rider reads the address on their own ride'
);

select is(
  (select count(*) from rides where rider_id = 'b7000000-0000-0000-0000-000000000002')::int, 0,
  'a rider cannot reach another rider''s ride, addresses included — the new columns inherit RLS'
);

reset role;
select * from finish();
rollback;
