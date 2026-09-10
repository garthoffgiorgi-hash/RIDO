-- The SB 1376 pass-through columns (ADR-0024): the seeded card carries the fee, a writer that
-- never mentions it lands on 0, a negative fee is refused, and — the load-bearing one —
-- rides_rider_total_covers_pass_throughs refuses a rider total that omits a fee the ride claims to
-- have charged, while staying permissive enough that a SECOND pass-through needs no migration.

begin;
select plan(10);

insert into auth.users (id) values
  ('f3000000-0000-0000-0000-000000000001'),  -- Driver A
  ('f3000000-0000-0000-0000-000000000002'),  -- Rider A
  ('f3000000-0000-0000-0000-000000000003');  -- Rider B

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('f3000000-0000-0000-0000-000000000001', 'Driver A', 'active', 'passed', 'passed');

-- ---- The seed states the fee rather than leaving the column on its default ----------------------

select is(
  (select access_for_all_fee_cents from fare_rate_cards
     where market = 'san-diego' and effective_from = '2026-01-01'),
  10::bigint,
  'the seeded san-diego card carries the statutory fee — a 0 here would silently mean "no fee owed"'
);

-- ---- A writer that never mentions the fee lands on 0, not null ----------------------------------

select lives_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents)
     select 'f3000000-0000-0000-0000-000000000002', id, 'requested', 1240
     from drivers where auth_user_id = 'f3000000-0000-0000-0000-000000000001' $$,
  'a ride that never mentions the fee is accepted — old rows and admin tooling still write'
);

select is(
  (select access_for_all_fee_cents from rides where rider_id = 'f3000000-0000-0000-0000-000000000002'),
  0::bigint,
  'and lands on 0, which is a true historical fact for a ride booked before the fee existed'
);

-- ---- The amount cannot be negative on either table ----------------------------------------------

select throws_ok(
  $$ update fare_rate_cards set access_for_all_fee_cents = -1
     where market = 'san-diego' and effective_from = '2026-01-01' $$,
  '23514',
  null,
  'a rate card cannot carry a negative fee'
);

select throws_ok(
  $$ update rides set access_for_all_fee_cents = -1
     where rider_id = 'f3000000-0000-0000-0000-000000000002' $$,
  '23514',
  null,
  'and neither can a ride'
);

-- ---- The rider total must cover the fee the ride claims to have charged -------------------------
--
-- This is the constraint that stops the ledger disagreeing with itself: a ride saying it charged
-- a 10-cent pass-through while the rider was only ever charged the fare.

select throws_ok(
  $$ update rides set access_for_all_fee_cents = 10, rider_total_cents = 1240
     where rider_id = 'f3000000-0000-0000-0000-000000000002' $$,
  '23514',
  null,
  'a rider total equal to the fare is refused once the ride carries a fee'
);

select lives_ok(
  $$ update rides set access_for_all_fee_cents = 10, rider_total_cents = 1250
     where rider_id = 'f3000000-0000-0000-0000-000000000002' $$,
  'fare + fee is accepted — the shape requestRide() actually writes'
);

-- Deliberately `>=`, not `=`: the airport surcharge must not require dropping and recreating this
-- constraint. A total ABOVE fare + this fee is the second pass-through arriving, and it passes.
select lives_ok(
  $$ update rides set rider_total_cents = 1275
     where rider_id = 'f3000000-0000-0000-0000-000000000002' $$,
  'a total above fare + fee is accepted, so a second pass-through needs no migration'
);

-- A ride quoted before ADR-0017 has no rider total at all; the constraint must not resurrect it.
select lives_ok(
  $$ insert into rides (rider_id, driver_id, status, fare_cents, access_for_all_fee_cents, rider_total_cents)
     select 'f3000000-0000-0000-0000-000000000003', id, 'requested', 900, 10, null
     from drivers where auth_user_id = 'f3000000-0000-0000-0000-000000000001' $$,
  'a null rider total still passes — the constraint says nothing about a ride that has no total yet'
);

-- ---- RLS still covers the table with the new column on it ---------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'f3000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from rides where rider_id = 'f3000000-0000-0000-0000-000000000003')::int,
  0,
  'a rider still cannot reach another rider''s ride — the new column opened no hole'
);

reset role;
select * from finish();
rollback;
