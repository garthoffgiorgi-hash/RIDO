# ADR-0012 — Rider books, server owns the write

**Date:** 2026-08-29
**Status:** Accepted

## Context

Everything up to this point priced a ride and settled one. Nothing created one. `/request` was a
placeholder rendering a hardcoded `$8.40`, and `rides` was shaped for a world where a ride never
exists without a driver already bound: `driver_id` was `not null` from the first migration, and
every fixture inserted `'requested'` *with* a driver already assigned.

Closing that gap means answering three questions the schema and the write path were silent on:

1. Can a ride exist before a driver accepts it, and if so, what does the database allow while it's
   unassigned?
2. Who is allowed to write a `rides` row, given `fare_cents` is `not null` and a client-supplied
   fare is exactly the thing ADR-0010 exists to prevent?
3. A traffic-aware quote is a live number — what happens when the fare a rider was shown has moved
   by the time they confirm?

Scope is the rider half only. Nothing accepts a requested ride in this PR — there is no dispatch
and no driver-side accept yet, which is deliberately deferred: that surface has its own
concurrency problem (two drivers accepting the same ride) that deserves its own design the way
completion got ADR-0008, not a rider-booking afterthought.

## Decision

### 1. A ride may exist unassigned. The database enforces exactly when.

`rides.driver_id` drops its `not null` constraint. A new constraint,
`rides_driver_present_unless_pending`, expresses the rest: `driver_id is not null or status in
('requested', 'canceled')`. A driver may be absent only while nobody has taken the ride yet, or
once it's been called off with nobody having accepted — every other status still requires one.
This is the same idiom `rides_commission_present_iff_completed` already uses: the constraint *is*
the state machine, not a comment describing one.

A new partial unique index, `rides_one_active_per_rider` on `rider_id` where `status in
('requested', 'accepted', 'in_progress')`, guarantees one live ride per rider at the database
level rather than an application check that races under a concurrent second request.

`canceled_at` is added as a first-class timestamp. The four existing lifecycle timestamps are the
temporal half of the demand data ADR-0011 established as free and terms-clean; a cancellation with
no record of *when* throws away exactly the signal that makes cancellations analysable later.

### 2. The write goes through a Server Action on the service role. No RLS insert policy.

`fare_cents` is `not null`: a fare must exist before the row does. If a rider's browser could
supply it, ADR-0010's guarantee — that a client-supplied number never becomes a price — would be
bypassed at the one moment it matters most. So booking runs server-side, the same shape
`complete-ride` already uses: `apps/web/src/lib/rides/server.ts` calls `requireUser()`, measures and quotes
fresh, and writes through `createServiceRoleClient()`.

**No authenticated write policy or grant is added to `rides`.** The migration that created the
table said, in as many words, that every write goes through the service role "until the booking
flow ships its own migration with the RLS it actually needs" — and the chosen path needs none,
because nothing authenticated ever touches the table directly. `002_rides_rls_isolation.sql`, which
asserts an authenticated insert is rejected, needed no change at all: it still passes, unmodified,
proving the guarantee wasn't quietly widened to ship this.

The alternative — a column-scoped `INSERT` policy plus a column-scoped grant — was rejected because
it puts `fare_cents` in a payload the rider's own client constructs, which is precisely the
exposure ADR-0010 closed on the measuring side. A `quote-ride` Edge Function was also considered
and deferred: right once a native rider app needs its own runtime, unnecessary today when the web
app can do the same work in-process.

### 3. If the price moved, don't book — show the new one and ask again.

`requestRide()` always re-measures and re-quotes from scratch before writing anything.
`shownFareCents`, what the rider's screen displayed a moment ago, is compared against the fresh
figure — **never stored**, and never trusted as the price. If they disagree, the row is not
written; the caller gets the new quote back and the rider re-confirms. One extra tap, in the rare
case traffic moved the number, and a rider is never charged something they didn't see — the
anti-incumbent, no-surprises posture made concrete rather than asserted.

A tampered `shownFareCents` cannot move a price by a cent either way: it can only trigger a
spurious re-confirm or fail to catch a real change, never write a number the fresh server quote
didn't produce.

### 4. Cancellation, for now: only `'requested'`, only the rider who booked it.

`canRiderCancel()` returns true for exactly one status. Nothing in this PR ever produces
`'accepted'` or `'in_progress'` — there is no driver-side accept yet — so drawing the line
anywhere past `'requested'` would be designing for a state nothing can reach. Once accept exists,
whether a rider can still cancel after a driver has committed (a fee? a notification?) is a real
product decision that belongs with that PR.

`cancelRide()` re-checks both ownership and cancellability server-side rather than trusting that
the Cancel button was only rendered when it was allowed — the same defense-in-depth
`requireUser()` already applies everywhere in this module.

## Consequences

- `database.types.ts` is stale relative to the new migration in this same PR — this container has
  no Docker, so `supabase gen types` cannot run here, the same gap ADR-0011's address columns had
  until pushed and regenerated live. `apps/web/src/lib/rides/server.ts` bridges it with two narrow, clearly
  commented local type overrides rather than a hand-edit of the generated file; both are deleted
  once the migration is live and regenerated.
- Two existing pgTAP fixtures (`005_apply_ride_commission.sql`,
  `concurrent-apply-ride-commission.sh`) inserted two simultaneously-active rides under one rider,
  which predates and now collides with `rides_one_active_per_rider`. Fixed by giving the two rides
  distinct riders — which rider books which was never load-bearing to what either file tests.
- `PlaceSearch.tsx` moved from `app/dev/maps/` to `components/domain/`, since the rider flow reuses
  it rather than reimplementing search. Moving it surfaced a real bug in its "Change" affordance —
  it set `coordinates: null` on an otherwise-unchanged `Place`, but the component checked the
  object's bare truthiness rather than `.coordinates`, so "Change" never actually returned to the
  search box. Fixed in the same commit, since the dev-only page never exercised the path enough to
  notice.
- `Sheet` and `Fare` are new `ui/` primitives with no prior implementation in this repo — the
  bottom sheet `brand/design-system.md:80` calls "the rideshare workhorse" and the `--text-numeral`
  role `globals.css:49` defined but nothing used. Both are documented back into
  `brand/design-system.md` alongside the per-state decisions this PR made that section 6 left open
  (the backdrop dim colour, in particular, had no specified value anywhere).
- `distance_meters`/`duration_seconds` are unaffected: booking still writes nothing to either. The
  answer ADR-0011 gave — actual trip, never routed estimate — still waits on the driver app.

## Supersedes

Nothing. Extends ADR-0009 (fare quoting), ADR-0010 (server-measured trips), and ADR-0011 (what a
completed ride records) to the write path none of the three built.
