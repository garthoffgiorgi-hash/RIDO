-- Late cancellation — a rider may cancel after a driver commits, and it costs them.
--
-- Rationale: docs/decisions/0018-late-cancellation-fee.md
--
-- WHAT THIS CHANGES ABOUT THE PRODUCT. Until now `canRiderCancel()` returned true only for
-- 'requested', and its docstring said why: "this PR builds no driver-side accept, so nothing here
-- ever produces 'accepted' ... whether a rider can still cancel after a driver has committed is a
-- real product decision (a fee? a driver notification?) that belongs with that PR, not assumed
-- here." Accept shipped in ADR-0013 and charging ships now, so this is that PR, and this is that
-- decision: they can, after a grace period, for a fee that goes to the driver.
--
-- WHY A FEE IS NEWLY POSSIBLE AT ALL. It isn't a new charge — it is a PARTIAL CAPTURE of the hold
-- the rider already placed at booking. No new card interaction, no new PaymentIntent, no chance of
-- a decline at the awkward moment. The authorization that exists to pay for the ride is simply
-- captured in part when the ride doesn't happen.

alter table fare_rate_cards
  add column cancellation_fee_cents bigint not null default 0
    check (cancellation_fee_cents >= 0),
  add column cancellation_grace_seconds integer not null default 0
    check (cancellation_grace_seconds >= 0);

comment on column fare_rate_cards.cancellation_fee_cents is
  'Captured from the rider''s existing hold when they cancel past the grace window. Goes to the '
  'driver in full today — see queue_cancellation_payout. 0 disables the fee for this market.';

comment on column fare_rate_cards.cancellation_grace_seconds is
  'How long after accepted_at a rider may still cancel free. Measured against rides.accepted_at, '
  'which already exists — no new timestamp, no timer to run. 0 means a fee applies immediately '
  'on accept.';

-- Both default 0, so the policy is OFF until the seed turns it on and every pre-existing rate card
-- stays valid. A market that has not decided its fee charges nothing rather than something
-- arbitrary.

-- ------------------------------------------------------------------- the driver gets paid for it

-- Fires on the transition into 'canceled', the cancellation-side mirror of queue_driver_payout()'s
-- transition into 'completed', and SECURITY DEFINER for the same robustness reason: the moment some
-- future migration grants an authenticated write path to rides.status, an INVOKER trigger would hit
-- driver_payouts' RLS (no INSERT policy for authenticated) and fail, breaking cancellation for
-- everyone.
--
-- ORDERING THIS DEPENDS ON, and the one place in the charge path where sequence is load-bearing:
-- the fee must be CAPTURED BEFORE the ride's status flips to 'canceled', because this trigger reads
-- the captured row. `cancelRide()` does them in that order deliberately; reversing them would
-- silently pay no driver.
--
-- ── THE 100%-TO-DRIVER SPLIT IS A POLICY, NOT A LAW ──────────────────────────────────────────
--
-- A cancellation fee compensates a driver for time already spent driving toward a pickup, so today
-- they keep all of it and RIDO takes nothing. That is a deliberate pilot-scoped choice and it is
-- EXPECTED TO BE REVISITED: RIDO absorbs Stripe's processing on every authorization (ADR-0015), and
-- keeping some or all of the fee is the obvious way to cover that and add revenue. It is recorded
-- as an open question in docs/README.md.
--
-- If that changes, THIS FUNCTION IS THE ONLY THING THAT NEEDS TO. Nothing else in the payment path
-- decides where a captured fee goes. Note also what the current split buys: because RIDO takes no
-- cut, a canceled ride writes NO commission columns, so it never has to argue with
-- rides_commission_present_iff_completed — which forbids exactly those columns on a non-completed
-- ride. A future split has to decide whether that constraint bends or whether RIDO's share is
-- recorded somewhere other than the commission columns. That is the hard part of the change, and
-- it is not obvious from the outside, which is why it is written down here.
create or replace function public.queue_cancellation_payout()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fee_cents bigint;
begin
  -- A canceled ride with no driver was never dispatched, so nobody is owed anything.
  if new.driver_id is null then
    return new;
  end if;

  -- On a CANCELED ride a capture can only ever be a cancellation fee: the fare is captured at
  -- completion, and a ride cannot be both. This is why ride_charges needs no `kind` column.
  select captured_cents into v_fee_cents
  from ride_charges
  where ride_id = new.id and status = 'captured'
  limit 1;

  if v_fee_cents is null or v_fee_cents = 0 then
    return new;
  end if;

  -- The full captured amount, copied. No arithmetic: the payout path computes nothing, here or
  -- anywhere (root CLAUDE.md invariant 5), and "driver keeps 100%" is expressed by the absence of
  -- a calculation rather than by a multiplication by one.
  --
  -- driver_payouts_one_per_ride is satisfied because a canceled ride never also has a fare payout —
  -- queue_driver_payout only fires on the transition into 'completed'. `on conflict do nothing`
  -- guards a re-fired trigger anyway, the same way that function does.
  insert into driver_payouts (driver_id, ride_id, amount_cents)
  values (new.driver_id, new.id, v_fee_cents)
  on conflict (ride_id) where ride_id is not null do nothing;

  return new;
end;
$$;

create trigger rides_queue_cancellation_payout
  after update of status on rides
  for each row
  when (new.status = 'canceled' and old.status is distinct from 'canceled')
  execute function public.queue_cancellation_payout();
