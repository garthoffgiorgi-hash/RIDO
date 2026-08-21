-- commission_tiers — configuration, not code. A rate change is a row change, not a deploy.
-- Rationale and the rejected cliff alternative: docs/decisions/0002-bracketed-per-ride-commission.md
-- Runtime values: supabase/seed/commission_tiers.sql (locked to the exact column set and the
-- unique (tier_order, effective_from) constraint below — its ON CONFLICT target depends on it).
--
-- Deliberately no "bands are gapless and non-overlapping" constraint here — that's
-- normalizeTiers()'s job in packages/pricing/src/tiers.ts at read time (root CLAUDE.md
-- invariant 5: money math lives in packages/pricing and nowhere else, SQL included).

create table commission_tiers (
  id                 uuid primary key default gen_random_uuid(),
  tier_order         integer not null,
  lower_bound_cents  bigint not null,
  upper_bound_cents  bigint,
  rate_bps           integer not null,
  active             boolean not null default true,
  effective_from     date not null,

  constraint commission_tiers_tier_order_effective_from_key
    unique (tier_order, effective_from),
  constraint commission_tiers_tier_order_positive
    check (tier_order > 0),
  constraint commission_tiers_lower_bound_nonneg
    check (lower_bound_cents >= 0),
  constraint commission_tiers_bounds_ordered
    check (upper_bound_cents is null or upper_bound_cents > lower_bound_cents),
  constraint commission_tiers_rate_bps_range
    check (rate_bps >= 0 and rate_bps <= 10000)
);

alter table commission_tiers enable row level security;

-- Every signed-in user can read the current rates (drivers see "you keep $X (Y%)" before
-- accepting). No write policy for anyone — service_role bypasses RLS entirely, so a rate
-- change stays a row edit via the dashboard or a service-role script, never the app.
create policy commission_tiers_select_authenticated
  on commission_tiers for select
  to authenticated
  using (true);

-- Base table privileges, explicit rather than assumed. Supabase used to grant these to
-- anon/authenticated/service_role by default on every new table; as of an April 2026 platform
-- change that's now an opt-in project setting ("Automatically expose new tables"), not a
-- guarantee. RLS only matters once a role can reach the table at all, so this is granted here
-- rather than left to depend on a setting this migration can't see.
grant select on commission_tiers to authenticated;
grant select, insert, update, delete on commission_tiers to service_role;
