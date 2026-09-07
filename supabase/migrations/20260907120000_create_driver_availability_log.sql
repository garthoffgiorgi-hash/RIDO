-- driver_availability_log — when was a driver online, and for how long.
--
-- WHY THIS EXISTS. `drivers.accepting_rides` (20260902130000) is a current-value boolean with no
-- history, so "hours online" is unanswerable — and so is which insurance period applied at a given
-- moment, since docs/compliance/ca-tnc.md defines all three periods entirely in terms of driver
-- app-state over time. ADR-0019 recorded the gap in its own words: `true` on a driver who has not
-- opened the app in a month "claims an availability that isn't real. That claim has no reader
-- today." This table is the reader. Designed in
-- docs/decisions/0022-rider-identity-and-ratings.md §1 as tier 2; nothing here changes that design.
--
-- WHY A TRIGGER WRITES IT, when ride_declines (20260902130100) is written by the service role and
-- `accepting_rides` itself is written by the driver. ADR-0019's rule is about who may ASSERT a
-- fact — one writer forever -> column grant; possibly-many writers -> service role. This is neither:
-- nobody asserts a log entry, it is DERIVED from a state change. The repo already has one settled
-- pattern for that class, and this follows it: bump_monthly_stats, queue_driver_payout and
-- sync_driver_public_profile are all trigger-written and none is writable by authenticated.
--
-- Writing it from setAcceptingRides() under the service role would be simpler and WRONG.
-- `authenticated` holds `grant update (accepting_rides) on drivers`, so a driver can flip the flag
-- straight through PostgREST without going near that function, and the log would silently miss it.
-- A log of a column that is not app-mediated has to be written by the database or it is not a log.

create table driver_availability_log (
  -- A surrogate key, matching driver_payouts and ride_charges rather than ride_declines' composite.
  -- ride_declines' PK is a set-membership fact and its own idempotence mechanism; this is an event
  -- stream, where two rows for one driver sharing a timestamp are legal, so a composite
  -- (driver_id, changed_at) would be a unique constraint on something that is not unique.
  id uuid primary key default gen_random_uuid(),

  -- RESTRICT, not ride_declines' cascade. That table draws the line explicitly — a preference
  -- follows rider_payment_profiles, a financial record restricts — and this follows the ledgers for
  -- a compliance reason of its own: docs/compliance/ca-tnc.md defines Period 1 as "app on, no ride
  -- accepted", and this log is the ONLY record that a driver was ever in Period 1. No rides row can
  -- evidence it, by definition. A driver who accepted a ride is already undeletable
  -- (rides.driver_id restricts); this extends that to a driver who was only ever online.
  --
  -- The consequence, recorded rather than hidden: it deepens the deletion-vs-restrict gap ADR-0022
  -- §6 named on the rider side, now on the driver side too.
  driver_id uuid not null references drivers (id) on delete restrict,

  -- The state AFTER the change, named for the column it mirrors. ADR-0019 rejected `is_online` as a
  -- UI word that promises more than the column delivers; that reasoning carries here unchanged.
  accepting_rides boolean not null,

  changed_at timestamptz not null default now()
);

-- No `source` or `actor` column. There is exactly one cause today — a driver's own toggle — and
-- nothing to distinguish it from. Add one with the second cause, the way ride_charges refused a
-- speculative `kind`.

-- Driver first: every read is "this driver's history over a window", which this serves directly.
create index driver_availability_log_driver_changed_idx
  on driver_availability_log (driver_id, changed_at);

comment on table driver_availability_log is
  'Append-only history of drivers.accepting_rides — one row per change, plus one per driver at '
  'creation so the log has a floor rather than a gap. Written only by log_driver_availability(); '
  'authenticated has SELECT and nothing else. CAVEAT: a drivers row is created status = ''pending'' '
  'with accepting_rides defaulting true, so this records availability for a driver who cannot yet '
  'accept anything. That is faithful — this gives THAT COLUMN a history, not an answer to "could '
  'they have worked", which additionally needs a history of drivers.status (unbuilt, ADR-0022 '
  'tier 3). ADR-0019, ADR-0022 §1.';

-- SECURITY DEFINER is mandatory here, not future-proofing — the sync_driver_public_profile case,
-- not the bump_monthly_stats one. drivers.accepting_rides carries a live authenticated UPDATE grant
-- (20260902130000), so an invoker-security version of this trigger would run as that driver's own
-- role, hit this table's RLS (no INSERT grant to authenticated), and break the Online/Offline
-- toggle for every driver the moment this migration lands.
create or replace function public.log_driver_availability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into driver_availability_log (driver_id, accepting_rides)
  values (new.id, new.accepting_rides);
  return new;
end;
$$;

-- Two triggers, one function, because `when (... old ...)` is illegal on INSERT.
--
-- The INSERT half gives the log a floor: without it a driver who never touches the toggle has no
-- history at all, and every window over them is indistinguishable from "not yet created".
create trigger drivers_log_availability_on_insert
  after insert on drivers
  for each row
  execute function public.log_driver_availability();

