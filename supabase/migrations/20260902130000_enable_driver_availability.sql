-- A driver decides when they are taking work, and says so themselves.
--
-- WHY THIS EXISTS. `/drive` has had exactly one lever since ADR-0013: Accept. ADR-0013 deferred a
-- toggle on the reasoning that "availability means little while drivers pull from a list rather
-- than dispatch pushing to them" — still true, and still not the whole story. The marketing site
-- has promised "flip on, drive on your terms, no forced hours" since launch, and a driver has had
-- no way to state that intent or have the server honour it. Full rationale:
-- docs/decisions/0019-driver-controls-their-own-queue.md
--
-- WHY THIS COLUMN IS DRIVER-WRITABLE AND `status` IS NOT. The column-level UPDATE grant below has
-- existed since 20260821120200 to separate facts a driver owns about themselves (their phone, their
-- plate) from facts they must not assert (their background check, their Stripe state). The payouts
-- migration stated the test when it kept the `stripe_*` columns out: those are "facts about an
-- external system that a driver must not be able to assert about themselves." Availability is the
-- mirror image — a statement of intent that ONLY the driver can ever truthfully make. Hence the
-- rule ADR-0019 contributes: one writer forever -> column grant; possibly-many writers -> service
-- role. `ride_declines` (20260902130100) lands on the other side of that same rule.
--
-- Writing it through the grant rather than the service role buys a guarantee the service role
-- cannot: the database itself ensures a driver can only ever flip THEIR OWN flag, even if
-- setAcceptingRides() is later refactored and forgets to scope its `where`.

alter table drivers add column accepting_rides boolean not null default true;

-- DEFAULT TRUE, deliberately. Opt-in has safety value when being opted IN does something to you —
-- a notification, an obligation, a queue that pushes work at you. None of those exist yet: being
-- "online" today does nothing but un-grey a button on a page the driver is already looking at. So
-- `false` would buy no safety and cost a silent regression — every existing driver's Accept stops
-- working, with no notification, until they find a control they have never seen. `true` is a
-- catalog-only change (no table rewrite) and makes the deploy behaviour-preserving: this feature
-- only ever REMOVES capability, and only when a driver asks it to.
--
-- The honest cost, recorded rather than hidden: `true` on a driver who has not opened the app in a
-- month claims an availability that isn't real. That claim has no reader today — nothing consumes
-- this flag but that driver's own accept path. Dispatch is what gives it one, and dispatch is when
-- to revisit this default.
comment on column drivers.accepting_rides is
  'Whether this driver is currently willing to accept new rides. The UI calls it Online/Offline. '
  'It gates ACCEPTING ONLY — an offline driver still sees the whole open board (deliberate, '
  'ADR-0019) and still starts and completes a ride they already hold. Written by the driver '
  'themselves through the column grant below, never by the service role.';

-- Additive, and it must stay additive. A future `grant update on drivers to authenticated` with no
-- column list would silently erase every protection the comment at 20260821120200:83-88 describes —
-- compliance columns and Stripe state included. Add columns to this list one at a time, or not at
-- all.
grant update (accepting_rides) on drivers to authenticated;

-- Note for whoever reads `drivers.updated_at` next: `drivers_set_updated_at` fires on every toggle,
-- so that column now churns with availability rather than tracking profile edits alone.
