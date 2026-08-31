-- 20260902120100_create_ride_charges.sql: the inbound ledger holds exactly what Stripe confirmed,
-- one live charge per ride, and a rider can read their own and write none.
-- Rationale: docs/decisions/0017-rider-charging.md
--
-- What this file cannot prove is the authorization or capture themselves — those are HTTP calls to
-- Stripe with no local equivalent. What it proves is everything the database is responsible for
-- once a hold exists, which is the half that must never record money as taken when it wasn't.
begin;
select plan(14);

insert into auth.users (id) values
  ('b2000000-0000-0000-0000-000000000001'),  -- the rider
  ('b2000000-0000-0000-0000-000000000002'),  -- another rider, for the isolation check
  ('b2000000-0000-0000-0000-000000000003');  -- the driver's auth user

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('b2000000-0000-0000-0000-000000000003', 'Charge Driver', 'active', 'passed', 'passed');

create temporary table t_ids (label text primary key, id uuid) on commit drop;
insert into t_ids
select 'driver', id from drivers where auth_user_id = 'b2000000-0000-0000-0000-000000000003';

with r as (
  insert into rides (rider_id, driver_id, status, fare_cents, rider_total_cents)
  values ('b2000000-0000-0000-0000-000000000001', null, 'requested', 1240, 1240)
  returning id
)
insert into t_ids (label, id) select 'ride', id from r;

-- ------------------------------------------------------------------- the rider's own total

select is(
  (select rider_total_cents from rides where id = (select id from t_ids where label = 'ride')),
  1240::bigint,
  'a ride records what the rider is charged, not only what is commissionable'
);

select throws_ok(
  $$ update rides set rider_total_cents = 1000
     where id = (select id from t_ids where label = 'ride') $$,
  '23514',
  null,
  'the rider total can never fall below the commissionable fare — a pass-through is never negative'
);

-- ------------------------------------------------------------------------- what a hold records

insert into ride_charges (ride_id, rider_id, authorized_cents, status)
values ((select id from t_ids where label = 'ride'),
        'b2000000-0000-0000-0000-000000000001', 1426, 'authorized');
insert into t_ids select 'charge', id from ride_charges limit 1;

select is(
  (select authorized_cents from ride_charges where id = (select id from t_ids where label = 'charge')),
  1426::bigint,
  'the hold is the buffered amount, above the rider total — headroom a later capture can draw on'
);

select is(
  (select captured_cents from ride_charges where id = (select id from t_ids where label = 'charge')),
  null,
  'an authorized charge has taken nothing yet'
);

select throws_ok(
  $$ insert into ride_charges (ride_id, rider_id, authorized_cents)
     values ((select id from t_ids where label = 'ride'),
             'b2000000-0000-0000-0000-000000000001', 0) $$,
  '23514',
  null,
  'a zero-value hold is rejected — Stripe refuses one, and a zero hold means something upstream computed wrongly'
);

-- ------------------------------------------------- money is never recorded as taken without proof

select throws_ok(
  $$ update ride_charges set status = 'captured', captured_cents = 1240
     where id = (select id from t_ids where label = 'charge') $$,
  '23514',
  null,
  'captured without a PaymentIntent id is rejected — no money is "taken" without the receipt proving it'
);

select throws_ok(
  $$ update ride_charges set status = 'captured', stripe_payment_intent_id = 'pi_test_no_amount'
     where id = (select id from t_ids where label = 'charge') $$,
  '23514',
  null,
  'and captured without an amount is rejected too'
);

select throws_ok(
  $$ update ride_charges
     set status = 'captured', captured_cents = 9999, stripe_payment_intent_id = 'pi_test_over'
     where id = (select id from t_ids where label = 'charge') $$,
  '23514',
  null,
  'a capture can never exceed what was held — a ledger that can record an impossible capture cannot be reconciled from'
);

select lives_ok(
  $$ update ride_charges
     set status = 'captured', captured_cents = 1240, stripe_payment_intent_id = 'pi_test_ok'
     where id = (select id from t_ids where label = 'charge') $$,
  'captured WITH an amount and a receipt, at or below the hold, is accepted'
);

-- ------------------------------------------------------------------- one live charge per ride

select throws_ok(
  $$ insert into ride_charges (ride_id, rider_id, authorized_cents, status)
     values ((select id from t_ids where label = 'ride'),
             'b2000000-0000-0000-0000-000000000001', 1426, 'authorized') $$,
  '23505',
  null,
  'a ride cannot carry two live charges — a rider is never held twice for one trip'
);

-- A failed authorization is not live, so a fresh attempt may supersede it: "a correction is a new
-- row, not an edit". This is the whole reason the unique index is partial.
with r as (
  insert into rides (rider_id, driver_id, status, fare_cents, rider_total_cents)
  values ('b2000000-0000-0000-0000-000000000002', null, 'requested', 900, 900)
  returning id
)
insert into t_ids (label, id) select 'ride_retry', id from r;

insert into ride_charges (ride_id, rider_id, authorized_cents, status, failure_reason)
values ((select id from t_ids where label = 'ride_retry'),
        'b2000000-0000-0000-0000-000000000002', 1035, 'failed', 'Your card was declined.');

select lives_ok(
  $$ insert into ride_charges (ride_id, rider_id, authorized_cents, status)
     values ((select id from t_ids where label = 'ride_retry'),
             'b2000000-0000-0000-0000-000000000002', 1035, 'authorized') $$,
  'a failed charge can be superseded by a new row — the partial index makes a retry possible without an edit'
);

-- --------------------------------------------------------------------- one row per PaymentIntent

select throws_ok(
  $$ update ride_charges set stripe_payment_intent_id = 'pi_test_ok'
     where ride_id = (select id from t_ids where label = 'ride_retry') and status = 'authorized' $$,
  '23505',
  null,
  'two charges cannot claim one PaymentIntent, whatever the application does with retries'
);

-- --------------------------------------------------------------------------------- RLS

grant select on t_ids to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from ride_charges
     where ride_id = (select id from t_ids where label = 'ride'))::int,
  0,
  'a rider sees none of another rider''s charges'
);

select throws_ok(
  $$ update ride_charges set status = 'voided' $$,
  '42501',
  null,
  'a rider cannot write a charge at all — voiding their own hold would be a free ride'
);

reset role;
select * from finish();
rollback;
