-- Ride requests — the shape change a rider booking flow needs.
--
-- Every row assumed a ride had a driver from the moment it existed: `driver_id` was `not null`
-- from the first migration, and every fixture inserted 'requested' WITH a driver already bound.
-- That was fine while nothing created a ride — there was no "requested, awaiting a driver" state
-- to represent. There is now. Rationale: docs/decisions/0012-rider-books-server-owns-the-write.md
--
-- Three additive changes, matching how commission_tiers and fare_rate_cards handle a rule
-- change: a row or a new constraint, never an edit to what's already applied.

-- 1. A ride may exist before a driver accepts it.
alter table rides alter column driver_id drop not null;

-- 2. The constraint expresses the state machine, the same way
-- rides_commission_present_iff_completed expresses it for the completion side. A driver may be
-- absent only while nobody has taken the ride yet, or once it's been called off with nobody
-- having accepted — every other status requires one.
alter table rides add constraint rides_driver_present_unless_pending check (
  driver_id is not null or status in ('requested', 'canceled')
);

-- 3. One live ride per rider, guaranteed by the database rather than an app-level check that
-- races under a concurrent second request. Partial, not a full unique index — a rider with three
-- completed rides and one canceled one is normal; two rides simultaneously 'requested' is a bug.
create unique index rides_one_active_per_rider on rides (rider_id)
  where status in ('requested', 'accepted', 'in_progress');

-- Cancellation is a first-class event, not an inferred one. The existing lifecycle timestamps
-- (requested_at, accepted_at, started_at, completed_at) are the temporal half of the demand data
-- ADR-0011 established as free and terms-clean; "canceled, but we don't know when" throws away
-- exactly the signal that makes cancellations analysable.
alter table rides add column canceled_at timestamptz;

comment on column rides.driver_id is
  'Null while a ride is requested and unassigned, or after it is canceled with nobody having '
  'accepted. Every other status requires a driver — enforced by '
  'rides_driver_present_unless_pending, not just convention.';

comment on column rides.canceled_at is
  'When a rider canceled the ride, or null if it never was. A ride is never un-canceled, so this '
  'is set at most once in practice even without a write-once trigger the way the commission '
  'columns need one.';
