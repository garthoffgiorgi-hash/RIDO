-- Ride lifecycle — the accepted -> in_progress -> completed transition, and the app's first-ever
-- call to complete-ride. Rationale: docs/decisions/0014-app-calls-complete-ride.md
--
-- `apply_ride_commission` has accepted 'in_progress' as completable since it was written
-- (COMPLETABLE_STATUSES in supabase/functions/complete-ride/core.ts), and both partial unique
-- indexes on rides (rides_one_active_per_rider, rides_one_active_per_driver) already span
-- 'accepted' and 'in_progress' identically. So this transition needs no change to either index
-- and no redeploy of complete-ride — only a truth for the column that transition writes.

-- started_at has existed since 20260825120000 but nothing has ever written it. This is the
-- in_progress half of what rides_commission_present_iff_completed already does for completion:
-- the state and the column it implies move together, enforced in the database rather than by
-- convention. Deliberately says nothing about 'completed' — apply_ride_commission still accepts a
-- ride straight from 'accepted' with no started_at, and constraining that here would break a path
-- the function legitimately allows.
alter table rides add constraint rides_started_at_present_iff_in_progress check (
  status <> 'in_progress' or started_at is not null
);

-- duration_seconds (ADR-0011: completed_at - started_at) was underivable until started_at could
-- be written. A BEFORE trigger on the same status transition bump_monthly_stats watches for keeps
-- this out of apply_ride_commission, which is the critical section (ADR-0008) and does not grow a
-- responsibility for a non-money column. greatest(0, ...) guards duration_seconds's own
-- >= 0 check rather than relying on clock monotonicity between two separately-written timestamps.
create or replace function public.set_ride_duration()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.started_at is not null and new.completed_at is not null then
    new.duration_seconds := greatest(0, extract(epoch from (new.completed_at - new.started_at))::integer);
  end if;
  return new;
end;
$$;

-- BEFORE, not AFTER: this sets a column on the row being written, which only a BEFORE trigger can
-- do. CHECK constraints evaluate after BEFORE triggers finish, so the result is still checked
-- against duration_seconds >= 0. A ride completed straight from 'accepted' has no started_at, so
-- the `if` above leaves duration_seconds null, matching the existing "unknown until a driver app
-- exists" posture rather than inventing a number.
create trigger rides_set_duration
  before update of status on rides
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.set_ride_duration();

comment on column rides.started_at is
  'Set once, on the accepted -> in_progress transition. Required whenever status = ''in_progress'' '
  '(rides_started_at_present_iff_in_progress) but never required at completion — a ride may '
  'complete straight from ''accepted'' with no started_at, per complete-ride''s '
  'COMPLETABLE_STATUSES.';
