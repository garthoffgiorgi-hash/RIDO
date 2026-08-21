-- subscriptions — the flat-fee relationship. Pilot vs steady state lives entirely in this row's
-- data (plan, flat_fee_cents, fee_active), never in a date comparison anywhere in code — the
-- turn-on is a per-driver state gated on a traction signal (ADR-0003), not a calendar check.

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers (id) on delete cascade,
  plan text not null check (plan in ('pilot', 'standard')),
  flat_fee_cents bigint not null check (flat_fee_cents >= 0),
  status text not null default 'active'
    check (status in ('active', 'past_due', 'canceled')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  fee_active boolean not null default false,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

create index subscriptions_driver_id_idx on subscriptions (driver_id);

-- Guards against a Stripe webhook retry/replay creating two concurrently "active" rows for one
-- driver, which would make fee_active/flat_fee_cents ambiguous.
create unique index subscriptions_one_active_per_driver
  on subscriptions (driver_id)
  where status = 'active';

alter table subscriptions enable row level security;

-- SELECT-only, deliberately no UPDATE policy for authenticated. A driver directly writing their
-- own plan/fee_active/flat_fee_cents/status is a revenue-integrity hole with no legitimate
-- caller — subscription state changes come from Stripe webhooks under the service role.
create policy subscriptions_select_own
  on subscriptions for select
  to authenticated
  using (driver_id in (select id from drivers where auth_user_id = (select auth.uid())));

-- Base table privileges, explicit rather than assumed (see commission_tiers migration). Only
-- SELECT for authenticated — there is no UPDATE grant, matching the "no driver-writable
-- subscription state" decision above.
grant select on subscriptions to authenticated;
grant select, insert, update, delete on subscriptions to service_role;
