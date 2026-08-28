# Maps — which Mapbox products, and where each one runs

**The rule, first:** the browser may name two places; only the server may measure the trip between
them. That is ADR-0010, and everything below is how it's arranged.

Costs and free tiers live in `../business/mapbox-costs.md`, not here. Code lives in
`apps/web/src/lib/maps/`.

## What we use, and why

| Product | Runs | Why this one |
|---|---|---|
| **Directions API** (`driving-traffic`) | **Server only** | Distance and duration for one pickup/dropoff pair. The two numbers `quoteFare()` needs |
| **Search Box** `/forward` | Browser | "Where to?" — turning "Geisel Library" into coordinates |
| **Search Box** `/reverse` | Browser | A dropped pin or a GPS fix into a street address |
| **Mapbox GL JS** | Browser | Drawing the map. `apps/web/src/lib/maps/map.ts` |

### Why Search Box and not the Geocoding API

Geocoding v6 covers addresses, streets and postcodes but carries **no POI data** — POIs were
removed in v6. RIDO's first market is UCSD, where riders type building names, not street
addresses. Geocoding alone would not find the places our riders actually go.

### Why `/forward` and not `/suggest` + `/retrieve`

The two bill differently: `/forward` per **request** against a large free allowance,
`/suggest` + `/retrieve` per **session** against a much smaller one. At pilot volume the request
model is free where the session model is not. The trade is that `/forward` has no session-scoped
typeahead, so callers debounce (`SEARCH_DEBOUNCE_MS`) rather than firing per keystroke. Revisit if
search volume approaches the request allowance — the switch is confined to `places.ts`.

### Why `driving-traffic` and not `driving`

The rate card charges per minute. A traffic-blind duration systematically under-prices rush hour —
exactly when a driver most needs the fare to reflect the work. Mapbox falls back to `driving`
where it has no traffic coverage, so there's no failure mode, just a less good number.

### Why not the Matrix API

Matrix returns durations and distances for *many* origin–destination pairs. That's the right tool
for driver matching later ("which of these eight drivers is closest"), and the wrong one for a
single pickup and dropoff — same answer, worse response shape, no geometry to draw.

## Two tokens, not one

| Variable | Kind | Reaches a browser |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox public (`pk.`) | **Yes, by design** |
| `MAPBOX_SECRET_TOKEN` | Mapbox secret (`sk.`) | **Never** |

A `pk.` token is designed to be public: public scopes only, and it cannot create, modify or delete
anything. That satisfies invariant 10's promise that a `NEXT_PUBLIC_*` value is safe to ship to a
browser — the same promise `NEXT_PUBLIC_SUPABASE_ANON_KEY` already makes. The residual risk is
quota theft; restrict it by URL in the Mapbox dashboard.

The secret token is stronger than "secret": it is the token that produces the number a fare is
computed from. Shipping it to a browser would put the measuring instrument in the hands of the
party being measured.

**They must be two separate tokens.** Mapbox enforces URL restrictions via the HTTP `Referer`
header, and a server-to-server `fetch` sends no `Referer` — so a properly restricted public token
returns 403 from our own server. Two tokens is what lets the public one actually be restricted.

Restrict the public token to the Vercel production and preview origins plus
`http://localhost:3000`. Leave the secret token unrestricted; it never leaves the server.

## Two traps worth knowing before you read the code

**Mapbox signals routing failures with HTTP 200.** No drivable route returns `200 OK` with
`{ "code": "NoRoute", "routes": [] }`; a coordinate not near a road returns `200` with
`"NoSegment"`. Checking `response.ok` is not sufficient — that's why the response body's `code` is
a first-class input to `mapsErrorMessage`, and why `parseDirectionsBody` rejects `Ok`-with-no-routes
rather than treating it as a zero-distance trip.

**Mapbox returns floats; `quoteFare` rejects them.** Directions gives `distance: 12345.678`;
`requireNonNegativeInteger` throws on anything non-integer. The rounding happens exactly once, in
`parseDirectionsBody`, with `Math.round` — nearest, deliberately neutral rather than
house-favourable. Against the seeded San Diego card one metre is 0.066¢ and one second is 0.45¢,
so the choice is sub-cent either way; the number is stated so it's clear it doesn't matter rather
than merely asserted.

