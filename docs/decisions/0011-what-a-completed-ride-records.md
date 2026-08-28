# ADR-0011 — What a completed ride records

**Date:** 2026-08-28
**Status:** Accepted

## Context

ADR-0010 put the measuring instrument on the server and closed with an explicit deferral: "What
those columns should hold is now an open question rather than an assumption." `maps.md` has
carried that question ever since, under two headings — whether we may store the coordinates a
rider picked, and whether `rides.distance_meters` should hold a routed estimate or a measured
actual. Both were flagged as needing Mapbox's Product Terms read directly.

Nothing writes a `rides` row yet, so nothing is broken today. But both questions become
load-bearing the moment the booking flow lands, and getting either wrong is a licence violation
that stays invisible until Mapbox notices.

### What the terms actually say

Checked 2026-08-28. `mapbox.com` and `docs.mapbox.com` are blocked by this environment's egress
proxy, so these are **search-index results quoting Mapbox's own documentation, not the clauses
read in place.** That is stronger evidence than the third-party aggregator summaries `maps.md`
previously rested on, and weaker than a primary read. Marked as estimates per `docs/CLAUDE.md`.

1. **Search Box results may not be stored, at all.** Permanent storage rights are a **Geocoding
   API** feature. The Search Box API — the one RIDO uses, chosen in `places.ts` because Geocoding
   v6 carries no POI data and our riders type "Geisel Library" — has no `permanent` parameter and
   no storable tier.

2. **Geocoding v6 supports `permanent=true`**, requires a payment method on file, has **no free
   tier**, and bills at roughly $5.00/1,000 requests.

3. **Directions results may be cached but not stored permanently.** Storing them, or using them in
   other contexts, requires an enterprise plan.

Finding (1) means the `permanent` flag already shipped on `buildForwardSearchUrl` and
`buildReverseUrl` is a parameter Search Box does not accept. It reads as a safety mechanism and is
a no-op — which is worse than its absence, because the next person to build the booking flow will
set it to `true`, believe they are compliant, and store coordinates they still have no right to.

## Decision

### 1. Search Box is display-only. The storable path is a separate module.

The `permanent` flag comes off `places.ts` entirely. Search Box powers the typeahead; its
coordinates may be shown, mapped, and used to ask Mapbox for a route, and are never persisted.

A new `apps/web/src/lib/maps/geocode.ts` wraps Geocoding v6 and **always** sets `permanent=true` —
not as an argument, because a module that exists only for the storable case must not be able to
forget the flag. Same reasoning that put `shouldCreateUser: false` inside `apps/web/src/lib/auth/browser.ts` rather
than at its call sites (ADR-0006).

### 2. The pilot stores addresses and defers coordinates.

`resolveStorableCoordinates()` is built and left **switched off**. No booking flow calls it. Its
only caller is a deliberate button on `/dev/maps`.

Instead, `rides` gains `pickup_address` and `dropoff_address` — the address line the rider saw
when they chose. Coordinates stay null through the pilot.

Why defer:

- **It is recoverable, and cheaper deferred.** An address doesn't change, so the whole back
  catalogue can be geocoded in one batch whenever the geometry is wanted. Pay-as-you-go bills
  every *booking* including cancellations; a backfill bills only *completed rides*.
- **It is near-worthless at pilot scale.** At 500 rides/month around UCSD, the top ten pickup
  points are nameable from memory. Spatial clustering earns its keep in the thousands.
- **It has a natural expiry.** Once the driver app exists, the GPS fix at pickup is better data
  than a geocode of what the rider typed, and costs nothing. The paid path is a stopgap for the
  window where bookings exist and the driver app doesn't.
- **It is the only line item that isn't free at pilot**, and it needs a card on file. Not adding a
  paid dependency and a new failure mode to booking confirmation — before that path exists — is
  worth more than the $5/month.

**The turn-on trigger, written down so it isn't a vibe:** the booking flow is live in production
*and* someone wants the spatial heatmap. Flipping it is a one-line change because the seam exists.

### 3. `distance_meters` and `duration_seconds` hold the actual trip. Never the routed estimate.

Terms and design agree here, which is the reassuring part:

- **Terms:** we may not store a Directions result, and the routed estimate is one. RIDO's own
  clock and the driver's own GPS trace are RIDO's data; Mapbox has no claim on either.
- **Design:** a completed ride should record what happened, not what was predicted. Those genuinely
  differ — traffic, detours, a rider walking to the next corner — and that difference is exactly
  the signal a future dispatch optimizer needs. Storing the prediction discards it.

`duration_seconds` is filled from `completed_at − started_at`, so it needs neither Mapbox nor the
driver app and works from the first completed ride. `distance_meters` needs a GPS trace and stays
null until the driver app exists.

**This does not touch the money.** The fare locks when the rider accepts the quote, computed from
our own rate card; `rides.fare_cents` stores that agreed price and is never recomputed from the
actual distance. The two are *supposed* to differ — a rider who hits traffic does not get a
surprise bill. Stated explicitly here so nobody later writes a reconciliation job to make them
agree and quietly invents variable pricing.

## Consequences

- The four lifecycle timestamps `rides` already carries (`requested_at`, `accepted_at`,
  `started_at`, `completed_at`) become load-bearing product data rather than incidental columns.
  **The temporal half of a demand heatmap works from day one, free, with zero terms exposure** —
  demand by hour and weekday, request-to-accept and accept-to-pickup latency, trip duration.
- The spatial half is deferred but not lost. `pickup_geog`/`dropoff_geog` are *generated* columns
  and the GiST indexes already exist, so both populate themselves the moment lat/lng arrive.
- **Storing Mapbox's returned address string is technically under the same restriction as the
  coordinate.** The judgement here is that a transaction record naming where a customer went is
  not the thing those terms target — every rideshare receipt in existence does it, and the
  restriction is aimed at rebuilding a competing geocoding database. This is grey rather than
  clean, and is recorded as such rather than assumed away.
- The migration comment at `20260825120000_enable_postgis_and_ride_geometry.sql:42-45` ("Filled at
  completion from the mapping provider... these are for the ROUTED figures") is now wrong and is
  superseded by a new `comment on column` migration. The applied migration is not edited.
- A backfill script is **not** written here. There are no rows to backfill.
- The Directions clause is the weakest of the three findings, but the design is safe under both
  the strict and lenient readings, so no decision here depends on resolving it. Worth confirming
  against the primary source before volume grows.

## Supersedes

Nothing. Resolves the open question ADR-0010 deferred and `docs/architecture/maps.md` carried.
