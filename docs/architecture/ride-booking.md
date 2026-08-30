# Ride booking — rider and driver

*Sibling to `ride-completion.md`: that file is what happens once a ride reaches `'completed'` —
the write nobody but a driver (forwarding their own token) or the service role ever makes. This
file covers everything before it: the rider's booking write, the driver's accept write, and the
driver's start-trip write; all three go through the service role (start alongside accept — see
below), never through an RLS write policy. Tables: `data-model.md`. Why booking is shaped this
way: `../decisions/0012-rider-books-server-owns-the-write.md`. Why accept is shaped this way:
`../decisions/0013-driver-accepts-one-row-one-update.md`. Why start and completion are shaped this
way: `../decisions/0014-app-calls-complete-ride.md`.*

**Status: the full loop is built.** `src/lib/rides/`, `/request` (rider), `/drive` (driver) — a
ride can now go `requested → accepted → in_progress → completed` for real, for the first time.
Not built: online/offline toggle, MTD tier-progress visualization, realtime (a rider or driver
still only learns of a state change on reload), driver decline, dispatch or proximity matching.

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
   `status = 'canceled'`, `canceled_at = now()` through the service role. The Cancel button itself
   only renders while `status === 'requested'` — a driver having already committed is not offered
   an action that can only fail.

The sheet's copy tracks status past acceptance too: `'accepted'` reads "Your driver is on the
way," `'in_progress'` reads "You're on your way." Once the ride reaches `'completed'`,
`getActiveRide()` goes back to `null` and a short trip-complete summary
(`getRecentlyCompletedRide()`, a freshness-windowed read — `ride-completion.md`) takes its place
until the rider dismisses it and books again.

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
3. **Start the trip.** `startTrip(rideId)` is the same shape again: `canStartTrip()`
   (`apps/web/src/lib/rides/start.ts`, pure — ownership before compliance before state, mirroring
   `authorizeCompletion`'s ordering rather than accept's, because a ride mid-trip already has an
   owner to check) pre-flight-checks, then one conditional `UPDATE … WHERE status = 'accepted' AND
   driver_id = ?` moves it to `'in_progress'` and stamps `started_at`. No multi-driver race exists
   here — only this ride's own driver can ever match the predicate — but a double-tap of the same
   button is real, and the second call's `UPDATE` correctly matches zero rows once the first has
   already moved the row.
4. **Complete it.** Handed off to `ride-completion.md` — this is the one write in the whole
   lifecycle that isn't a plain conditional `UPDATE` through the service role. ADR-0014.

`getDriverActiveRide(driver)` reads the signed-in driver's own live ride, if any — an RLS read
(`rides_select_own_as_driver` already covers it) that `/drive` didn't have until now. Before it
existed, accepting a ride only lived in the accepting browser tab's local state; reloading lost it
entirely. `rides_one_active_per_driver` guarantees at most one row, so this is a `maybeSingle()`
read, not an optimistic one. Priced the same live way `listOpenRequests` prices the open pool —
`'accepted'` and `'in_progress'` both still have no commission snapshot.

`/drive` shows this current-ride read when it's non-null, and the open pool only when it's
`null` — `rides_one_active_per_driver` is what makes those mutually exclusive, so `/drive` doesn't
even call `listOpenRequests` while a driver holds a live ride. No realtime either way: a driver
sees a request disappear (someone else took it) or the pool refresh only on reload or their next
accept attempt.

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
- A driver may start a trip only on their own ride, while `status = 'accepted'`, and only if their
  own `status = 'active'` — same gate, same re-check discipline. `started_at` is set by the start
  UPDATE itself, never supplied by a caller. See `ride-completion.md` for what happens next.
