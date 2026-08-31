-- 20260902120000_create_rider_payment_profiles.sql: a rider sees their own payment profile and
-- can write none of it. Rationale: docs/decisions/0017-rider-charging.md
--
-- Every column on this table is Stripe's word about an external system. A rider asserting their own
-- `default_payment_method_id` would not make an authorization succeed — Stripe rejects a
-- PaymentMethod that isn't the customer's — but it WOULD let the booking sheet promise a ride whose
-- payment then fails. That is the hole these assertions close.
begin;
select plan(8);

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-000000000001'),  -- the rider
  ('a1000000-0000-0000-0000-000000000002');  -- another rider, for the isolation check

insert into rider_payment_profiles (rider_id, stripe_customer_id)
values ('a1000000-0000-0000-0000-000000000001', 'cus_test_rider_one');

-- ------------------------------------------------------------------ a profile starts cardless

select is(
  (select default_payment_method_id from rider_payment_profiles
     where rider_id = 'a1000000-0000-0000-0000-000000000001'),
  null,
  'a new profile has no card until the rider adds one — the null that makes requestRide return needs_card'
);

select is(
  (select card_last4 from rider_payment_profiles
     where rider_id = 'a1000000-0000-0000-0000-000000000001'),
  null,
  'and no card details to display'
);

-- ---------------------------------------------------------------------- one profile per rider

select throws_ok(
  $$ insert into rider_payment_profiles (rider_id, stripe_customer_id)
     values ('a1000000-0000-0000-0000-000000000001', 'cus_test_duplicate') $$,
  '23505',
  null,
  'a rider cannot have two payment profiles — rider_id is the primary key'
);

select throws_ok(
  $$ insert into rider_payment_profiles (rider_id, stripe_customer_id)
     values ('a1000000-0000-0000-0000-000000000002', 'cus_test_rider_one') $$,
  '23505',
  null,
  'and one Stripe customer cannot be claimed by two riders'
);

-- ------------------------------------------------------------------------- the display cache

select throws_ok(
  $$ update rider_payment_profiles set card_last4 = '12345'
     where rider_id = 'a1000000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'card_last4 is exactly four digits — a longer value means something stored more of a card number than it should'
);

select lives_ok(
  $$ update rider_payment_profiles
     set default_payment_method_id = 'pm_test_visa', card_brand = 'visa',
         card_last4 = '4242', card_exp_month = 12, card_exp_year = 2030
     where rider_id = 'a1000000-0000-0000-0000-000000000001' $$,
  'a full card mirror is accepted'
);

-- --------------------------------------------------------------------------------- RLS

grant select on rider_payment_profiles to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from rider_payment_profiles)::int,
  0,
  'a rider sees none of another rider''s payment profile — not the card, not the customer id, not its existence'
);

select throws_ok(
  $$ update rider_payment_profiles set default_payment_method_id = 'pm_attacker' $$,
  '42501',
  null,
  'a rider cannot write a payment profile at all — asserting a payment method would let the UI promise a booking that fails'
);

reset role;
select * from finish();
rollback;
