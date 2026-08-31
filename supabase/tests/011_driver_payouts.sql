-- 20260901120000_create_driver_payouts.sql: completing a ride records a debt, exactly once, for
-- exactly the snapshotted amount — and a driver can read their own payouts but never write one.
-- Rationale: docs/decisions/0015-connect-payouts-per-ride.md
--
-- What this file cannot prove is the transfer itself: that is an HTTP call to Stripe with no local
-- equivalent. What it proves is everything the database is responsible for once money is owed —
-- which is the half that must never lose a driver's earnings.
begin;
select plan(13);

insert into auth.users (id) values
  ('c9000000-0000-0000-0000-000000000001'), -- the driver
  ('c9000000-0000-0000-0000-000000000002'), -- another driver, for the isolation check
  ('c9000000-0000-0000-0000-000000000003'), -- rider A
  ('c9000000-0000-0000-0000-000000000004'), -- rider B
  ('c9000000-0000-0000-0000-000000000005'); -- rider C, the zero-fare case

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values
  ('c9000000-0000-0000-0000-000000000001', 'Payout Driver', 'active', 'passed', 'passed'),
  ('c9000000-0000-0000-0000-000000000002', 'Other Driver', 'active', 'passed', 'passed');

create temporary table t_ids (label text primary key, id uuid) on commit drop;

insert into t_ids
select 'driver', id from drivers where auth_user_id = 'c9000000-0000-0000-0000-000000000001';
insert into t_ids
select 'other_driver', id from drivers where auth_user_id = 'c9000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------- the Connect columns start out honest

select is(
  (select stripe_payouts_enabled from drivers where id = (select id from t_ids where label = 'driver')),
  false,
  'a new driver cannot receive payouts until Stripe says so'
);

select is(
  (select stripe_account_id from drivers where id = (select id from t_ids where label = 'driver')),
  null,
  'a new driver has no Stripe account until onboarding creates one'
);

-- ------------------------------------------------ completing a ride records the debt, by trigger

with r as (
  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('c9000000-0000-0000-0000-000000000003',
          (select id from t_ids where label = 'driver'), 'accepted', 1000)
  returning id
)
insert into t_ids (label, id) select 'ride_a', id from r;

select is(
  (select count(*) from driver_payouts)::int,
  0,
  'an accepted, uncompleted ride owes nobody anything yet'
);

update rides set
  status = 'completed', completed_at = now(),
  commission_rate_bps = 2000, commission_cents = 200, driver_payout_cents = 800
where id = (select id from t_ids where label = 'ride_a');

select results_eq(
  $$ select amount_cents, status, stripe_transfer_id, failure_reason
     from driver_payouts where ride_id = (select id from t_ids where label = 'ride_a') $$,
  $$ values (800::bigint, 'pending'::text, null::text, null::text) $$,
  'completion queues exactly the ride''s driver_payout_cents, pending and unsent'
);

-- The whole point of the trigger rather than application code: this row exists because the
-- database wrote it inside the completion transaction, so no crash between "completed" and
-- "queued" can lose it.
select is(
  (select driver_id from driver_payouts where ride_id = (select id from t_ids where label = 'ride_a')),
  (select id from t_ids where label = 'driver'),
  'the debt is recorded against the driver who earned it'
);

-- --------------------------------------------------------------------- idempotency, at the database

select throws_ok(
  $$ insert into driver_payouts (driver_id, ride_id, amount_cents)
     select driver_id, ride_id, amount_cents from driver_payouts limit 1 $$,
  '23505',
  null,
  'a ride cannot be owed for twice — driver_payouts_one_per_ride bites'
);

select lives_ok(
  $$ insert into driver_payouts (driver_id, ride_id, amount_cents)
     values ((select id from t_ids where label = 'driver'), null, 500) $$,
  'a payout with no ride is legal — the Prop 22 top-up and adjustment-row seam'
);

select lives_ok(
  $$ insert into driver_payouts (driver_id, ride_id, amount_cents)
     values ((select id from t_ids where label = 'driver'), null, 600) $$,
  'and two of them coexist, because the unique index is partial on ride_id'
);

-- ------------------------------------------------------- a paid row must carry its receipt

select throws_ok(
  $$ update driver_payouts set status = 'paid'
     where ride_id = (select id from t_ids where label = 'ride_a') $$,
  '23514',
  null,
  'marking a payout paid without a transfer id is rejected — no money is "sent" without evidence'
);

select lives_ok(
  $$ update driver_payouts set status = 'paid', stripe_transfer_id = 'tr_test_receipt'
     where ride_id = (select id from t_ids where label = 'ride_a') $$,
  'paid WITH a transfer id is accepted'
);

-- ------------------------------------------------------------- a zero-payout ride owes nothing

with r as (
  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('c9000000-0000-0000-0000-000000000005',
          (select id from t_ids where label = 'other_driver'), 'accepted', 0)
  returning id
)
insert into t_ids (label, id) select 'ride_zero', id from r;

update rides set
  status = 'completed', completed_at = now(),
  commission_rate_bps = 0, commission_cents = 0, driver_payout_cents = 0
where id = (select id from t_ids where label = 'ride_zero');

select is(
  (select count(*) from driver_payouts
     where ride_id = (select id from t_ids where label = 'ride_zero'))::int,
  0,
  'a zero-value payout is skipped rather than written as a row amount_cents > 0 would reject'
);

-- --------------------------------------------------------------------------------- RLS

-- Scaffolding only: the assertions below run as `authenticated` and resolve fixture ids through
-- this temp table inside their subqueries. Nothing under test depends on the grant.
grant select on t_ids to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'c9000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from driver_payouts)::int,
  0,
  'a driver sees none of another driver''s payouts — not the amount, not the existence'
);

select throws_ok(
  $$ update driver_payouts set status = 'paid' $$,
  '42501',
  null,
  'a driver cannot write a payout row at all — marking their own unsent money "paid" is the hole this closes'
);

reset role;
select * from finish();
rollback;
