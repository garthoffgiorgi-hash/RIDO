-- driver_payouts — what RIDO owes a driver, and whether it has been sent.
--
-- Until now `rides.driver_payout_cents` was a STATEMENT, not a DEBT: a figure snapshotted at
-- completion and never tracked to discharge. There was no `paid_at` anywhere, no ledger, no
-- balance. This table is that missing record. Rationale:
-- docs/decisions/0015-connect-payouts-per-ride.md
--
-- WHY A NEW TABLE RATHER THAN COLUMNS ON `rides`. The three commission columns are write-once,
-- guarded by rides_prevent_commission_rewrite, and bound by rides_commission_sums_to_fare — a
-- payout status cannot live among them without loosening a constraint that protects the
-- accounting record. And `driver_monthly_stats` is worse: its commission + payout = gross CHECK
-- means payout_cents can never be decremented as it is paid out, and it feeds the commission
-- tier lookup, so settling money there would couple paying a driver to rating their next ride.
--
-- WHY THE AMOUNT IS COPIED, NOT COMPUTED. amount_cents is a copy of the ride's snapshot. Nothing
-- in this migration, or in the payout path above it, performs commission arithmetic — root
-- CLAUDE.md invariant 5, and the reason a payout can never disagree with what the driver was
-- shown at completion. RIDO absorbs card processing (ADR-0015 resolves that open question), so
-- what is transferred is exactly driver_payout_cents, with nothing deducted on the way.

create table driver_payouts (
  id uuid primary key default gen_random_uuid(),

  -- on delete restrict, not cascade: a paid-out driver row is not deletable while a financial
  -- record points at it. Deleting money you have already sent is not a cleanup operation.
  driver_id uuid not null references drivers (id) on delete restrict,

  -- NULLABLE, deliberately. Every payout today is for exactly one ride, and the partial unique
  -- index below enforces that. But Prop 22's earnings-floor top-up is by statute assessed over a
  -- two-week AGGREGATE (packages/pricing/src/earnings-floor.ts) and is therefore attributable to
  -- no single ride — and docs/architecture/data-model.md records that ride-completion.md's "a
  -- correction is a new row, not an edit" rule currently has nowhere to write to. A null ride_id
  -- is the home for both. Nothing creates one yet; the shape costs nothing and its absence would
  -- mean restructuring this table the day either lands.
  ride_id uuid references rides (id) on delete restrict,

  -- > 0, not >= 0: Stripe rejects a zero-amount transfer, and a zero payout means something
  -- upstream computed wrongly. Neither should become a silent row.
  amount_cents bigint not null check (amount_cents > 0),

  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed')),

  stripe_transfer_id text,
  failure_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A paid row must carry its receipt, and an unpaid one must not claim to have a transfer that
  -- was never made. The CHECK is what stops a bug from marking money sent without evidence.
  constraint driver_payouts_transfer_id_iff_paid check (
    (status = 'paid' and stripe_transfer_id is not null)
    or (status <> 'paid' and stripe_transfer_id is null)
  )
);

-- Idempotency, half one of two. A ride is owed for exactly once, whatever the application does —
-- a retried completion, a double-tapped button, a replayed webhook. The other half lives in
-- Stripe: the transfer call passes this row's id as an idempotency key, so even two simultaneous
-- attempts on one row yield one transfer. A duplicated transfer is the single failure mode here
-- that costs real cash, so it is prevented twice, in two systems that fail independently.
create unique index driver_payouts_one_per_ride on driver_payouts (ride_id)
  where ride_id is not null;

create unique index driver_payouts_stripe_transfer_id_idx on driver_payouts (stripe_transfer_id)
  where stripe_transfer_id is not null;

-- Serves the payout runner's "what still needs sending" query, and /drive's pending/failed list.
create index driver_payouts_unsettled_idx on driver_payouts (driver_id, created_at)
  where status in ('pending', 'failed');

-- The canonical touch-updated_at trigger, defined once in 20260821120200. This table is mutated
-- by retries and webhooks, so a last-modified trace is what makes "why is this still pending"
-- answerable. (`subscriptions` notably lacks one; not fixed here, it has no writer yet.)
create trigger driver_payouts_set_updated_at
  before update on driver_payouts
  for each row
  execute function public.set_updated_at();

