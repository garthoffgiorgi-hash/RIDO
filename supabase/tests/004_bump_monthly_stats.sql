-- Required assertion #4 (supabase/CLAUDE.md): bump_monthly_stats correctness. This file proves
-- the arithmetic — two sequential completions roll up correctly. It does NOT prove concurrency
-- safety: pg_prove runs one connection at a time, so it structurally cannot exercise two
-- transactions racing each other. That proof is supabase/tests/concurrent-completion.sh, a
-- standalone two-connection script outside the pgTAP suite.
begin;
select plan(5);

insert into auth.users (id) values ('d0000000-0000-0000-0000-000000000001');
insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('d0000000-0000-0000-0000-000000000001', 'Driver D', 'active', 'passed', 'passed');

select is(
  (select count(*)::int from driver_monthly_stats
   where driver_id = (select id from drivers where auth_user_id = 'd0000000-0000-0000-0000-000000000001')),
  0,
  'no rollup row exists before any ride completes'
);

do $$
declare
  v_driver_id uuid;
  v_ride_id uuid;
begin
  select id into v_driver_id from drivers where auth_user_id = 'd0000000-0000-0000-0000-000000000001';

  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('d0000000-0000-0000-0000-000000000001', v_driver_id, 'requested', 1000)
  returning id into v_ride_id;
  perform reserve_driver_month(v_driver_id, now());
  update rides set status = 'completed', completed_at = now(),
    commission_rate_bps = 2000, commission_cents = 200, driver_payout_cents = 800
  where id = v_ride_id;

  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('d0000000-0000-0000-0000-000000000001', v_driver_id, 'requested', 500)
  returning id into v_ride_id;
  perform reserve_driver_month(v_driver_id, now());
  update rides set status = 'completed', completed_at = now(),
    commission_rate_bps = 2000, commission_cents = 100, driver_payout_cents = 400
  where id = v_ride_id;
end $$;

select is(
  (select rides_count from driver_monthly_stats
   where driver_id = (select id from drivers where auth_user_id = 'd0000000-0000-0000-0000-000000000001')),
  2,
  'rides_count accumulates across two completions'
);

select is(
  (select gross_fare_cents from driver_monthly_stats
   where driver_id = (select id from drivers where auth_user_id = 'd0000000-0000-0000-0000-000000000001')),
  1500::bigint,
  'gross_fare_cents sums both rides'' fares'
);

select is(
  (select commission_cents from driver_monthly_stats
   where driver_id = (select id from drivers where auth_user_id = 'd0000000-0000-0000-0000-000000000001')),
  300::bigint,
  'commission_cents sums both rides'' commissions'
);

select is(
  (select payout_cents from driver_monthly_stats
   where driver_id = (select id from drivers where auth_user_id = 'd0000000-0000-0000-0000-000000000001')),
  1200::bigint,
  'payout_cents sums both rides'' payouts'
);

select * from finish();
rollback;
