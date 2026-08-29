# Ride booking — the rider half

*Sibling to `ride-completion.md`: that file is the write nobody but a driver or the service role
ever makes; this is the write nobody but a rider or the service role ever makes. Tables:
`data-model.md`. Why it's shaped this way: `../decisions/0012-rider-books-server-owns-the-write.md`.*

**Status: built, rider side only.** `src/lib/rides/`, `/request`. Nothing accepts a requested ride
yet — no dispatch, no driver-side accept. That is its own concurrency problem (two drivers
accepting one ride) and its own PR.

## The flow

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

## One ride at a time, enforced by the database

`rides_one_active_per_rider` — a partial unique index on `rider_id` where `status in ('requested',
'accepted', 'in_progress')` — is what actually stops a second concurrent request, not an
application-level check. Two requests racing each other hit the constraint; the loser's insert
fails with `23505`, surfaced to the rider as "you already have a ride in progress" rather than a
raw database error.

## Invariants this flow must preserve

- `fare_cents` on a `rides` row is always the output of `quoteFare()` computed at the moment of
  insert — never a value read from a request body.
- `driver_id` is null only while `status` is `'requested'` or `'canceled'` —
  `rides_driver_present_unless_pending` enforces this in the database, not just in application code.
- At most one row per rider has `status` in `('requested', 'accepted', 'in_progress')` at a time.
- `pickup_lat`/`pickup_lng`/`dropoff_lat`/`dropoff_lng` stay null through this flow — ADR-0011's
  deferral, unaffected by anything here.
- A rider can cancel only their own ride, and only while it is `'requested'` — checked against the
  database on every call, not assumed from what the UI happened to render.
