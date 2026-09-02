-- ride_declines — which open requests a driver has waved off, so the board stops showing them.
--
-- WHY THIS EXISTS. Until now a driver's only way to refuse a request was to not tap Accept, which
-- leaves it on their board forever competing for attention with work they actually want. ADR-0013
-- deferred decline because there was "no reason yet to refuse one request in favor of scanning for
-- another"; with a real pool and real money there now is. Rationale:
-- docs/decisions/0019-driver-controls-their-own-queue.md
--
-- WHAT A DECLINE IS NOT. It does not touch the ride. The row stays `'requested'` with a null
-- `driver_id`, stays in the open pool, and stays visible to every other driver — declining is one
-- driver's opinion, never a withdrawal of a rider's request. That is also why declining a ride
-- another driver is simultaneously accepting is inert rather than an error: the row only ever
-- filters a pool that ride has already left, so declineRide() needs no defensive status check.
--
-- WHY THE SERVICE ROLE WRITES IT, when `drivers.accepting_rides` (20260902130000) is written by the
-- driver directly. Same rule, opposite answer: one writer forever -> column grant; possibly-many
-- writers -> service role. Availability is a statement only a driver can make. A decline has
-- plausible future writers that are not the driver — auto-decline on a dispatch timeout, an admin
-- clearing a driver's declines, a "decline everything while offline" convenience. Granting
-- `authenticated` INSERT now would have to be walked back later, and would be this repo's first
-- authenticated write grant on a rides-adjacent table.

create table ride_declines (
  -- CASCADE, not restrict. driver_payouts and ride_charges restrict because they are financial
  -- records that must block deleting what they point at; this is a preference, so it follows
  -- rider_payment_profiles instead. It is also what keeps un-declining trivially addable later:
  -- deleting a preference row is a normal operation in a way that deleting a ledger row is not.
  driver_id uuid not null references drivers (id) on delete cascade,
  ride_id uuid not null references rides (id) on delete cascade,
  declined_at timestamptz not null default now(),

  -- Driver first, deliberately: every read is "which of these rides has THIS driver declined", so
  -- `where driver_id = ? and ride_id in (...)` is served directly by this index. It is also the
  -- idempotence mechanism — a re-decline is `on conflict do nothing`, the same idiom
  -- queue_driver_payout uses for a re-fired trigger.
  primary key (driver_id, ride_id)
);

-- No index on ride_id alone, deliberately. Nothing queries "who declined this ride", and the only
-- cascade that would want one fires on ride deletion, which never happens — rides are an accounting
-- record. Don't add one reflexively.

comment on table ride_declines is
  'One row per (driver, ride) a driver has declined. Hides that request from that driver''s board '
  'permanently; the ride itself is untouched and stays in the pool for everyone else. No expiry '
  'and no sweep — this table grows with the cascade from rides as its only reaper, which is why '
  'the open-pool read scopes its lookup to the candidate rides rather than a driver''s whole '
  'history. ADR-0019.';

alter table ride_declines enable row level security;

-- Read own, write none — matching driver_payouts, ride_charges and driver_monthly_stats.
create policy ride_declines_select_own
  on ride_declines for select
  to authenticated
  using (driver_id in (select id from drivers where auth_user_id = (select auth.uid())));

comment on policy ride_declines_select_own on ride_declines is
  'A driver reads their own declines and nobody else''s. There is deliberately no write policy: '
  'the insert goes through the service role from declineRide(), per ADR-0019.';

-- Explicit, because Supabase's default grant to anon/authenticated/service_role on new public
-- tables became an opt-in project setting in April 2026. RLS only matters once a role can reach the
-- table at all.
grant select on ride_declines to authenticated;
grant select, insert, update, delete on ride_declines to service_role;
