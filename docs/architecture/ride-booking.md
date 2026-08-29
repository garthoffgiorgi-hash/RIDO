# Ride booking — rider and driver

*Sibling to `ride-completion.md`: that file is the write nobody but a driver or the service role
ever makes. This file now covers both halves of getting a ride to `'accepted'` — the rider's
booking write and the driver's accept write; both go through the service role, neither through an
RLS write policy. Tables: `data-model.md`. Why booking is shaped this way:
`../decisions/0012-rider-books-server-owns-the-write.md`. Why accept is shaped this way:
`../decisions/0013-driver-accepts-one-row-one-update.md`.*

**Status: both halves built.** `src/lib/rides/`, `/request` (rider), `/drive` (driver). Not built:
online/offline toggle, MTD tier-progress visualization, realtime (the rider learns of an accept on
reload, not live), driver decline, `started_at`/`in_progress`, dispatch or proximity matching.

## The rider flow

1. **Name two places.** `PlaceSearch` (public token, browser-side — naming isn't money, ADR-0010)
   turns text into `Place`s with coordinates. Nothing written yet.
2. **Quote.** `quoteRideRequest()` calls `measureRoute()` then `quoteRide()` — the same two
   server-only reads `/dev/maps` proved — and returns a `RideQuote`. Still nothing written; this
   runs again every time the pickup or dropoff changes.
3. **Confirm.** `requestRide(pickup, dropoff, shownFareCents)` **re-measures and re-quotes from
   scratch**, ignoring what the browser is holding except to compare against it.
   - Fresh fare equals `shownFareCents` → insert. `driver_id: null`, `status: 'requested'`,
     addresses stored, coordinates left null (ADR-0011).
   - Fresh fare disagrees → nothing is written. The new quote comes back; the rider re-confirms.
   - Either way, the number that reaches the row is always the one computed in this step, never
     the one the argument carries.
4. **Cancel**, while `status = 'requested'`: `cancelRide()` re-checks ownership and cancellability
   against the database, not against whether the button happened to be rendered, then writes
   `status = 'canceled'`, `canceled_at = now()` through the service role.

`getActiveRide()` reads the rider's one live ride (if any) through the RLS-scoped client —
`rides_select_own_as_rider` already permits it, so no service role is needed for that path. It
runs server-side on every page load, so a reload lands back on a live request rather than a blank
form.

## Why the server re-quotes instead of trusting the browser

`fare_cents` is `not null`: a row cannot exist without a price, and the price cannot come from the
client — that is the whole point of ADR-0010. `shownFareCents` is not an exception carved into
that rule; it is compared, never stored. A rider on a slow connection, a stale tab, or a tampered
request can only ever cause a spurious re-confirm or fail to catch a real price change — never
move the number that gets written by a single cent.

## Why no RLS write policy

`rides` has zero `INSERT`/`UPDATE` grants for `authenticated`, and this PR adds none. Every write
in this flow goes through `createServiceRoleClient()`, gated by `requireUser()` inside the
function that performs it — the same shape `complete-ride` already uses for the driver side. A
column-scoped policy was the alternative and was rejected: it would mean a rider's own client
constructs the `fare_cents` field of an insert payload, which is precisely the exposure ADR-0010
closed on the measuring side. See ADR-0012 for the full reasoning.

## One ride at a time, enforced by the database — the rider side

`rides_one_active_per_rider` — a partial unique index on `rider_id` where `status in ('requested',
'accepted', 'in_progress')` — is what actually stops a second concurrent request, not an
application-level check. Two requests racing each other hit the constraint; the loser's insert
fails with `23505`, surfaced to the rider as "you already have a ride in progress" rather than a
raw database error.

## The driver flow

1. **List the open pool.** `listOpenRequests(driver)` reads every `'requested'`, unassigned ride
   through the RLS-scoped client — `rides_select_open_requests_as_active_driver` (ADR-0013) is
   what makes this return anything at all, and only for an active driver. Each candidate is priced
   with what THIS driver would keep: `commissionForRide` fed the active tiers
   (`active_commission_tiers()`) and this driver's month-to-date gross (`driver_monthly_stats`,
   read directly, not the service-role-only `driver_month_to_date()` RPC), read **once** and
   applied to every candidate — they're alternatives, not a sequence.
2. **Accept.** `acceptRide(rideId)` resolves the caller's driver profile, pre-flight-checks it with
   `canAcceptRide()` (`apps/web/src/lib/rides/accept.ts`, pure — compliance before ride state,
   mirroring `supabase/functions/complete-ride/core.ts`'s ordering), then issues one conditional `UPDATE … WHERE status =
   'requested' AND driver_id IS NULL` through the service role. That `WHERE` clause, not the
   pre-flight check, is what actually decides a race between two drivers — see ADR-0013 for why
   this needs no lock and no compare-and-swap the way completion does.

`/drive` reads the pool server-side on every load — no realtime, so a driver sees a request
disappear (someone else took it) or the list refresh only on reload or their next accept attempt.

## One ride at a time, enforced by the database — both sides

`rides_one_active_per_driver` — a unique index on `driver_id` where `status in ('accepted',
'in_progress')` — is the driver-side mirror of `rides_one_active_per_rider` above. It's total, not
partial-on-a-nullable-key: `rides_driver_present_unless_pending` already guarantees `driver_id` is
never null in either status it covers. A driver who already holds a live ride and somehow reaches
the accept path anyway (a stale list, a retried request) hits `23505`, surfaced as "you already
have a ride in progress" — the same shape the rider side uses.

## Invariants this flow must preserve

- `fare_cents` on a `rides` row is always the output of `quoteFare()` computed at the moment of
  insert — never a value read from a request body.
- `driver_id` is null only while `status` is `'requested'` or `'canceled'` —
  `rides_driver_present_unless_pending` enforces this in the database, not just in application code.
- At most one row per rider has `status` in `('requested', 'accepted', 'in_progress')` at a time;
  at most one row per driver has `status` in `('accepted', 'in_progress')` at a time.
- `pickup_lat`/`pickup_lng`/`dropoff_lat`/`dropoff_lng` stay null through this flow — ADR-0011's
  deferral, unaffected by anything here.
- A rider can cancel only their own ride, and only while it is `'requested'` — checked against the
  database on every call, not assumed from what the UI happened to render.
- A driver may accept only while `status = 'requested'` and `driver_id is null`, and only if their
  own `status = 'active'` — the same compliance gate root `CLAUDE.md` invariant 6 requires
  everywhere else, re-checked here rather than assumed from the open-pool listing being correct a
  moment ago.
- `accepted_at` is set by the accept UPDATE itself, never supplied by a caller.
