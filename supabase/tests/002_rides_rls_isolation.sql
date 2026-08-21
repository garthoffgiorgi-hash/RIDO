-- Required assertion #2 (supabase/CLAUDE.md): a driver cannot read another driver's rides.
-- Also covers riders, and confirms there is no authenticated INSERT path at all yet (§6 of the
-- migration plan — the booking flow doesn't exist, so no write policy exists for rides).
begin;
select plan(4);

insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002');

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values
  ('a0000000-0000-0000-0000-000000000001', 'Driver A', 'active', 'passed', 'passed'),
  ('a0000000-0000-0000-0000-000000000002', 'Driver B', 'active', 'passed', 'passed');

insert into rides (rider_id, driver_id, status, fare_cents)
select 'b0000000-0000-0000-0000-000000000001', id, 'requested', 1000
from drivers where auth_user_id = 'a0000000-0000-0000-0000-000000000001';

insert into rides (rider_id, driver_id, status, fare_cents)
select 'b0000000-0000-0000-0000-000000000002', id, 'requested', 2000
from drivers where auth_user_id = 'a0000000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from rides)::int, 1,
  'driver A sees exactly their own ride, not driver B''s'
);

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from rides)::int, 1,
  'driver B sees exactly their own ride, not driver A''s'
);

set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from rides)::int, 1,
  'rider B1 sees exactly the ride they booked, not rider B2''s'
);

select throws_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents)
     values ('b0000000-0000-0000-0000-000000000001',
             (select id from drivers where auth_user_id = 'a0000000-0000-0000-0000-000000000001'),
             'requested', 500) $$,
  '42501',
  null,
  'an authenticated user cannot insert a ride — no write policy exists for rides yet'
);

reset role;
select * from finish();
rollback;
