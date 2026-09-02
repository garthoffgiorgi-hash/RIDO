# ADR-0020 — A realtime event is a notification, not a data channel

**Date:** 2026-09-03
**Status:** Accepted

## Context

Both sides of a live ride have been lying since the lifecycle shipped. A rider who books sits on
"Looking for a driver" through the driver accepting, arriving, and starting the trip — the screen
only moves when they reload. A driver whose rider cancels out from under them keeps looking at a
ride that no longer exists, with a "Start trip" button that can now only fail. `ride-booking.md`
has said so plainly in two places since ADR-0013, and `roadmap.md` in three more.

The remaining question was never *whether* to close this — it was what a realtime event is allowed
to carry. Supabase Realtime's `postgres_changes` broadcasts the whole row on every change, so the
tempting shape is obvious: take the payload, patch it into local state, skip the round trip.

That shape is wrong here, and it is wrong for reasons that are specific rather than stylistic.

## Decision

### 1. The payload is thrown away. The event only says "this ride moved."

`subscribeToRide()` hands its caller an `onChange` that **takes no arguments**. The client's only
response to an event is to call the same Server Action a page load would call, and set the result.

Three independent reasons, each sufficient on its own:

1. **`DriverActiveRide.driverPayoutCents` and `.commissionRateBps` are not on the row.** An
   `'accepted'` or `'in_progress'` ride has no commission snapshot —
   `rides_commission_present_iff_completed` guarantees those columns are null until completion.
   `getDriverActiveRide()` computes both live, calling `commissionForRide()` against the active
   tiers and this driver's month-to-date position. **A postgres_changes payload physically cannot
   supply them.** The single most important number on the driver's screen is the one the socket
   does not carry.
2. **Root invariant 5 and `.claude/rules/money.md` forbid producing them locally anyway** — *"a
   number shown to a driver comes from a snapshot or from `@rido/pricing`, not from arithmetic in a
   component."* Patching a payout figure client-side from a raw row would break that rule at the
   exact site it exists to guard.
3. **`CompletedRideSummary` has a server-side freshness window.** "Did this ride finish recently
   enough to still show a trip-complete summary" is not a question a raw row answers; it is
   `getRecentlyCompletedRide()`'s to answer, against the server's clock.

What this buys, beyond correctness: there is no raw-row → app-type translation layer to drift out
of sync with the server reads, one mechanism serves both surfaces, and RLS on the refetch is
exactly the RLS that governs a page load. The cost is a round trip per event, on a table where
events are rare (four per ride, at most) and the alternative is wrong.

### 2. The refetch is a Server Action, not `router.refresh()`

`RequestPanel` holds `const [activeRide, setActiveRide] = useState(initialActiveRide)`. A
`useState` initializer **does not re-run** when `router.refresh()` delivers a fresh RSC payload, so
a refresh-based design appears to work in review and silently does nothing at runtime. That exact
bug was found and fixed in `OpenRequestsPanel` one PR earlier; repeating it here would be
repeating it knowingly.

`activeRide` also cannot simply derive from props the way `OpenRequestsPanel`'s list now does,
because it is genuinely dual-sourced: the rider's own optimistic writes (booking, cancelling) set
it too. So the handler calls an action, gets an app-shaped value, and sets it — no prop-sync
problem, and the same shape works on both panels.

Both actions wrap reads that already exist (`getActiveRide`, `getRecentlyCompletedRide`,
`getDriverActiveRide`). This ADR adds no new read path and no new query.

### 3. No RLS change, because none is needed

`alter publication supabase_realtime add table rides` is the entire database change.

**postgres_changes broadcasts every column of the NEW row, with no column scoping** — that is worth
stating rather than glossing, because it sounds like an exposure. It is not a new one.
`rides_select_own_as_rider` and `rides_select_own_as_driver` already authorize each party to
`SELECT` every column of that row, `fare_cents` and `driver_payout_cents` included, and Realtime
authorizes each event through those same policies using the subscriber's own JWT. **This is a new
channel for data each party could already read**, not new data.

Publication membership is per-table opt-in, so the blast radius on the other eight tables is zero.
`REPLICA IDENTITY` stays `DEFAULT`: it governs what the *OLD* tuple carries, and nothing here reads
OLD. `FULL` would double WAL volume on a table that keeps every ride forever, to carry data this
design has already decided not to use.

