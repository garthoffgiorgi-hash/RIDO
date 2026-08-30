-- apply_ride_commission — the compare-and-swap write path (ADR-0008).
--
-- Covers every outcome the function can return, plus the two things it must NOT be able to do:
-- bypass the write-once snapshot trigger, or be callable by anyone but the service role.
--
-- This file used to note that the concurrency claim itself — two simultaneous completions for
-- one driver yielding one 'applied' and one 'conflict' — needed a separate two-connection script,
-- since pg_prove runs a single connection. That script (concurrent-apply-ride-commission.sh) is
-- retired: rides_one_active_per_driver (ADR-0013) makes its own setup illegal, because a driver
-- can hold at most one 'accepted'/'in_progress' ride at a time — two rides for one driver can no
-- longer BE simultaneously completable, through any real code path. reserve_driver_month's lock
-- stays in place regardless: it becomes load-bearing again the moment a future feature relaxes
-- that constraint (e.g. letting a driver queue a second ride). Full account:
-- docs/architecture/ride-completion.md, docs/decisions/0014-app-calls-complete-ride.md.
--
-- The commission figures below are arbitrary consistent values, not RIDO's rates: this function
-- stores what it is given and never computes a rate (root CLAUDE.md invariant 5). The bracketing
-- is packages/pricing's to prove.
begin;
select plan(16);

insert into auth.users (id) values
  ('e0000000-0000-0000-0000-000000000001'),
  -- A second rider for ride_b: rides_one_active_per_rider (20260829120000) permits only one
  -- live ride per rider, and ride_a/ride_b coexist as 'accepted'/'requested' through most of
  -- this file. Which rider books which ride is irrelevant to what's under test here —
  -- apply_ride_commission's outcomes — so giving them separate riders sidesteps the
  -- constraint without changing anything the test actually asserts.
  ('e0000000-0000-0000-0000-000000000002');
insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('e0000000-0000-0000-0000-000000000001', 'Driver E', 'active', 'passed', 'passed');

create temporary table t_ids (label text primary key, id uuid) on commit drop;

insert into t_ids
select 'driver', id from drivers where auth_user_id = 'e0000000-0000-0000-0000-000000000001';

with a as (
  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('e0000000-0000-0000-0000-000000000001',
          (select id from t_ids where label = 'driver'), 'accepted', 1000)
  returning id
)
insert into t_ids (label, id) select 'ride_a', id from a;

with b as (
  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('e0000000-0000-0000-0000-000000000002',
          (select id from t_ids where label = 'driver'), 'requested', 2000)
  returning id
)
insert into t_ids (label, id) select 'ride_b', id from b;

-- ---------------------------------------------------------------- unknown and un-completable

select is(
  (select outcome from apply_ride_commission(
     '00000000-0000-0000-0000-0000000000ff', rido_year_month(now()), 0, 3000, 300, 700)),
  'not_found',
  'a ride id that does not exist returns not_found rather than raising'
);

select is(
  (select outcome from apply_ride_commission(
     (select id from t_ids where label = 'ride_b'), rido_year_month(now()), 0, 3000, 600, 1400)),
  'not_completable',
  'a ride nobody accepted cannot be completed'
);

-- ------------------------------------------------------------------------ the CAS check

select is(
  (select outcome from apply_ride_commission(
     (select id from t_ids where label = 'ride_a'), rido_year_month(now()), 999999, 3000, 300, 700)),
  'conflict',
  'a stale month-to-date figure is refused rather than written'
);

select is(
  (select mtd_gross_cents from apply_ride_commission(
     (select id from t_ids where label = 'ride_a'), rido_year_month(now()), 999999, 3000, 300, 700)),
  0::bigint,
  'a conflict carries the CURRENT month-to-date figure, so the caller can re-rate without another round trip'
);

select is(
  (select outcome from apply_ride_commission(
     (select id from t_ids where label = 'ride_a'), '1999-01', 0, 3000, 300, 700)),
  'conflict',
  'the year_month is part of the compare-and-swap, so a month-boundary crossing conflicts too'
);

select is(
  (select count(*)::int from rides where status = 'completed'),
  0,
  'no conflict wrote anything'
);

-- ------------------------------------------------------------------------------- applied

select is(
  (select outcome from apply_ride_commission(
     (select id from t_ids where label = 'ride_a'), rido_year_month(now()), 0, 3000, 300, 700)),
  'applied',
  'a matching month-to-date figure applies the snapshot'
);

select results_eq(
  $$ select status, commission_rate_bps, commission_cents, driver_payout_cents
     from rides where id = (select id from t_ids where label = 'ride_a') $$,
  $$ values ('completed'::text, 3000, 300::bigint, 700::bigint) $$,
  'status and all three commission columns move together in one statement'
);

select isnt(
  (select completed_at from rides where id = (select id from t_ids where label = 'ride_a')),
  null,
  'completed_at is set by the function, never supplied by the caller'
);

select results_eq(
  $$ select rides_count, gross_fare_cents, commission_cents, payout_cents
     from driver_monthly_stats
     where driver_id = (select id from t_ids where label = 'driver') $$,
  $$ values (1, 1000::bigint, 300::bigint, 700::bigint) $$,
  'the rollup trigger fired inside the same transaction'
);

-- --------------------------------------------------------------------------- idempotency

select is(
  (select outcome from apply_ride_commission(
     (select id from t_ids where label = 'ride_a'), rido_year_month(now()), 0, 9999, 999, 1)),
  'already_completed',
  'replaying a completed ride returns already_completed rather than re-rating it'
);

select is(
  (select commission_cents from rides where id = (select id from t_ids where label = 'ride_a')),
  300::bigint,
  'the replay did not overwrite the snapshot, even when handed different figures'
);

select is(
  (select rides_count from driver_monthly_stats
   where driver_id = (select id from t_ids where label = 'driver')),
  1,
  'the replay did not double-count the ride in the monthly rollup'
);

-- ------------------------------------------------- the next ride sees the bumped position

-- This is the whole point of the design: ride_a moved the driver's month-to-date to 1000, so a
-- caller still holding the figure it read before that must be refused and handed the new one.
update rides set status = 'accepted' where id = (select id from t_ids where label = 'ride_b');

select is(
  (select mtd_gross_cents from apply_ride_commission(
     (select id from t_ids where label = 'ride_b'), rido_year_month(now()), 0, 3000, 600, 1400)),
  1000::bigint,
  'a second ride rated against the stale zero conflicts, and is told the position is now 1000'
);

-- ------------------------------------------------------ what the function must not permit

-- The commission columns are write-once (rides_prevent_commission_rewrite). The function has no
-- special standing here — a snapshot it wrote is protected by the same trigger as any other.
select throws_ok(
  $$ update rides set commission_cents = 1, driver_payout_cents = 999
     where id = (select id from t_ids where label = 'ride_a') $$,
  'P0001',
  null,
  'the write-once trigger still guards a snapshot the function wrote'
);

set local role authenticated;
set local request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select apply_ride_commission(
       '00000000-0000-0000-0000-0000000000ff', '2026-08', 0, 3000, 300, 700) $$,
  '42501',
  null,
  'an authenticated driver cannot execute apply_ride_commission at all'
);

reset role;
select * from finish();
rollback;
