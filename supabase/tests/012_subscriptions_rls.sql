-- subscriptions RLS — closing a standing gap, not testing new code.
--
-- `supabase/CLAUDE.md` states the rule plainly: "Write a pgTAP test for every policy. A policy
-- with no test is an assumption." `subscriptions_select_own` has existed since 20260821120300 with
-- no test at all, which made it exactly that. Nothing writes to `subscriptions` yet — the flat fee
-- is $0 for the whole pilot (ADR-0003) and Stripe Billing is deliberately deferred out of
-- ADR-0015's scope — so this is the moment to pin the policy down: before a webhook starts
-- writing rows, rather than after.
--
-- The invariant that matters most here is the one the table's own comment calls out: a driver
-- must not be able to write their own `fee_active` or `flat_fee_cents`, because either would let
-- them switch off what RIDO charges them.
begin;
select plan(6);

insert into auth.users (id) values
  ('ca000000-0000-0000-0000-000000000001'),
  ('ca000000-0000-0000-0000-000000000002');

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values
  ('ca000000-0000-0000-0000-000000000001', 'Subscribed Driver', 'active', 'passed', 'passed'),
  ('ca000000-0000-0000-0000-000000000002', 'Other Driver', 'active', 'passed', 'passed');

-- Pilot rows, matching what ADR-0003 says every driver looks like today: plan 'pilot', fee off,
-- amount zero. Deliberately not asserting the amount anywhere below — the fee lives on the row,
-- and a repricing must not break an RLS test.
insert into subscriptions (driver_id, plan, flat_fee_cents, current_period_start, current_period_end, fee_active)
select id, 'pilot', 0, now(), now() + interval '30 days', false
from drivers where auth_user_id = 'ca000000-0000-0000-0000-000000000001';

insert into subscriptions (driver_id, plan, flat_fee_cents, current_period_start, current_period_end, fee_active)
select id, 'pilot', 0, now(), now() + interval '30 days', false
from drivers where auth_user_id = 'ca000000-0000-0000-0000-000000000002';

-- --------------------------------------------------------------- one active row per driver

select throws_ok(
  $$ insert into subscriptions (driver_id, plan, flat_fee_cents, current_period_start, current_period_end)
     select id, 'standard', 5000, now(), now() + interval '30 days'
     from drivers where auth_user_id = 'ca000000-0000-0000-0000-000000000001' $$,
  '23505',
  null,
  'a driver cannot hold two active subscriptions — the guard against a webhook replay creating an ambiguous second row'
);

select lives_ok(
  $$ update subscriptions set status = 'canceled'
     where driver_id = (select id from drivers where auth_user_id = 'ca000000-0000-0000-0000-000000000001') $$,
  'canceling the active row releases the partial unique index'
);

select lives_ok(
  $$ insert into subscriptions (driver_id, plan, flat_fee_cents, current_period_start, current_period_end)
     select id, 'standard', 5000, now(), now() + interval '30 days'
     from drivers where auth_user_id = 'ca000000-0000-0000-0000-000000000001' $$,
  'and the driver can then be moved onto a new plan'
);

-- ------------------------------------------------------------------------------------ RLS

set local role authenticated;
set local request.jwt.claim.sub = 'ca000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from subscriptions)::int,
  2,
  'a driver sees only their own subscription rows — their canceled one and their current one, not the other driver''s'
);

-- The two writes the table's own comment names as revenue-integrity holes. Neither has a policy,
-- and `authenticated` holds no UPDATE grant, so both fail at the privilege level.
select throws_ok(
  $$ update subscriptions set fee_active = false $$,
  '42501',
  null,
  'a driver cannot switch off their own fee'
);

select throws_ok(
  $$ update subscriptions set flat_fee_cents = 0 $$,
  '42501',
  null,
  'a driver cannot set their own fee amount'
);

reset role;
select * from finish();
rollback;
