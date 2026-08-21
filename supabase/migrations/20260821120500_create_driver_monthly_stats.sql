-- driver_monthly_stats — per-driver, per-month rollup. Powers the commission tier lookup, so a
-- driver-writable MTD figure would be a direct commission-fraud vector: no write policy for
-- authenticated at all. Trigger-maintained only, from 20260821120800.

create table driver_monthly_stats (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers (id) on delete cascade,
  year_month text not null check (year_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  rides_count integer not null default 0 check (rides_count >= 0),
  gross_fare_cents bigint not null default 0 check (gross_fare_cents >= 0),
  commission_cents bigint not null default 0 check (commission_cents >= 0),
  payout_cents bigint not null default 0 check (payout_cents >= 0),
  updated_at timestamptz not null default now(),

  constraint driver_monthly_stats_driver_id_year_month_key unique (driver_id, year_month),
  constraint driver_monthly_stats_sums_to_gross
    check (commission_cents + payout_cents = gross_fare_cents)
);

alter table driver_monthly_stats enable row level security;

create policy driver_monthly_stats_select_own
  on driver_monthly_stats for select
  to authenticated
  using (driver_id in (select id from drivers where auth_user_id = (select auth.uid())));

-- Base table privileges, explicit rather than assumed (see commission_tiers migration). Only
-- SELECT for authenticated — writes happen exclusively via the SECURITY DEFINER rollup
-- trigger (20260821120800), which runs as its owner regardless of these grants; service_role
-- gets full access for direct admin/reporting queries.
grant select on driver_monthly_stats to authenticated;
grant select, insert, update, delete on driver_monthly_stats to service_role;
