-- rides — one row per ride. Commission is snapshotted here at completion and never recomputed
-- (root CLAUDE.md invariant 2; docs/architecture/ride-completion.md).
--
-- rider_id references auth.users directly — no `riders` table exists or is planned; this
-- mirrors drivers.auth_user_id.
--
-- No INSERT/UPDATE policy for `authenticated` at all, on purpose. The booking flow doesn't
-- exist yet (/request is a placeholder), so there's no real transition logic — fare
-- verification, driver-accept eligibility — to encode into a policy. Every write goes through
-- the service role until the booking flow ships its own migration with the RLS it actually
-- needs. This also satisfies "commission columns are writable only by the service role" for
-- free, today: nothing authenticated can write to this table at all yet.

create table rides (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references auth.users (id) on delete restrict,
  driver_id uuid not null references drivers (id) on delete restrict,
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'in_progress', 'completed', 'canceled')),
  fare_cents bigint not null check (fare_cents >= 0),
  commission_rate_bps integer check (commission_rate_bps between 0 and 10000),
  commission_cents bigint check (commission_cents >= 0),
  driver_payout_cents bigint check (driver_payout_cents >= 0),
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  -- Commission fields exist iff the ride is completed — catches "marked completed but forgot
  -- to snapshot" and "snapshot fields set on a non-completed ride" as hard database errors.
  constraint rides_commission_present_iff_completed check (
    (status = 'completed'
      and commission_rate_bps is not null
      and commission_cents is not null
      and driver_payout_cents is not null)
    or
    (status <> 'completed'
      and commission_rate_bps is null
      and commission_cents is null
      and driver_payout_cents is null)
  ),

  -- The exactness invariant from ride-completion.md, enforced by the database itself, not just
  -- asserted in packages/pricing's tests: commission + payout === fare, always.
  constraint rides_commission_sums_to_fare check (
    commission_cents is null or (commission_cents + driver_payout_cents = fare_cents)
  )
);

create index rides_driver_id_idx on rides (driver_id);
create index rides_rider_id_idx on rides (rider_id);

-- Write-once enforcement: once the three commission columns are set, no UPDATE may change them
-- — not a tier change, not a backfill, not a "correction" (a correction is a new adjustment
-- row, not an edit — ride-completion.md). A CHECK constraint can't see OLD vs NEW, so this
-- needs a trigger.
create or replace function public.prevent_commission_rewrite()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.commission_cents is not null
     and (new.commission_rate_bps is distinct from old.commission_rate_bps
       or new.commission_cents is distinct from old.commission_cents
       or new.driver_payout_cents is distinct from old.driver_payout_cents) then
    raise exception 'rides.commission_* is write-once: ride % already has a snapshot', old.id;
  end if;
  return new;
end;
$$;

create trigger rides_prevent_commission_rewrite
  before update on rides
  for each row
  execute function public.prevent_commission_rewrite();

alter table rides enable row level security;

create policy rides_select_own_as_rider
  on rides for select
  to authenticated
  using (rider_id = (select auth.uid()));

create policy rides_select_own_as_driver
  on rides for select
  to authenticated
  using (driver_id in (select id from drivers where auth_user_id = (select auth.uid())));

-- Base table privileges, explicit rather than assumed (see commission_tiers migration). Only
-- SELECT for authenticated — no INSERT/UPDATE grant, matching the "all writes via service
-- role, for now" decision above.
grant select on rides to authenticated;
grant select, insert, update, delete on rides to service_role;
