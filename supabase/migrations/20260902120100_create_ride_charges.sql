-- ride_charges — what a rider was held for, and what was actually taken.
--
-- The inbound mirror of driver_payouts. That table answers "what does RIDO owe this driver, and
-- has it been sent"; this one answers "what has RIDO put on hold for this rider, and has it been
-- captured". Rationale: docs/decisions/0017-rider-charging.md
--
-- WHY THIS EXISTS AT ALL. `rides.fare_cents` has always been a price nobody paid. There was no
-- PaymentIntent, no charge, no record that money had ever moved inward — which is why every
-- production transfer on the payout side returns `balance_insufficient` (ADR-0015): RIDO's
-- platform balance is empty because nothing has ever funded it. This table is the record of the
-- funding.
--
-- WHY A LEDGER RATHER THAN COLUMNS ON `rides`. Same reasoning driver_payouts used, plus one more:
-- an authorization can fail and be superseded. "A correction is a new row, not an edit" needs
-- somewhere to write the new row, and a column on `rides` has room for exactly one attempt.

-- ------------------------------------------------------------------ what the rider actually pays

-- The end of a journey that has gone nowhere. `quoteFare()` has always returned BOTH `fareCents`
-- (the commissionable subtotal) and `riderTotalCents` (fare + pass-throughs); `RideQuote` carries
-- both to the client; `requestRide()` then wrote only the first and discarded the second. ADR-0015
-- named this gap in its Consequences: "when CPUC and airport pass-throughs land, what a rider is
-- charged stops equalling fare_cents, and rides has no column for it."
--
-- NULLABLE because rides predating this migration have no rider total and inventing one would be
-- fabricating an accounting record.
--
-- `>= fare_cents`, NOT `=`: pass-throughs are non-negative, so the rider's total can only ever
-- meet or exceed the commissionable fare. Today `lineItems` is empty and they are equal.
--
-- CRITICALLY, this does not touch `rides_commission_sums_to_fare`. Commission still splits
-- `fare_cents` alone, because a pass-through is someone else's money and taking a cut of it would
-- be taking a cut of a tax. The two invariants coexist precisely because they describe different
-- numbers.
alter table rides
  add column rider_total_cents bigint
    check (rider_total_cents is null or rider_total_cents >= fare_cents);

comment on column rides.rider_total_cents is
  'What the rider is charged: fare_cents plus non-commissionable pass-throughs. Equal to '
  'fare_cents until FareLineItem produces one. Never the basis for commission — that is '
  'fare_cents, and rides_commission_sums_to_fare still binds it alone.';

-- ---------------------------------------------------------------------------- the hold's headroom

-- How far above the rider's total to authorize. Configuration, not code — the same rule the four
-- fare values on this table already follow, and for the same reason: tuning it must not be a
-- deploy.
--
-- WHY IT IS ZERO-USEFUL TODAY, AND WHY IT SHIPS ANYWAY. Nothing recomputes a fare at completion:
-- `apply_ride_commission` reads `v_ride.fare_cents` and never writes it, and `distance_meters` /
-- `duration_seconds` are recorded but nothing prices from them. So the quoted fare IS the captured
-- fare, and a buffer is headroom nothing currently uses. It exists so that the day repricing from
-- actuals lands, every in-flight hold is already big enough to capture against — a hold cannot be
-- raised after the fact, only voided and re-placed, which is a card decline in front of a rider
-- whose ride just ended. Cheap now, impossible to retrofit later.
alter table fare_rate_cards
  add column authorization_buffer_bps integer not null default 0
    check (authorization_buffer_bps between 0 and 10000);

comment on column fare_rate_cards.authorization_buffer_bps is
  'Basis points of headroom added to rider_total_cents when authorizing, so a later '
  'repricing-from-actuals can capture more than the quote without re-authorizing. 0 = hold exactly '
  'the quote. Consumed by holdAmountCents() in @rido/pricing — never computed at a call site.';

-- ----------------------------------------------------------------------------------- the ledger

