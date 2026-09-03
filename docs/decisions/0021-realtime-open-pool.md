# ADR-0021 — The open pool hears arrivals, and structurally cannot hear removals

**Date:** 2026-09-04
**Status:** Accepted

## Context

ADR-0020 gave the two single-row live-ride surfaces realtime and deliberately left the driver's
open-request board out, saying why:

> The board is a filtered *whole-table* subscription whose governing policy
> (`rides_select_open_requests_as_active_driver`) is conditional on driver status, so it needs its
> own authorization reasoning, its own decline/availability interaction, and its own tests.

This is that reasoning. It was prompted by the plainest possible report from testing: *"I had to
refresh my page to see the new rides come up."*

## The finding everything else follows from

Supabase Realtime authorizes each `postgres_changes` event by checking whether the subscriber can
`SELECT` the changed row **as it stands after the change**. Driving the real policies against a
local Postgres (in a rolled-back transaction) gives an unambiguous answer:

| Moment | Can a *different* active driver still `SELECT` the row? |
|---|---|
| Ride booked — `requested`, `driver_id IS NULL` | **Yes** |
| After another driver accepts it | **No** |
| After the rider cancels it | **No** |

The two directions are **asymmetric, and no client code changes that**:

- **Arrivals are deliverable.** A new ride is inserted `requested`/unassigned — exactly what
  `rides_select_open_requests_as_active_driver` grants every active driver — so the event goes out
  to all of them.
- **Removals are not.** The instant a ride is accepted or cancelled it leaves every *other*
  driver's visibility. There is no longer a subscriber the event is authorized for. This is not a
  gap in the subscription; it is what the policy means, working correctly.

That asymmetry is the whole reason this surface was worth deferring rather than assuming.

## Decision

### 1. Subscribe to the whole table; existing RLS is the filter

`subscribeToOpenRequests()` (`apps/web/src/lib/rides/realtime.ts`) joins one channel,
`open-requests`, with no `filter` — the authorization is the policy, per row, per subscriber, with
the driver's own JWT. **No new policy, no new grant, no migration**: `rides` has been in the
`supabase_realtime` publication since ADR-0020.

It keeps `event: "*"` to match `subscribeToRide`'s standing reasoning, and records the asymmetry
above in a comment as the reason arrivals are the only thing a *watching* board hears. (The driver
who accepts does receive their own accept — `rides_select_own_as_driver` keeps the row readable to
its new owner — which is inert, since the refetch returns a pool that correctly excludes it and that
panel is already unmounting.) A bare `event: "INSERT"` would look like a tidy narrowing and would
hide the real constraint from the next reader.

There is no coexistence concern with `subscribeToRide`: `rides_one_active_per_driver` makes
`CurrentRidePanel` and `OpenRequestsPanel` mutually exclusive, so a driver never holds both.

### 2. The refetch is a Server Action, not `router.refresh()`

`readOpenRequests()` wraps `listOpenRequests(driver)`, which already applies RLS, decline filtering
(ADR-0019) and live per-driver pricing. Nothing about the list is recomputed client-side, and the
event's payload is discarded unread — ADR-0020's notification-not-data-channel rule, unchanged.

`router.refresh()` would in fact work here, unlike on `RequestPanel`: this board has been derived
from props rather than `useState(initialRequests)` since ADR-0019. It is still the wrong tool:

- `apps/web/src/app/(driver)/drive/page.tsx` re-runs `refreshConnectState()` and `settlePendingPayoutsForDriver()` whenever
  `?onboarding=return` is in the URL, and a refresh preserves search params. **Every ride booked
  anywhere would re-fire those Stripe calls** while a driver sits on that URL. ADR-0016's attempt
  claim makes that safe, not free.
- It re-runs four server reads to update one list.

### 3. Removals are mitigated, not solved — and never by widening the policy

Three mechanisms, none of them a poll:

- **Any arrival refreshes the whole list**, so the board prunes stale cards whenever it gains one.
- **A `visibilitychange` refetch** when the driver returns to the tab.
- **Accepting a taken ride still fails cleanly** and removes the card, which has been true since
  ADR-0013 and remains the backstop.

