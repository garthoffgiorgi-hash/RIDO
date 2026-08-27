# ADR-0010 — The client names places; the server measures the trip

**Date:** 2026-08-27
**Status:** Accepted

## Context

`quoteFare()` prices a trip from a distance and a duration. Nothing in the app supplied either
one, which is what "blocked on Mapbox" meant in `roadmap.md`. Closing that gap means deciding
*where* those two numbers come from — and that is a security decision before it is an
integration one.

The tempting shape is the fast one: the rider's browser already has a map, so let it compute the
route and post `{ distanceMeters, durationSeconds }` to the server with the booking. It saves a
round trip and makes the price appear instantly.

It also means the party paying the fare supplies the input the fare is computed from. Editing a
number in a request body is not an exploit that needs a toolkit; it is a browser devtools tab.
The result would be a trip to the airport priced as a campus hop — and, because
`complete-ride` snapshots commission onto the `rides` row and never recomputes it (ADR-0002,
invariant 2), a fabricated fare would land permanently in the accounting record.

Root `CLAUDE.md`'s money invariants already say all money math is server-computed and never
trusted from a client. Distance and duration were simply the one input that didn't exist yet when
those were written, so nothing said so out loud.

Two smaller facts also shaped this:

- **Mapbox reports routing failures with HTTP 200.** A request between two points with no road
  between them returns `200 OK` and `{ "code": "NoRoute", "routes": [] }`. Anything that checks
  only `response.ok` passes `undefined` into `quoteFare`, which throws from a file that has
  nothing to do with the actual problem.
- **Mapbox returns floats; `quoteFare` rejects them.** `requireNonNegativeInteger` throws on a
  non-integer, and Directions returns `distance: 12345.678`. There must be exactly one rounding
  step, in exactly one place.

## Decision

**The browser may name two places. Only the server may measure the trip between them.**

- Place search — turning "Geisel Library" into coordinates — runs in the browser, with a public
  `pk.` token. Search is not money: the worst outcome of a tampered search response is that a
  rider is offered somewhere they didn't ask for, which they notice before getting in a car.
- **Route measurement runs on the server**, with a secret `sk.` token, in
  `apps/web/src/lib/maps/server.ts`. `measureRoute()` is the only function permitted to produce
  the `distanceMeters` and `durationSeconds` that reach `quoteFare()`. It carries
  `import "server-only"`, so importing it from a client component is a build error.
- A client-supplied distance or duration is **never** an input to a price. A client-supplied
  *coordinate pair* is fine — a rider can lie about where they want to go, and they will simply
  be taken there.
- **The float-to-integer conversion happens once**, in `parseDirectionsBody`, and is tested. The
  `RouteMeasurement` type is the contract: holding one means the conversion already happened.
- `measureRoute` **fails closed**. With no token configured it returns a failure, never a
  fabricated measurement. A quote is either real or it doesn't exist.
- Mapbox's own error `code` is a first-class input to error translation alongside the HTTP
  status, because of the 200-means-failure case above.

Two tokens rather than one, because Mapbox enforces URL restrictions via the `Referer` header and
a server-to-server fetch sends none — a properly restricted public token returns 403 from our own
server. Two tokens is what lets the public one actually be restricted.

## Consequences

- A rider's price cannot be moved by anything a rider controls except where they say they're
  going. That is the property this ADR exists to buy.
- Quoting costs a server round trip to Mapbox. Bounded at 4 seconds and never cached — a
  traffic-aware duration served from a cache is a stale price.
- `rides.distance_meters` and `duration_seconds` are **not** written by this work. What those
  columns should hold is now an open question rather than an assumption: a routed *estimate* made
  before a trip and the *actual* distance driven are different numbers, and Mapbox's Navigation
  terms may restrict storing the former. `docs/architecture/maps.md` records both sides.
- `scripts/check-context.mjs` gained rule 7 — no vendor SDK imported outside
  `apps/web/src/lib/` — which closes the TODO ADR-0006 left open ("worth adding when the second
  module lands"). It found two pre-existing violations on the first run; one was fixed, one
  (`apps/web/src/proxy.ts`) is exempted by path because Next.js dictates that file's location and its job
  *is* the wiring.
- The pure half of the module (`route.ts`, `places.ts`, `errors.ts`) has no Next, no
  `mapbox-gl`, and `.ts`-extensioned imports — so a future `quote-ride` Edge Function on Deno can
  import it directly, the same property that makes `packages/pricing` work across three runtimes.