## Rate limits

Directions **300 req/min** (a multi-coordinate request counts as one). Geocoding/Search
**1,000 req/min**. Both adjustable per account. Neither is close to binding at pilot volume.

## Open: what `rides.distance_meters` should hold

**Unresolved, and it needs the Mapbox Product Terms read directly.** Nothing writes those columns
yet, so nothing is broken — but the answer changes what they mean.

1. **Storing geocoded coordinates may need a different product.** Mapbox's default terms are
   "temporary": you may show a result and put it on a map, but not persist the coordinates.
   `rides.pickup_lat/lng` persists them. Storing requires the permanent variant, which is
   separately billed. `buildForwardSearchUrl` takes an explicit `permanent` flag rather than
   defaulting, because getting this wrong is a terms violation rather than a bug.

2. **Storing routing results may not be permitted at all** on a self-serve plan. Third-party
   summaries of the October 2025 Product Terms quote a clause forbidding export, caching or
   storage of Directions results without an enterprise agreement. **This has not been verified
   against the primary source.**

If (2) holds, `rides.distance_meters` should be filled from the driver app's location trace rather
than from a routed estimate — which is arguably the better design regardless. A routed estimate
made *before* a trip and the *actual* distance driven are different numbers, and a completed ride's
record ought to hold what happened, not what was predicted. The PostGIS migration's comment
("filled at completion from the mapping provider when there is one") anticipates the estimate; that
comment may need superseding.

`measureRoute` already sets `cache: "no-store"`, which is the terms-safe choice under either
reading.

## Map rendering — built

`apps/web/src/lib/maps/map.ts` is the only file in the repo importing `mapbox-gl`, enforced by
`scripts/check-context.mjs` rule 7. It exports `createRideMap()`, which returns an opaque
`RideMapHandle` (`setPickup`, `setDropoff`, `drawRoute`, `fitToRoute`, `destroy`) rather than a
Mapbox `Map` instance — the same "no vendor shape crosses the boundary" rule `types.ts` states for
`Place` and `RouteMeasurement`, held on the rendering side too. `mapbox-gl` is dynamically
imported so it can never land in a server bundle.

Markers are Midnight DOM elements, not Mapbox's default pin (`brand/design-system.md`). The route
line is a GL layer, whose `line-color` paint property needs a literal colour rather than a CSS
variable — the one documented exception to "never a hex in a component" in
`apps/web/CLAUDE.md`, scoped to this file alone; it reads `--color-midnight` off `:root` at
runtime rather than hardcoding it a second time.

`apps/web/src/lib/maps/map-geometry.ts` holds the one genuinely pure piece — computing a bounding box from
two coordinates or a route's geometry, with a fallback widening so `fitBounds` never zooms in on a
zero-area box. It's tested directly; `map.ts` itself is vendor glue that needs a DOM, verified by
looking at the screen rather than by a unit test, per ADR-0007's carve-out for that kind of code.

`apps/web/src/components/domain/RideMap.tsx` is the Client Component boundary — it owns the container ref
and the mount/unmount lifecycle, and receives only app types (`Coordinates`, `RouteGeometry`).

`apps/web/src/app/dev/maps/` is the proving ground: two debounced place searches
(`searchPlaces()`), a server action (`actions.ts`) that calls `measureRoute()` then
`apps/web/src/lib/fares/server.ts`'s `quoteRide()`, and a rendered map with the result. 404s outside
development (`NODE_ENV === "production"` short-circuits before the page does anything else, so it
prerenders as a static 404 rather than staying dynamic) and is gated by `requireUser()` behind
that, matching `/account` and `/drive` — the fare quote underneath it reads `fare_rate_cards`,
which RLS restricts to `authenticated`. Not linked from anywhere.

## Still unbuilt

The `quote-ride` Edge Function (nothing asks for a quote outside `/dev/maps` yet — it needs the
booking flow, not this module) and anything that writes a `rides` row.