### 4. Reconnect is silent

No "reconnecting…" indicator, no refetch-on-focus, no connection state rendered anywhere. Nothing
on either screen is safety-critical, the socket reconnects on its own, and the handler refetches on
resubscribe — so a tab that was backgrounded through a status change catches up when it returns.
Every visible connection state is one more string to get right in the brand's voice for a condition
the user cannot act on.

### 5. The subscription lives behind `apps/web/src/lib/rides/realtime.ts`

`@supabase/` is in `check-context.mjs`'s `VENDOR_SDKS` list, so subscription code in a Client
Component fails the build — root invariant 7 and ADR-0006, enforced by a tool rather than by
review. `realtime.ts` returns an opaque `RideSubscription`, never a Supabase `RealtimeChannel`,
following `apps/web/src/lib/maps/map.ts`'s standing precedent for `mapbox-gl`.

Two details inside it are load-bearing and are commented as such:

- **`await supabase.realtime.setAuth()` before `.subscribe()`.** A channel joined before the
  session hydrates from cookies presents only the anon key, and under RLS that yields **zero events
  and no error** — the single likeliest way this ships broken and passes review.
- **`supabase.removeChannel(channel)` on teardown, not `channel.unsubscribe()`.** The latter closes
  the socket but leaves a dead entry in the client's channel registry, which leaks on every React
  StrictMode double-invoke.

This is the first consumer of `apps/web/src/lib/supabase/client.ts`, which has been dead code since it was
written: every byte reaching a Client Component until now was a server prop or a Server Action
return.

## Consequences

- **A rider's screen now moves on its own** through accept, start and completion, and a ride
  cancelled by anyone else disappears from under them rather than persisting until reload.
- **A driver learns their rider cancelled**, in a state `CurrentRidePanel` never had. It is a calm
  "This ride was cancelled" card with a way back to the board — deliberately **not** the `error`
  state, since a rider cancelling is a thing riders are allowed to do, and red danger text for a
  permitted act would be the wrong voice (`brand/brand-guide.md`: warmth points inward).
- **The rider's own writes echo back.** Booking or cancelling fires an event for the change the
  rider just made optimistically. Because the handler refetches rather than patches, the echo is
  idempotent — but the handler is still guarded on the in-flight `booking`/`canceling` flags, so a
  refetch cannot land mid-action and clobber optimistic state.
- **Realtime is inert until the migration is applied.** A missing publication row produces no error
  anywhere — the channel joins, and no event ever arrives. That is why the one new database fact
  gets a pgTAP assertion despite being a single line of DDL.
- **`apps/web` now ships a websocket to two routes.** Supabase's Realtime connection limits are a
  real ceiling at scale; at pilot volume they are not close, and the per-ride subscription is torn
  down the moment the ride ends.

## Out of scope, deliberately

**The driver's open-pool board (`OpenRequestsPanel`) does not subscribe.** The other two are
single-row cases — one ride, one id, one channel. The board is a filtered *whole-table*
subscription whose governing policy (`rides_select_open_requests_as_active_driver`) is conditional
on driver status, so it needs its own authorization reasoning, its own decline/availability
interaction, and its own tests. A driver still learns the pool changed on reload or on their next
accept attempt. This absence is a decision, not an oversight.

Also out: driver location on the rider's map (no GPS trace exists — ADR-0011), push notifications
of any kind, presence, and any realtime on `driver_payouts` or `ride_charges`.

## Testing

Deliberately thin, and worth saying why. A websocket subscription is neither pure logic nor a
database invariant, which is the whole of ADR-0007's bar. `supabase/tests/019_ride_realtime.sql`
asserts the one new database-level fact — that `rides` is in the `supabase_realtime` publication,
and that no other table was swept in — because publication membership is exactly the kind of silent
configuration that breaks a feature with no error anywhere. `realtime-event.ts` holds the one piece
of genuinely pure logic (deciding whether a channel status means "resubscribed, refetch now") and
is tested. No unit was invented for the panels' status switch, which is three inline ternaries and
would only be tested to have something to assert.

## Supersedes

Nothing. Closes the "no realtime" gap ADR-0012, ADR-0013 and ADR-0014 each recorded and deferred.