alter table driver_payouts enable row level security;

create policy driver_payouts_select_own
  on driver_payouts for select
  to authenticated
  using (driver_id in (select id from drivers where auth_user_id = (select auth.uid())));

-- SELECT only, matching driver_monthly_stats exactly and for the same reason: a driver who can
-- write their own payout status could mark an unsent payout 'paid' — or, worse, an already-paid
-- one 'pending' and collect twice. Writes come from the trigger below and the service role.
grant select on driver_payouts to authenticated;
grant select, insert, update, delete on driver_payouts to service_role;

-- ---------------------------------------------------------------- the debt is recorded by the database

-- Fires on exactly the transition bump_monthly_stats already watches, and for the same reason:
-- if recording the debt were application code's job, a crashed request between "ride completed"
-- and "payout queued" would lose a driver's money with nothing to reconcile against. Here it is
-- impossible — the row is written inside the completion transaction, so a ride is completed and
-- owed for atomically, or neither.
--
-- A local INSERT, no network call: this does NOT violate ADR-0008's rule about what may sit
-- inside the critical section apply_ride_commission holds. The transfer itself happens later,
-- outside any transaction, and is allowed to fail.
--
-- SECURITY DEFINER for the same robustness reason bump_monthly_stats carries it: today every
-- rides UPDATE arrives via the service role, but the moment some future migration grants an
-- authenticated write path to rides.status, an INVOKER trigger would hit driver_payouts' RLS
-- (no INSERT policy for authenticated) and fail — breaking ride completion for everyone.
create or replace function public.queue_driver_payout()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A zero-payout ride is legal in the schema (fare_cents may be 0) but has nothing to send.
  -- Skip it rather than writing a row that violates amount_cents > 0.
  if new.driver_payout_cents is null or new.driver_payout_cents = 0 then
    return new;
  end if;

  -- ON CONFLICT DO NOTHING against driver_payouts_one_per_ride: apply_ride_commission already
  -- refuses to re-rate a completed ride, so this should be unreachable — but "should be
  -- unreachable" is not a guarantee to hang a duplicate transfer on.
  insert into driver_payouts (driver_id, ride_id, amount_cents)
  values (new.driver_id, new.id, new.driver_payout_cents)
  on conflict (ride_id) where ride_id is not null do nothing;

  return new;
end;
$$;

create trigger rides_queue_driver_payout
  after update of status on rides
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.queue_driver_payout();

-- ------------------------------------------------------------------------ Connect account state

-- Stripe's word about a driver's account, mirrored locally so /drive can render without a
-- round trip to Stripe on every page load. Written only from a signature-verified
-- account.updated webhook (or an explicit refresh), never inferred.
--
-- Neither column joins the column-level UPDATE grant below — like stripe_account_id, which has
-- been on this table since 20260821120200 and correctly excluded, these are facts about an
-- external system that a driver must not be able to assert about themselves. Claiming
-- payouts_enabled would not actually make a transfer succeed, but it would let the UI promise
-- one, and a driver-editable "I can be paid" flag is not a thing to leave lying around.
alter table drivers
  add column stripe_payouts_enabled boolean not null default false,
  add column stripe_details_submitted boolean not null default false;

comment on column drivers.stripe_account_id is
  'The driver''s Stripe Connect Express account (acct_...), created by RIDO''s server during '
  'onboarding. Null until they start. Service-role write only — see the UPDATE grant.';

comment on column drivers.stripe_payouts_enabled is
  'Stripe''s payouts_enabled for this account, synced from account.updated. The gate the payout '
  'path checks before attempting a transfer; false means onboarding is unfinished or Stripe has '
  'restricted the account.';

comment on column drivers.stripe_details_submitted is
  'Stripe''s details_submitted: the driver finished the hosted onboarding form. Can be true '
  'while payouts_enabled is false, when Stripe is still verifying — which is why /drive needs '
  'both to tell "not started" from "under review".';
