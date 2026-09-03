-- 20260902120200_enable_late_cancellation.sql: a captured cancellation fee reaches the driver in
-- full, and a cancellation that captured nothing pays nobody.
-- Rationale: docs/decisions/0018-late-cancellation-fee.md
--
-- The assertion that matters most here is the FULL one: the driver receives exactly the captured
-- fee, with no arithmetic anywhere in the path. "Driver keeps 100%" is expressed by the absence of
-- a calculation, not by multiplying by one — so the test that would catch a future split going in
-- silently is a test that the amounts are equal.
begin;
select plan(11);

insert into auth.users (id) values
  ('c2000000-0000-0000-0000-000000000001'),  -- rider, late cancel
  ('c2000000-0000-0000-0000-000000000002'),  -- rider, free cancel
  ('c2000000-0000-0000-0000-000000000003'),  -- rider, cancel before dispatch
  ('c2000000-0000-0000-0000-000000000009');  -- the driver's auth user

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('c2000000-0000-0000-0000-000000000009', 'Cancel Driver', 'active', 'passed', 'passed');

create temporary table t_ids (label text primary key, id uuid) on commit drop;
insert into t_ids
select 'driver', id from drivers where auth_user_id = 'c2000000-0000-0000-0000-000000000009';

-- ------------------------------------------------------- the policy is configuration, not code

select is(
  (select cancellation_grace_seconds from fare_rate_cards
     where market = 'san-diego' and active),
  30,
  'the grace window is a row in fare_rate_cards, tunable without a deploy'
);

select ok(
  (select cancellation_fee_cents from fare_rate_cards where market = 'san-diego' and active) > 0,
  'and so is the fee — a market that has not decided one charges nothing rather than something arbitrary'
);

-- --------------------------------------------- a late cancel: fee captured, driver paid in full

with r as (
  insert into rides (rider_id, driver_id, status, fare_cents, rider_total_cents, accepted_at)
  values ('c2000000-0000-0000-0000-000000000001',
          (select id from t_ids where label = 'driver'),
          'accepted', 1240, 1240, now() - interval '5 minutes')
  returning id
)
insert into t_ids (label, id) select 'ride_late', id from r;

-- The fee is a PARTIAL capture of the hold already placed at booking — no second PaymentIntent,
-- no new card interaction, no chance of a decline at the awkward moment.
insert into ride_charges
  (ride_id, rider_id, authorized_cents, captured_cents, status, stripe_payment_intent_id)
values ((select id from t_ids where label = 'ride_late'),
        'c2000000-0000-0000-0000-000000000001', 1426, 500, 'captured', 'pi_test_late_cancel');

select is(
  (select count(*) from driver_payouts
     where ride_id = (select id from t_ids where label = 'ride_late'))::int,
  0,
  'capturing the fee does not itself owe anyone — the debt is recorded by the cancellation, not the capture'
);

-- Capture first, THEN cancel. This order is load-bearing: the trigger reads the captured row, so
-- reversing these two statements would silently pay no driver.
update rides set status = 'canceled', canceled_at = now()
where id = (select id from t_ids where label = 'ride_late');

select results_eq(
  $$ select amount_cents, status, stripe_transfer_id from driver_payouts
     where ride_id = (select id from t_ids where label = 'ride_late') $$,
  $$ values (500::bigint, 'pending'::text, null::text) $$,
  'canceling queues a payout for the FULL captured fee, pending and unsent — the driver keeps 100%'
);

select is(
  (select dp.amount_cents from driver_payouts dp
     where dp.ride_id = (select id from t_ids where label = 'ride_late')),
  (select rc.captured_cents from ride_charges rc
     where rc.ride_id = (select id from t_ids where label = 'ride_late')),
  'the payout equals the capture exactly — nothing is deducted, and no arithmetic sits between them'
);

select is(
  (select driver_id from driver_payouts
     where ride_id = (select id from t_ids where label = 'ride_late')),
  (select id from t_ids where label = 'driver'),
  'and it is owed to the driver whose time was spent'
);

select is(
  (select count(*) from driver_payouts
     where ride_id = (select id from t_ids where label = 'ride_late'))::int,
  1,
  'exactly one payout for the canceled ride — driver_payouts_one_per_ride holds across BOTH triggers, so a fee and a fare can never both be owed for one trip'
);

-- ------------------------------------------------------- a free cancel: nothing captured, nobody paid

with r as (
  insert into rides (rider_id, driver_id, status, fare_cents, rider_total_cents, accepted_at)
  values ('c2000000-0000-0000-0000-000000000002',
          (select id from t_ids where label = 'driver'),
          'accepted', 1240, 1240, now())
  returning id
)
insert into t_ids (label, id) select 'ride_free', id from r;

-- Inside the grace window the hold is VOIDED, not captured. A voided charge carries no
-- captured_cents, which is exactly what the trigger checks for.
insert into ride_charges (ride_id, rider_id, authorized_cents, status)
values ((select id from t_ids where label = 'ride_free'),
        'c2000000-0000-0000-0000-000000000002', 1426, 'voided');

update rides set status = 'canceled', canceled_at = now()
where id = (select id from t_ids where label = 'ride_free');

select is(
  (select count(*) from driver_payouts
     where ride_id = (select id from t_ids where label = 'ride_free'))::int,
  0,
  'a cancel inside the grace window captures nothing and owes nobody'
);

-- ------------------------------ and the month rollup never hears about it (ADR-0021's trap)
--
-- driver_monthly_stats is a FARE rollup, not an earnings ledger. bump_monthly_stats fires only on
-- '-> completed'; queue_cancellation_payout fires on '-> canceled'. So a captured fee reaches
-- driver_payouts and never reaches the rollup, which is why /drive's tier card and its Earnings
-- card legitimately disagree.
--
-- The tempting "fix" is to reconcile them by folding fees into the rollup. That would be a money
-- bug: driver_monthly_stats_sums_to_gross enforces commission_cents + payout_cents =
-- gross_fare_cents, so a fee either violates the CHECK or inflates gross_fare_cents — and
-- gross_fare_cents is the basis commissionForRide brackets against, so inflating it silently
-- changes the rate the driver's NEXT ride is charged. This assertion is here to make that attempt
-- fail loudly rather than ship.

select is(
  (select count(*) from driver_monthly_stats
     where driver_id = (select id from t_ids where label = 'driver'))::int,
  0,
  'a canceled ride writes no month rollup row at all — the fee is earnings, but it is not fare volume'
);

select is(
  (select count(*) from driver_payouts
     where driver_id = (select id from t_ids where label = 'driver'))::int,
  1,
  'while the payout ledger does carry it — the two cards read different tables on purpose, and reconciling them would move the driver''s tier position'
);

-- ------------------------------------------- a cancel before dispatch: no driver, nothing owed

with r as (
  insert into rides (rider_id, driver_id, status, fare_cents, rider_total_cents)
  values ('c2000000-0000-0000-0000-000000000003', null, 'requested', 900, 900)
  returning id
)
insert into t_ids (label, id) select 'ride_undispatched', id from r;

update rides set status = 'canceled', canceled_at = now()
where id = (select id from t_ids where label = 'ride_undispatched');

select is(
  (select count(*) from driver_payouts
     where ride_id = (select id from t_ids where label = 'ride_undispatched'))::int,
  0,
  'a ride nobody accepted owes nobody — the trigger returns before looking for a charge'
);

reset role;
select * from finish();
rollback;