-- The `when` clause is the one doing the work, and it is doing all of it. setAcceptingRides() does
-- not read the current value first, so without it a double-tapped switch writes two events and
-- invents a zero-length interval between them — and a phone-number edit would churn the log too.
--
-- `update of accepting_rides` narrows which UPDATEs even evaluate that clause. It is a cost and
-- intent scoping, not a second guarantee: with the `when` clause standing, the log's contents are
-- identical whether or not this list is here. Stated because the obvious reading is that this list
-- is what keeps a profile edit out, and it isn't — proved by inverting it and watching every
-- assertion in 023 still pass. Removing the `when` clause fails three of them.
create trigger drivers_log_availability_on_update
  after update of accepting_rides on drivers
  for each row
  when (new.accepting_rides is distinct from old.accepting_rides)
  execute function public.log_driver_availability();

-- Backfill, mirroring driver_public_profiles': the triggers above only fire on a future write, and
-- this project has real driver rows already. This records THE STATE AT THE MOMENT THE LOG BEGINS,
-- not a claim about when it began — no earlier history exists, and inventing one would be
-- fabricating a compliance record. On a database rebuilt from migrations this is a no-op; on the
-- live project it is the whole of the work.
insert into driver_availability_log (driver_id, accepting_rides)
select id, accepting_rides from drivers;

alter table driver_availability_log enable row level security;

-- Read own, write none — matching ride_declines, driver_payouts and driver_monthly_stats.
--
-- `IN (subquery)` is correct here and `exists` would be cargo-culting. 20260830120000's header
-- documents the trap precisely: the bug was rides.driver_id, which is NULLABLE, so IN evaluated to
-- NULL and RLS refused every open request. This driver_id is `not null`, so IN is an ordinary
-- two-valued comparison — which is why ride_declines_select_own and driver_monthly_stats_select_own
-- both use it against drivers.id today. ADR-0022's cross-party policies need `exists` because they
-- reach THROUGH rides.driver_id. This one reaches through nothing nullable.
create policy driver_availability_log_select_own
  on driver_availability_log for select
  to authenticated
  using (driver_id in (select id from drivers where auth_user_id = (select auth.uid())));

comment on policy driver_availability_log_select_own on driver_availability_log is
  'A driver reads their own availability history and nobody else''s. There is deliberately no write '
  'policy of any kind: log_driver_availability() is the only writer and runs SECURITY DEFINER '
  'precisely so no grant to authenticated is ever needed for it to work.';

-- Explicit, matching every table since the April 2026 platform change made the base grant opt-in.
-- SELECT only for authenticated: an append-only log that its subject can INSERT into, UPDATE or
-- DELETE from is not a log.
grant select on driver_availability_log to authenticated;
grant select, insert, update, delete on driver_availability_log to service_role;

-- The reader. Without it the log is data that answers nothing — and "hours online is unanswerable"
-- stays true, which is the whole point of the table.
--
-- SECURITY INVOKER (the absence of `security definer` is the decision): the log's own RLS is then
-- the entire access check. A driver asking about another driver reads zero rows and gets 0 — no
-- ownership check to write, and none to forget. service_role carries bypassrls, so reporting gets
-- the real figure.
--
-- No money arithmetic and no cents: seconds are not money, so root CLAUDE.md's invariant 5 and
-- packages/pricing are untouched.
create or replace function public.driver_online_seconds(
  p_driver_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  -- Deliberately NOT filtered on p_from: the state AT p_from is set by the last event BEFORE it, so
  -- filtering there would drop an interval that was already open when the window opened.
  with events as (
    select
      accepting_rides,
      changed_at,
      lead(changed_at) over (order by changed_at) as next_at
    from driver_availability_log
    where driver_id = p_driver_id
      and changed_at < p_to
  )
  -- greatest(0, ...) is set_ride_duration()'s idiom, for its own reason: not relying on clock
  -- ordering between two separately-written timestamps. coalesce(..., 0) is what makes a driver
  -- with no history in the window contribute nothing rather than NULL.
  select coalesce(sum(
    greatest(0, extract(epoch from (
      least(coalesce(next_at, p_to), p_to) - greatest(changed_at, p_from)
    )))
  )::bigint, 0::bigint)
  from events
  where accepting_rides
    and coalesce(next_at, p_to) > p_from;
$$;

comment on function public.driver_online_seconds(uuid, timestamptz, timestamptz) is
  'Seconds this driver spent with accepting_rides = true inside [p_from, p_to), clamped at both '
  'ends. SECURITY INVOKER on purpose: driver_availability_log''s RLS is the access check, so a '
  'driver asking about someone else gets 0 rather than an error. Counts availability, not '
  'employability — see the table comment.';

revoke execute on function public.driver_online_seconds(uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.driver_online_seconds(uuid, timestamptz, timestamptz)
  to authenticated, service_role;
