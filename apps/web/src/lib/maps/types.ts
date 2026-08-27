/**
 * App-shaped types for the maps boundary. **No vendor type crosses this line.**
 *
 * A component receives a `Place` and a `RouteMeasurement`; it never sees a Mapbox
 * `Feature`, a `mapbox_id`, a `relevance` score, or a `Map` instance. That's ADR-0006's
 * rule made structural: a component that cannot receive a vendor shape cannot depend on one,
 * so swapping or upgrading the provider touches this directory and nothing else.
 */

/**
 * WGS84. **Longitude first, everywhere in this module** — Mapbox's order, and the one that bites.
 *
 * Almost everything else in RIDO says lat/lng: `rides.pickup_lat` comes before `pickup_lng`, and
 * the PostGIS migration carries its own warning that `ST_MakePoint` takes `(x, y)`. The field
 * names here are explicit precisely so a positional swap is impossible — you cannot pass
 * `{ lng, lat }` in the wrong order, only spell a key wrong, which the compiler catches.
 */
export interface Coordinates {
  readonly lng: number;
  readonly lat: number;
}

/**
 * A place a rider can name. `id` is the provider's identifier, kept **opaque** — nothing
 * downstream parses it, and nothing outside this module should ever need to.
 *
 * `address` and `coordinates` are nullable because search results legitimately arrive without
 * them (a region, a partial match). A caller that needs coordinates checks for them rather than
 * discovering `undefined` two layers later.
 */
export interface Place {
  readonly id: string;
  /** What the rider recognises: "Geisel Library". */
  readonly name: string;
  /** The full street line, when there is one: "9500 Gilman Dr, La Jolla, CA 92093". */
  readonly address: string | null;
  readonly coordinates: Coordinates | null;
}

/** A drawable route line. Display only — see `RouteMeasurement.geometry`. */
export interface RouteGeometry {
  readonly type: "LineString";
  readonly coordinates: readonly (readonly [number, number])[];
}

/**
 * What a routing engine measured.
 *
 * **Both figures are integers.** `quoteFare()` calls `requireNonNegativeInteger` on each and
 * throws on anything else, and Mapbox returns floats — so the rounding that guarantees this
 * happens once, in `parseDirectionsBody`, and never at a call site. The type is the contract:
 * if you are holding a `RouteMeasurement`, the conversion has already happened.
 *
 * Structurally a superset of `quoteFare`'s distance/duration input, deliberately, so
 * `quoteFare({ ...measurement, rateCard })` type-checks and nobody has to remember which field
 * maps to which argument.
 */
export interface RouteMeasurement {
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  /** For drawing the line on a map. **Never priced** — the two numbers above are the fare input. */
  readonly geometry: RouteGeometry | null;
}
