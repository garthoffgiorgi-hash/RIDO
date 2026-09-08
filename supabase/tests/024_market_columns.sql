-- The market column on rides and drivers: defaults for a writer that doesn't care, not-null holds
-- against an explicit null, nothing restricts the value to 'san-diego' alone, and — the same point
-- 007_ride_addresses.sql proves for its own two columns — RLS still covers the table with a new
-- column on it, rather than assumed.

begin;
select plan(8);

insert into auth.users (id) values
  ('f2000000-0000-0000-0000-000000000001'),  -- Driver A
  ('f2000000-0000-0000-0000-000000000002'),  -- Rider A
  ('f2000000-0000-0000-0000-000000000003');  -- Rider B

-- ---- The default covers a writer that never mentions market ------------------------------------

select lives_ok(
  $$ insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
     values ('f2000000-0000-0000-0000-000000000001', 'Driver A', 'active', 'passed', 'passed') $$,
  'a driver row with no market column mentioned is accepted'
);

select is(
  (select market from drivers where auth_user_id = 'f2000000-0000-0000-0000-000000000001'),
  'san-diego',
  'and it lands on the default — the one market this project has ever had'
);

select lives_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents)
     select 'f2000000-0000-0000-0000-000000000002', id, 'requested', 1240
     from drivers where auth_user_id = 'f2000000-0000-0000-0000-000000000001' $$,
  'a ride row with no market column mentioned is accepted'
);

select is(
  (select market from rides where rider_id = 'f2000000-0000-0000-0000-000000000002'),
  'san-diego',
  'and it defaults the same way'
);

-- ---- Not null still holds against an explicit null, default or not -----------------------------

select throws_ok(
  $$ insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status, market)
     values ('f2000000-0000-0000-0000-000000000099', 'Driver Null', 'active', 'passed', 'passed', null) $$,
  '23502',
  null,
  'a driver cannot be inserted with an explicit null market — a default is not the same as nullable'
);

-- ---- Nothing restricts the value to 'san-diego' alone -------------------------------------------

select lives_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents, market)
     select 'f2000000-0000-0000-0000-000000000003', id, 'requested', 900, 'los-angeles'
     from drivers where auth_user_id = 'f2000000-0000-0000-0000-000000000001' $$,
  'a ride can name a market other than san-diego — expansion is a row value, never a migration'
);

-- ---- RLS still covers the table, regardless of what market a row carries -----------------------

set local role authenticated;
set local request.jwt.claim.sub = 'f2000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from rides
     where rider_id = 'f2000000-0000-0000-0000-000000000002' and market = 'san-diego')::int,
  1,
  'a rider reads their own ride regardless of market — the new column adds nothing to check'
);

select is(
  (select count(*) from rides where rider_id = 'f2000000-0000-0000-0000-000000000003')::int,
  0,
  'and still cannot reach another rider''s, los-angeles market or not — RLS did not gain a hole'
);

reset role;
select * from finish();
rollback;
