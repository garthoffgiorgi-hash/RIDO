-- rider_profiles — a rider's own name and contact info, the thing RIDO has never asked for.
--
-- Rationale: docs/decisions/0022-rider-identity-and-ratings.md
--
-- WHY A TABLE AND NOT A COLUMN. Exactly rider_payment_profiles' reasoning, restated because it's
-- the precedent this migration mirrors column-for-shape: there is no `riders` table —
-- `rides.rider_id` references auth.users directly, and auth.users belongs to Supabase, not to us.
-- A rider's identity needs a home of its own.
--
-- WHY display_name IS NULLABLE. No account created before this migration has a name — /signup
-- never asked for one — and there is nothing to backfill it from. A null renders as "Your rider" in
-- the driver's current-ride card, never a blank: the same discipline root CLAUDE.md already applies
-- to money (don't render a value you can't source), carried over to identity.
--
-- WHY THIS IS CREATED LAZILY, NOT BY A TRIGGER ON auth.users. No migration in this repo touches the
-- auth schema — no handle_new_user, no alter table auth.*. rider_payment_profiles already states
-- the stance: "auth.users belongs to Supabase, not to us." ensureRiderProfile() (apps/web/src/lib/
-- riders/server.ts) follows startCardSetup()'s precedent of lazy creation on first real need.

create table rider_profiles (
  -- The rider IS the key, same reasoning as rider_payment_profiles: there is nothing to say about
  -- a rider's identity that isn't "this auth user is this person."
  rider_id uuid primary key references auth.users (id) on delete cascade,

  display_name text,
  phone text,
  avatar_url text,

  -- Maintained by ride_ratings' aggregate trigger (bump_rating_aggregate), never written directly —
  -- same posture driver_monthly_stats holds toward the completion trigger that feeds it. A rider
  -- cannot inflate their own rating any more than a driver can inflate their own MTD figure.
  rating_count integer not null default 0,
  rating_sum integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column rider_profiles.display_name is
  'What a driver sees during a live ride, and what the rider sees of themselves on /account. '
  'Nullable: no account created before this migration has one, and there is nothing to backfill.';

comment on column rider_profiles.rating_count is
  'Maintained by ride_ratings'' bump_rating_aggregate() trigger only. No write grant to '
  'authenticated exists on either column — a rider asserting their own rating would be the exact '
  'shape of the commission-fraud vector driver_monthly_stats'' RLS already refuses.';

create trigger rider_profiles_set_updated_at
  before update on rider_profiles
  for each row
  execute function public.set_updated_at();

alter table rider_profiles enable row level security;

create policy rider_profiles_select_own
  on rider_profiles for select
  to authenticated
  using (rider_id = (select auth.uid()));

-- The cross-party read this table exists to grant. `exists`, never `driver_id IN (subquery)` —
-- 20260830120000_enable_driver_accept.sql's header documents why: a nullable driver_id compared
-- with IN evaluates to NULL under three-valued logic, and RLS treats anything that isn't TRUE as a
-- refusal. `exists` returns a real boolean over an empty set regardless of nullability, which is
-- what a policy governing a NULLABLE rides.driver_id needs.
--
-- Scoped to 'accepted'/'in_progress' — the same two statuses rides_one_active_per_driver covers.
-- Visibility ends the moment the ride completes or cancels; there is no persisted "who has ridden
-- with whom" beyond a completed ride's own rating.
create policy rider_profiles_select_as_active_driver
  on rider_profiles for select
  to authenticated
  using (
    exists (
      select 1 from rides r
      join drivers d on d.id = r.driver_id
      where r.rider_id = rider_profiles.rider_id
        and d.auth_user_id = (select auth.uid())
        and r.status in ('accepted', 'in_progress')
    )
  );

comment on policy rider_profiles_select_as_active_driver on rider_profiles is
  'A driver reads their current rider''s name for the duration of the ride they share, and nothing '
  'before or after it. The mirror is driver_public_profiles_select_as_active_rider. See '
  'docs/decisions/0022-rider-identity-and-ratings.md.';

create policy rider_profiles_update_own
  on rider_profiles for update
  to authenticated
  using (rider_id = (select auth.uid()))
  with check (rider_id = (select auth.uid()));

-- Explicit, matching every table since the April 2026 platform change made the base grant opt-in.
-- The UPDATE grant is column-scoped: display_name/phone/avatar_url are a rider's own word about
-- themselves (ADR-0019's rule — one writer forever -> column grant), but rating_count/rating_sum
-- stay out of it. A table-level `grant update` here would silently let a rider inflate their own
-- rating; the policy's USING/WITH CHECK cannot see that distinction, only the grant can.
grant select on rider_profiles to authenticated;
grant update (display_name, phone, avatar_url) on rider_profiles to authenticated;
grant select, insert, update, delete on rider_profiles to service_role;