**Rejected: broadening `rides_select_open_requests_as_active_driver`** so drivers keep seeing
recently-taken rides. That would trade read access — real, permanent, security-relevant — for UI
freshness. Wrong currency.

**Rejected: a background poll.** A standing timer per driver forever is easy to add and hard to
remove, for a case the three above already cover at pilot volume.

### 4. Focus-refetch here, deliberately unlike ADR-0020

ADR-0020 §4 decided *"no refetch-on-focus"* for the single-ride surfaces. That was right there: the
socket could deliver every change those screens cared about, so a focus refetch was redundant
machinery. Here it is the **only** thing that clears a ride another driver already took. Same
project, opposite call, because the underlying constraint is genuinely different.

`visibilitychange` rather than `focus`: the latter also fires on clicking back into an
already-visible window, which is noise rather than signal.

### 5. Offline drivers keep receiving arrivals

The open-pool policy gates on `drivers.status = 'active'`, not `accepting_rides`. So an offline
driver's board stays live — which is exactly what ADR-0019 decided when it kept the board visible
while offline and disabled only Accept. A driver deciding whether to go back online should be able
to see whether there is work.

## The MTD card and the payout card measure different things

Also reported from testing: the month-to-date tier card's figures don't match **Earnings** on the
same page. Both are correct. They diverge for three independent structural reasons, recorded here
because the obvious reconciliation is a money bug:

1. **Different windows.** `getPayoutSummary()` sums every `driver_payouts` row, all time.
   `TierProgress` reads `driver_monthly_stats` for the current month only.
2. **Different meanings.** "You kept $X" is what the driver **earned**; "sent to your bank" is what
   Stripe has **transferred**. A `pending` payout is in one and not the other, by design (ADR-0015
   made recording the debt and moving the money separate steps).
3. **Cancellation fees are in one and cannot be in the other.**
   `queue_cancellation_payout()` fires on `→ canceled`; `bump_monthly_stats()` fires only on
   `→ completed`. A captured fee reaches `driver_payouts` and never reaches `driver_monthly_stats`.

**`driver_monthly_stats` is a fare rollup, not an earnings ledger.** `gross_fare_cents` is the basis
commission brackets against, and `driver_monthly_stats_sums_to_gross` enforces
`commission_cents + payout_cents = gross_fare_cents`. Adding cancellation fees to it would either
violate that CHECK or inflate a driver's tier position with money commission never touched —
**silently changing the rate their next ride is charged.** `016_cancellation_payout.sql` now pins
that a cancellation leaves the rollup untouched, so the trap fails loudly rather than shipping.

The fix was therefore to the copy, not the figures. `TierProgress` reads "You **earned** $X of
that"; `PayoutCard` reads "sent to your bank, **all time**" and, once there is any money to explain,
adds "Every ride you've driven, cancellation fees included. This month's fares are in the card
above." Neither number moved.

**Known gap, deliberately not closed:** cancellation-fee earnings appear nowhere in the month view.
Surfacing them there would need a second source of truth for "what did I earn this month," and
Earnings already shows the money. Worth revisiting only if a driver actually asks.

## Consequences

- **A new request appears on every active driver's board on its own**, which is the reported bug,
  fixed — and the last of ADR-0020's deferred realtime work.
- **A ride another driver took can linger briefly** on a board whose owner hasn't switched tabs and
  hasn't received a newer arrival. It is honest — Accept still refuses cleanly — but it is a real,
  accepted limitation rather than an oversight.
- **The board now subscribes for every active driver**, not one channel per live ride. At pilot
  volume that is a handful of sockets; it is the first subscription here whose count scales with
  drivers rather than with rides.
- **The upgrade path is written down.** A database trigger calling `realtime.broadcast_changes()`
  against a shared pool topic would make removals instant, since a broadcast topic authorizes per
  *topic* rather than per row, and the payload would carry no ride data at all — just a ping, with
  every subscriber refetching through `listOpenRequests()` exactly as they do now. It costs a
  migration, a new `realtime.messages` authorization surface, and a local-Postgres workaround for a
  schema that only exists on hosted Supabase. Not worth it until stale cards are a real complaint.

## Supersedes

Nothing. Completes the work ADR-0020 deferred, and departs from its §4 "no refetch-on-focus" for
the one surface where the socket cannot carry every change.
