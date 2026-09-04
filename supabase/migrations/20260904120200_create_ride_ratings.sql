-- ride_ratings — one row per (ride, direction), rider rating driver or driver rating rider. The
-- data behind the `rate` state brand/design-system.md's rider blueprint has named since before this
-- migration and nothing has ever been able to build.
--
-- Rationale: docs/decisions/0022-rider-identity-and-ratings.md
--
-- WHY rater_id/ratee_id REFERENCE auth.users, NOT drivers.id. A rating identifies a PERSON, the
-- same thing rides.rider_id already does. drivers.id is a row in a domain table, not a person — a
-- driver's person-identity is drivers.auth_user_id. Keeping both columns uniformly auth.users means
-- this table never has to know whether a driver is currently acting as a driver or (in principle)
-- also a rider; it only ever records who rated whom.
--
-- WHY on delete restrict, LIKE driver_payouts AND ride_charges, NOT cascade LIKE ride_declines. A
-- rating is a record of what happened, not a preference — ride_declines' own migration draws
-- exactly this line ("this is a preference, so it follows rider_payment_profiles instead").
-- A rating follows the ledger tables instead.
--
-- WHY NO INSERT GRANT TO authenticated. Every write in this repo except two narrow column grants
-- (drivers.accepting_rides, rider_profiles' own display fields — ADR-0019's rule) goes through the
-- service role. A rating is not a one-writer-forever fact about yourself; it is a claim about
-- someone else, which is exactly the shape ADR-0019 sends to the service role.

create table ride_ratings (
  id uuid primary key default gen_random_uuid(),

  ride_id uuid not null references rides (id) on delete restrict,
  rater_id uuid not null references auth.users (id) on delete restrict,
  ratee_id uuid not null references auth.users (id) on delete restrict,

  direction text not null
    check (direction in ('rider_rates_driver', 'driver_rates_rider')),

  stars smallint not null check (stars between 1 and 5),
  comment text,

  created_at timestamptz not null default now(),

  -- One rating per person per ride. A ride can carry at most two rows (one per direction), never
  -- two from the same rater — the app's own retry-safety, enforced where a race could otherwise
  -- double-count into the aggregate below.
  unique (ride_id, rater_id)
);

comment on table ride_ratings is
  'Two-directional ride ratings. Written only by the service role after completion; the two '
  'triggers below refuse a rating on anything but the ride''s own completed rider/driver pair, and '
  'roll it into driver_public_profiles or rider_profiles'' aggregate. ADR-0022.';

create index ride_ratings_ratee_idx on ride_ratings (ratee_id);

-- Verifies the rating is legitimate before it can ever be written: the ride is completed, and the
-- rater/ratee pair matches that ride's own rider and driver for the claimed direction. This is
-- defense in depth, not the only gate — the caller is expected to check the same thing before
-- calling — the same posture root CLAUDE.md invariant 6 already takes toward the compliance gate:
-- enforce in the database, not just the app.
--
-- SECURITY DEFINER for the same forward-compatibility reason bump_monthly_stats' comment gives:
-- currently redundant, since only the service role (which bypasses RLS regardless) ever reaches
-- this INSERT — but a future authenticated write path to this table would otherwise make this
-- trigger run as that caller's own role, hit rides'/drivers' RLS, and fail unpredictably.
create or replace function public.validate_ride_rating()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_rider_id uuid;
  v_driver_auth_id uuid;
begin
  select r.status, r.rider_id, d.auth_user_id
    into v_status, v_rider_id, v_driver_auth_id
  from rides r
  join drivers d on d.id = r.driver_id
  where r.id = new.ride_id;

  if v_status is distinct from 'completed' then
    raise exception 'ride_ratings: ride % is not completed — nothing to rate yet', new.ride_id;
  end if;

  if new.direction = 'rider_rates_driver'
     and (new.rater_id is distinct from v_rider_id or new.ratee_id is distinct from v_driver_auth_id)
  then
    raise exception 'ride_ratings: rider_rates_driver must be rated by ride %''s own rider, of its own driver', new.ride_id;
  end if;

  if new.direction = 'driver_rates_rider'
     and (new.rater_id is distinct from v_driver_auth_id or new.ratee_id is distinct from v_rider_id)
  then
    raise exception 'ride_ratings: driver_rates_rider must be rated by ride %''s own driver, of its own rider', new.ride_id;
  end if;

  return new;
end;
$$;

create trigger ride_ratings_validate
  before insert on ride_ratings
  for each row
  execute function public.validate_ride_rating();

-- Rolls the new rating into the ratee's public aggregate — the same "insert into ... on conflict do
-- update" idiom bump_monthly_stats uses, chosen for the driver side because driver_public_profiles
-- is guaranteed to exist (backfilled and trigger-maintained for every drivers row). The rider side
-- upserts instead: rider_profiles is created lazily, so the ratee's row may not exist yet the first
-- time someone rates them.
create or replace function public.bump_rating_aggregate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.direction = 'rider_rates_driver' then
    update driver_public_profiles
    set rating_count = rating_count + 1,
        rating_sum = rating_sum + new.stars
    where driver_id = (select id from drivers where auth_user_id = new.ratee_id);
  else
    insert into rider_profiles (rider_id, rating_count, rating_sum)
    values (new.ratee_id, 1, new.stars)
    on conflict (rider_id) do update set
      rating_count = rider_profiles.rating_count + 1,
      rating_sum = rider_profiles.rating_sum + new.stars;
  end if;
  return new;
end;
$$;

create trigger ride_ratings_bump_aggregate
  after insert on ride_ratings
  for each row
  execute function public.bump_rating_aggregate();

alter table ride_ratings enable row level security;

-- Read own submissions only — not what was said about you. Aggregate rating and count are already
-- public via driver_public_profiles/rider_profiles; the individual comment attached to one ride is
-- not, so a ratee cannot map a low score back to a specific rider or driver. Nothing in tier 1
-- renders an individual rating row at all; this policy exists so the boundary is decided now rather
-- than defaulted into later.
create policy ride_ratings_select_own_as_rater
  on ride_ratings for select
  to authenticated
  using (rater_id = (select auth.uid()));

comment on policy ride_ratings_select_own_as_rater on ride_ratings is
  'A rater reads what they submitted. There is deliberately no ratee-side read policy: the '
  'aggregate is public via driver_public_profiles/rider_profiles, the individual comment is not. '
  'See docs/decisions/0022-rider-identity-and-ratings.md.';

grant select on ride_ratings to authenticated;
grant select, insert, update, delete on ride_ratings to service_role;
