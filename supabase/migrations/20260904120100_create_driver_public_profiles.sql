-- driver_public_profiles — the safe, rider-visible slice of a driver. Never grant a rider a read
-- policy on `drivers` itself: that table also carries stripe_account_id, stripe_payouts_enabled,
-- background_check_status and dmv_check_status, and Postgres RLS is row-level — it cannot restrict
-- columns on SELECT. This table is safe by construction instead of by remembering to project.
--
-- Rationale: docs/decisions/0022-rider-identity-and-ratings.md
--
-- WHY A TRIGGER-MAINTAINED PROJECTION RATHER THAN A VIEW. A view re-derives on every read and still
-- needs its own RLS story (security_invoker vs security_barrier, and which underlying grants it
-- exposes). A projection kept in sync by trigger is a table with its own policies — the same shape
-- driver_monthly_stats already is for `rides`, one source of truth, one safe read, decided once
-- rather than re-audited on every column `drivers` ever gains.

create table driver_public_profiles (
  driver_id uuid primary key references drivers (id) on delete cascade,

  display_name text not null,
  vehicle_description text,
  vehicle_plate text,

  -- Maintained by ride_ratings' aggregate trigger only — see rider_profiles' identical columns for
  -- the reasoning. No write grant to authenticated exists on this table at all; see below.
  rating_count integer not null default 0,
  rating_sum integer not null default 0,

  updated_at timestamptz not null default now()
);

comment on table driver_public_profiles is
  'The rider-safe projection of drivers: display name, vehicle as shown, and rating. Kept in sync '
  'by sync_driver_public_profile() on drivers, and by ride_ratings'' aggregate trigger. No INSERT/'
  'UPDATE grant to authenticated anywhere on this table — every column here is either mirrored from '
  'a table a driver cannot self-edit into fiction, or a rating only the aggregate trigger may touch.';

create trigger driver_public_profiles_set_updated_at
  before update on driver_public_profiles
  for each row
  execute function public.set_updated_at();

-- Mirrors drivers into its public projection on every relevant change. SECURITY DEFINER is not
-- optional here the way bump_monthly_stats' comment treats it as future-proofing: drivers.
-- accepting_rides already carries a live authenticated UPDATE grant (20260902130000), so an
-- ordinary-security version of this trigger would run as that driver's own role, hit this table's
-- RLS (no INSERT/UPDATE grant to authenticated), and break the Online/Offline toggle for every
-- driver the moment this migration lands.
--
-- `update of <columns>` scopes which UPDATEs re-fire it — a status or accepting_rides toggle
-- shouldn't churn this row. INSERT always fires regardless of that list.
create or replace function public.sync_driver_public_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into driver_public_profiles (driver_id, display_name, vehicle_description, vehicle_plate)
  values (
    new.id,
    new.full_name,
    nullif(concat_ws(' ', new.vehicle_year::text, new.vehicle_make, new.vehicle_model), ''),
    new.vehicle_plate
  )
  on conflict (driver_id) do update set
    display_name = excluded.display_name,
    vehicle_description = excluded.vehicle_description,
    vehicle_plate = excluded.vehicle_plate,
    updated_at = now();
  return new;
end;
$$;

create trigger drivers_sync_public_profile
  after insert or update of full_name, vehicle_make, vehicle_model, vehicle_year, vehicle_plate
  on drivers
  for each row
  execute function public.sync_driver_public_profile();

-- Backfill. Every driver row created before this migration needs a projection too — the trigger
-- above only fires on a future insert or update, and this project has real driver rows already.
-- ON CONFLICT DO NOTHING is defensive, not load-bearing: nothing can race this statement inside its
-- own migration transaction.
insert into driver_public_profiles (driver_id, display_name, vehicle_description, vehicle_plate)
select
  id,
  full_name,
  nullif(concat_ws(' ', vehicle_year::text, vehicle_make, vehicle_model), ''),
  vehicle_plate
from drivers
on conflict (driver_id) do nothing;

alter table driver_public_profiles enable row level security;

create policy driver_public_profiles_select_own
  on driver_public_profiles for select
  to authenticated
  using (driver_id in (select id from drivers where auth_user_id = (select auth.uid())));

-- The mirror of rider_profiles_select_as_active_driver. `exists`, same reasoning: driver_id here is
-- rides.driver_id, nullable while a ride is 'requested', so IN (subquery) would carry the same
-- three-valued-logic trap the open-pool policy already hit once.
create policy driver_public_profiles_select_as_active_rider
  on driver_public_profiles for select
  to authenticated
  using (
    exists (
      select 1 from rides r
      where r.driver_id = driver_public_profiles.driver_id
        and r.rider_id = (select auth.uid())
        and r.status in ('accepted', 'in_progress')
    )
  );

comment on policy driver_public_profiles_select_as_active_rider on driver_public_profiles is
  'A rider reads their current driver''s name, vehicle and rating for the duration of the ride they '
  'share, and nothing before or after it. See docs/decisions/0022-rider-identity-and-ratings.md.';

-- Explicit, matching every table since the April 2026 platform change made the base grant opt-in.
-- SELECT only, to both roles that can read it at all — no INSERT/UPDATE/DELETE grant to
-- authenticated exists: this table has exactly one writer, sync_driver_public_profile(), and it
-- runs SECURITY DEFINER precisely so no grant to authenticated is ever needed for it to work.
grant select on driver_public_profiles to authenticated;
grant select, insert, update, delete on driver_public_profiles to service_role;
