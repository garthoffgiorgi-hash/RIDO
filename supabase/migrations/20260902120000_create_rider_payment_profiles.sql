-- rider_payment_profiles — who a rider is to Stripe, and which card they've saved.
--
-- Rationale: docs/decisions/0017-rider-charging.md
--
-- WHY A TABLE AND NOT A COLUMN. `drivers.stripe_account_id` could live on the drivers row because
-- a driver IS a row. A rider is not: there is no `riders` table — `rides.rider_id` references
-- auth.users directly, and auth.users belongs to Supabase, not to us. So the Stripe Customer needs
-- a home of its own, and this is the smallest one that can hold it.
--
-- WHY THE CARD DETAILS ARE MIRRORED HERE AT ALL. `/account` and the booking sheet both need to
-- answer "does this rider have a card, and which one" on render. Asking Stripe on every page load
-- would put a network round trip in front of the booking flow for a question that changes maybe
-- twice a year. So brand/last4/expiry are cached — and nothing more. That trio is exactly enough
-- for a rider to recognise their own card and nothing like enough to charge it: the number never
-- reaches this database, this server, or this codebase. Stripe Elements collects it in the
-- browser and hands back a PaymentMethod id, which is a reference, not an instrument.

create table rider_payment_profiles (
  -- The rider IS the key. One profile per person, no surrogate id: there is nothing to say about
  -- a rider's payment identity that isn't "this auth user is that Stripe customer".
  rider_id uuid primary key references auth.users (id) on delete cascade,

  stripe_customer_id text not null unique,

  -- The saved card, as a reference we can authorize against.
  default_payment_method_id text,

  -- Display only. See the header — these exist so a rider recognises their own card.
  card_brand text,
  card_last4 text check (card_last4 is null or length(card_last4) = 4),
  card_exp_month integer check (card_exp_month is null or card_exp_month between 1 and 12),
  card_exp_year integer check (card_exp_year is null or card_exp_year >= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- `on delete cascade`, unlike driver_payouts' `restrict`. That table restricts because it holds
-- financial records and deleting money you have already moved is not a cleanup operation. This
-- table holds a pointer and a display cache — the money lives in `ride_charges`, which restricts.
-- A deleted auth user should not leave a dangling Stripe pointer behind.

comment on column rider_payment_profiles.stripe_customer_id is
  'The rider''s Stripe Customer (cus_...), created by RIDO''s server before the first '
  'authorization. Service-role write only — Stripe''s word about an external system.';

comment on column rider_payment_profiles.default_payment_method_id is
  'The saved card (pm_...) every authorization is placed against. Null until the rider adds one; '
  'a null here is what makes requestRide return `needs_card` rather than failing a charge.';

comment on column rider_payment_profiles.card_last4 is
  'Display only, mirrored from Stripe so /account renders without a round trip. The card NUMBER '
  'never reaches this database — Stripe Elements collects it in the browser and returns a '
  'PaymentMethod reference.';

create trigger rider_payment_profiles_set_updated_at
  before update on rider_payment_profiles
  for each row
  execute function public.set_updated_at();

alter table rider_payment_profiles enable row level security;

create policy rider_payment_profiles_select_own
  on rider_payment_profiles for select
  to authenticated
  using (rider_id = (select auth.uid()));

-- SELECT only, matching subscriptions and driver_payouts exactly and for the same reason: every
-- column here is Stripe's word about an external system. A rider asserting their own
-- `default_payment_method_id` would not make an authorization succeed — Stripe would reject a
-- PaymentMethod that isn't theirs — but it WOULD let the UI promise a booking that then fails at
-- the worst possible moment. Writes come from the service role, after Stripe has confirmed.
grant select on rider_payment_profiles to authenticated;
grant select, insert, update, delete on rider_payment_profiles to service_role;
