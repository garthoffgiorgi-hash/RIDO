# maps fixtures

What `errors.test.ts`, `route.test.ts`, `places.test.ts` and `geocode.test.ts` parse instead of
calling the network.
Tests here must never make a real request: CI has no Mapbox token, and a green build should not
depend on a third party's uptime or spend anyone's quota.

## Provenance — read this before trusting them

**These are hand-constructed from Mapbox's documented response shapes, not captured from the live
API.** They were written on 2026-08-27, when RIDO had no Mapbox account and `docs.mapbox.com` was
unreachable from the authoring session.

That makes them good enough to pin *our* parsing behaviour — the float-to-integer rounding, the
HTTP-200 `NoRoute` case, the "no vendor field survives" rule — and **not** good enough to prove we
read Mapbox's real output correctly. The difference matters: a fixture invented from a doc can
share a wrong assumption with the code that reads it.

**Replace each one with a real capture as soon as a token exists.** The tests should pass
unchanged when you do — if they don't, the fixture was wrong and the test just earned its keep.

To capture: run the request by hand, save the body, **strip the token from anything you save**,
and update the table below with the date.

| File | Shape | Captured |
|---|---|---|
| `directions-ok.json` | Directions, one route, floats in `distance`/`duration` | hand-built 2026-08-27 |
| `directions-no-route.json` | Directions, **HTTP 200**, `code: "NoRoute"` | hand-built 2026-08-27 |
| `directions-no-segment.json` | Directions, **HTTP 200**, `code: "NoSegment"` | hand-built 2026-08-27 |
| `search-forward.json` | Search Box `/forward` FeatureCollection | hand-built 2026-08-27 |
| `geocoding-v6-forward.json` | Geocoding v6 `/forward`, one rooftop address match | hand-built 2026-08-28 |

The two `NoRoute`/`NoSegment` files are the reason this directory exists at all. Mapbox reports
both with a `200 OK`, so a test that only exercises the happy path and a 500 would miss the exact
case that reaches `quoteFare` as `undefined`.
