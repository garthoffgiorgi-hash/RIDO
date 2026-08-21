-- drivers — identity, vehicle, and compliance state. See docs/architecture/data-model.md.
--
-- Enum-shaped columns are `text` + CHECK, not native Postgres `enum` — migrations here are
-- additive-only (never edit an applied one), and extending a CHECK is a plain ALTER TABLE while
-- extending a native enum has real quirks. dmv_check_status and vehicle_inspection_status have
-- no documented values anywhere; 'pending'/'passed'/'failed' is inferred, mirroring
-- background_check_status.

create table drivers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended')),
  background_check_status text not null default 'pending'
    check (background_check_status in ('pending', 'passed', 'failed')),
  dmv_check_status text not null default 'pending'
    check (dmv_check_status in ('pending', 'passed', 'failed')),
  vehicle_inspection_status text not null default 'pending'
    check (vehicle_inspection_status in ('pending', 'passed', 'failed')),
  vehicle_inspection_date date,
  training_completed boolean not null default false,
  vehicle_make text,
  vehicle_model text,
  vehicle_year integer,
  vehicle_plate text,
  stripe_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The compliance gate (root CLAUDE.md invariant 6 / supabase/CLAUDE.md): a driver may not be
  -- status='active' unless background_check_status and vehicle_inspection_status are both
  -- 'passed'. Enforced here in the database, not just the app. Note this touches only these two
  -- columns, not dmv_check_status or training_completed — matching the invariant exactly.
  constraint drivers_activation_gate check (
    status <> 'active'
    or (background_check_status = 'passed' and vehicle_inspection_status = 'passed')
  )
);

create index drivers_status_idx on drivers (status);

-- Generic "touch updated_at" — the one canonical definition. A later table that gains its own
-- updated_at attaches this trigger; it never gets redefined per table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger drivers_set_updated_at
  before update on drivers
  for each row
  execute function public.set_updated_at();

alter table drivers enable row level security;

create policy drivers_select_own
  on drivers for select
  to authenticated
  using (auth_user_id = (select auth.uid()));

create policy drivers_update_own
  on drivers for update
  to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

-- Base table privileges, explicit rather than assumed — see commission_tiers migration for why
-- (Supabase's default-grant-on-new-table behavior is now opt-in, not guaranteed). SELECT is
-- unrestricted at the grant level; the drivers_select_own policy above is what actually scopes
-- it to one's own row.
grant select on drivers to authenticated;
grant select, insert, update, delete on drivers to service_role;

-- The row-level policy above says "your own row is updatable" — that alone isn't enough.
-- Column-level privilege is what actually stops a driver writing their own compliance/status
-- fields: without this, drivers_update_own would let a driver self-promote to status='active'
-- or flip background_check_status to 'passed'. No INSERT policy either — a signed-up user
-- can't self-insert a driver row; the initial 'pending' row is created by an admin/vetting
-- process under the service role (there is no self-serve "apply to drive" flow yet).
revoke update on drivers from authenticated;
grant update (full_name, email, phone, vehicle_make, vehicle_model, vehicle_year, vehicle_plate)
  on drivers to authenticated;
