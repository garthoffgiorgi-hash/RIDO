-- Required assertion #3 (supabase/CLAUDE.md): a non-service-role write to a commission column
-- is rejected. Targets commission_cents specifically, not "any write" — right now every write
-- to rides is blocked for authenticated (no policy/grant exists at all yet), but this test is
-- written to keep meaning the moment a future migration adds a narrower rides write policy for
-- the booking flow. That future policy must still exclude the commission columns.
begin;
select plan(2);

insert into auth.users (id) values ('c0000000-0000-0000-0000-000000000001');
insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('c0000000-0000-0000-0000-000000000001', 'Driver C', 'active', 'passed', 'passed');

insert into rides (rider_id, driver_id, status, fare_cents)
select 'c0000000-0000-0000-0000-000000000001',
       (select id from drivers where auth_user_id = 'c0000000-0000-0000-0000-000000000001'),
       'requested', 1000;

set local role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ update rides set commission_cents = 1
     where driver_id = (select id from drivers where auth_user_id = 'c0000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'an authenticated driver cannot write commission_cents on their own ride'
);

reset role;
set local role service_role;

select lives_ok(
  $$ update rides
     set status = 'completed', completed_at = now(),
         commission_rate_bps = 2000, commission_cents = 200, driver_payout_cents = 800
     where fare_cents = 1000 and status = 'requested' $$,
  'service_role can write the commission snapshot'
);

reset role;
select * from finish();
rollback;
