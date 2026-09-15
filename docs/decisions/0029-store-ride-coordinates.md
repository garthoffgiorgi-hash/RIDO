# ADR-0029 — Coordinates get stored at booking, behind a flag, best-effort

**Status:** Accepted
**Date:** 2026-09-15

## Context

A driver who accepts a ride sees two address strings and nothing else. Giving them a map means
having a coordinate for the pickup, and `rides.pickup_lat`/`pickup_lng`/`dropoff_lat`/`dropoff_lng`
have been null on every row since the schema was written.

ADR-0011 deferred that deliberately: Search Box coordinates may never be persisted at any price,
and the storable alternative — Geocoding v6 with `permanent=true` — has no free tier and bills
from the first request. It built `resolveStorableCoordinates()`, left it switched off with its only
caller a button on `/dev/maps`, and wrote down a turn-on trigger: *"the booking flow is live in
production and someone wants the spatial heatmap."*

**Half that trigger is met and half isn't.** The booking flow is live. Nobody wants the heatmap —
what wants the columns is driver navigation, a motivation ADR-0011 didn't name. Rather than read
the trigger loosely, this ADR turns the deferral off on its own terms.

Worth being explicit that nothing here contradicts ADR-0011. It permits exactly this: *"its
coordinates may be shown, mapped, and used to ask Mapbox for a route, and are never persisted."*
What we persist is a different product's answer, licensed for it.

## Decision

**`requestRide()` resolves storable coordinates for both ends and writes them to the existing
columns.** No migration: the columns, the generated `pickup_geog`/`dropoff_geog`, and their GiST
indexes were all built in advance for this, and the geographies populate themselves the moment a
real pair lands.

**Behind `STORE_RIDE_COORDINATES`, exact-match `"true"`, defaulting off.** Same fail-safe family
as `RIDES_LIVE` (ADR-0026) and `CRON_SECRET` (ADR-0025), and the parser is
`parseRidesLive()`'s shape verbatim. The failure direction here is money rather than legality, but
it is still a direction — an unset, empty, misspelled or `"TRUE"` value must never start billing.
This is also what lets the code merge before the Mapbox account is confirmed ready: off, it costs
nothing and changes nothing.

**Best-effort. A geocode never fails a booking.** A refusal, a timeout, or an exception writes
`null` for that end and the ride is booked anyway — the same posture `captureRideCharge()` and
`payoutRide()` already take one step later in the lifecycle ("neither may turn a completed ride
into a failed one"). The two ends are independent: a dropped-pin pickup with no address to geocode
doesn't cost the dropoff its coordinate. `coordinateColumns()`
(`apps/web/src/lib/rides/coordinates.ts`) is the pure, tested rule that a failure writes null and
never a fabricated coordinate.

**At booking, not at accept, and specifically to keep the drift guard.**
`resolveStorableCoordinates()` refuses when Geocoding v6's answer is more than 500m from the
rider's original map pin — the guard against silently sending a driver to a plausible-looking
wrong address. That pin exists only during booking; geocoding at accept would have to drop the
guard, and would have nothing to replace it with. Accept-time geocoding is strictly cheaper (it
skips cancelled and never-accepted rides, which ADR-0011 explicitly flagged as waste) and is
rejected anyway: a driver sent to the wrong place at night is a worse outcome than a wasted cent.

**It is the last step before the insert**, after the price re-check, the card check and the policy
read. Every early return above it is a booking that never happens, and this is the one step that
bills.

## Consequences

- Permanent geocoding bills from the first request, ~$5/1,000 — two per booking, so roughly $10/mo
  at the pilot's 500 rides, including bookings that are then cancelled. A payment method must be
  on file with Mapbox. The button on `/dev/maps` exists to confirm the product is enabled before
  the flag is flipped, and remains the right first step.
- The spatial half of ADR-0011 stops being deferred. `pickup_geog`/`dropoff_geog` start
  populating, which unblocks two things `docs/roadmap.md` currently lists as coordinate-gated:
  proximity/dispatch matching, and the airport fee.
- Rides booked before the flag was set keep null coordinates forever. No backfill is proposed
  here — the addresses are still the input to one, exactly as ADR-0011 designed, and driver
  navigation degrades to address-only for those rows.
- ADR-0011's grey area is inherited unchanged, not resolved: storing Mapbox's returned address
  string sits under the same restriction as the coordinate, and the judgement that a transaction
  record naming where a customer went isn't what those terms target still stands as a judgement.

## Supersedes

Nothing. Turns on the deferral ADR-0011 built the seam for, for a motivation ADR-0011's written
trigger didn't name.