create table ride_charges (
  id uuid primary key default gen_random_uuid(),

  -- on delete restrict, like driver_payouts: a financial record blocks deleting what it points at.
  ride_id uuid not null references rides (id) on delete restrict,
  rider_id uuid not null references auth.users (id) on delete restrict,

  -- DELIBERATELY NO `kind` COLUMN.
  --
  -- A late cancellation captures part of the SAME hold placed at booking — there is no second
  -- PaymentIntent and no second row. So whether a captured row was a fare or a cancellation fee
  -- depends only on how the ride ended, and `rides.status` already says that, unambiguously and in
  -- one place. A stored `kind` would be a second copy of that fact, written at capture time, free
  -- to drift from the first. The ledger is more trustworthy without it.

  -- What was put on hold. > 0 because Stripe rejects a zero-amount authorization, and a zero hold
  -- means something upstream computed wrongly.
  authorized_cents bigint not null check (authorized_cents > 0),

  -- What was actually taken. Null until capture. Never more than was held — Stripe enforces this
  -- too, but a ledger that can record an impossible capture is a ledger you cannot reconcile from.
  captured_cents bigint
    check (captured_cents is null or (captured_cents >= 0 and captured_cents <= authorized_cents)),

  status text not null default 'authorizing'
    check (status in ('authorizing', 'authorized', 'captured', 'voided', 'failed')),

  stripe_payment_intent_id text,
  failure_reason text,

  -- ADR-0016's attempt claim, applied from the start rather than retrofitted after a live incident.
  -- A stable Stripe idempotency key makes Stripe replay a payout's FIRST cached response — success
  -- or failure — for at least 24 hours, so a retryable failure could never actually be retried.
  -- Every Stripe money call in this repo folds a changing attempt number into its key; these three
  -- columns are what supply it, and claim_ride_charge_attempt() below is what makes exactly one
  -- caller at a time able to take one.
  attempt_count integer not null default 0,
  settling boolean not null default false,
  settling_since timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A captured row carries its amount and its receipt; an uncaptured one claims neither. The
  -- charge-side mirror of driver_payouts_transfer_id_iff_paid, and the same job: stop a bug from
  -- recording money as taken without the evidence that it was.
  constraint ride_charges_captured_iff_settled check (
    (status = 'captured'
      and captured_cents is not null
      and stripe_payment_intent_id is not null)
    or (status <> 'captured' and captured_cents is null)
  )
);

-- One LIVE charge per ride. Partial on the unsettled statuses, so a `failed` authorization can be
-- superseded by a fresh row — "a correction is a new row, not an edit" — while it stays impossible
-- to hold a rider twice for one ride.
create unique index ride_charges_one_live_per_ride on ride_charges (ride_id)
  where status in ('authorizing', 'authorized', 'captured');

-- One row per PaymentIntent, whatever the application does with retries.
create unique index ride_charges_payment_intent_idx on ride_charges (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Serves "what is still owed to us" and the rider's own charge list.
create index ride_charges_rider_id_created_at_idx on ride_charges (rider_id, created_at);
create index ride_charges_unsettled_idx on ride_charges (created_at)
  where status in ('authorizing', 'authorized');

create trigger ride_charges_set_updated_at
  before update on ride_charges
  for each row
  execute function public.set_updated_at();

alter table ride_charges enable row level security;

create policy ride_charges_select_own
  on ride_charges for select
  to authenticated
  using (rider_id = (select auth.uid()));

-- SELECT only, matching driver_payouts exactly. A rider who could write here could mark an
-- uncaptured hold `voided` and take a free ride, or a captured charge `failed` and invite a
-- refund for money RIDO correctly holds. Writes are service-role, after Stripe has spoken.
grant select on ride_charges to authenticated;
grant select, insert, update, delete on ride_charges to service_role;

-- ------------------------------------------------------------------------------- the attempt claim

-- Deliberately a MIRROR of claim_driver_payout_attempt rather than a shared generic function.
-- Generalising would mean passing a table name and building the UPDATE as dynamic SQL, and dynamic
-- SQL in the one path that moves customer money is a trade nobody should take to save nine lines.
--
-- Returns the attempt number to fold into Stripe's idempotency key, or null when another attempt
-- is already in flight or the charge is already settled — either way, the caller must not call
-- Stripe.
--
-- The two-minute staleness window recovers a claim abandoned by a crashed or timed-out request. It
-- is operational headroom, not a business rule: a Stripe call resolves in well under a second, and
-- without this one abandoned attempt would strand a charge until someone noticed.
create or replace function public.claim_ride_charge_attempt(p_charge_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt integer;
begin
  update ride_charges
  set settling = true,
      settling_since = now(),
      attempt_count = attempt_count + 1
  where id = p_charge_id
    and status not in ('captured', 'voided')
    and (settling = false or settling_since < now() - interval '2 minutes')
  returning attempt_count into v_attempt;

  return v_attempt;
end;
$$;

comment on function public.claim_ride_charge_attempt(uuid) is
  'Exclusively claims one charge attempt and returns its attempt number for the Stripe idempotency '
  'key, or null if another attempt is in flight or the charge is already settled. Mirrors '
  'claim_driver_payout_attempt (ADR-0016).';

revoke execute on function public.claim_ride_charge_attempt(uuid) from public, anon, authenticated;
grant execute on function public.claim_ride_charge_attempt(uuid) to service_role;

create or replace function public.release_ride_charge_attempt(p_charge_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update ride_charges set settling = false where id = p_charge_id;
end;
$$;

comment on function public.release_ride_charge_attempt(uuid) is
  'Clears the in-flight claim so a later genuine retry can claim again. Always called from the '
  'charge path''s finally block, on every exit.';

revoke execute on function public.release_ride_charge_attempt(uuid) from public, anon, authenticated;
grant execute on function public.release_ride_charge_attempt(uuid) to service_role;
