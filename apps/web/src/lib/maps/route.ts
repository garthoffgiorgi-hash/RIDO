/**
 * Building and reading a Mapbox Directions request. **Pure — no fetch, no clock, no env.**
 *
 * This is the file where a float becomes an integer, which makes it the file where a bug becomes
 * a wrong fare. `quoteFare()` calls `requireNonNegativeInteger(distanceMeters, ...)` and throws on
 * anything else; Mapbox returns `distance` and `duration` as floating-point numbers. The
 * conversion between those two facts happens here, once, and is tested — rather than inside an
 * `async` function CI can never run.
 *
 * It is deliberately free of Next, of `mapbox-gl`, and of anything that isn't a language builtin,
 * and its relative imports carry the `.ts` extension. That's what would let a future `quote-ride`
 * Edge Function on Deno import it directly, the same property that makes `packages/pricing` work
 * across three runtimes.
 */

import { failed, type MapsResult } from "./result.ts";
import type { Coordinates, RouteGeometry, RouteMeasurement } from "./types.ts";

const DIRECTIONS_ORIGIN = "https://api.mapbox.com/directions/v5";

/**
 * Live-traffic driving, not plain `driving`.
 *
 * The rate card charges per minute, so a traffic-blind duration systematically under-prices rush
 * hour — exactly when a driver most needs the fare to reflect the work. Mapbox falls back to
 * `driving` where it has no traffic coverage, so there's no failure mode to handle here, just a
 * less good number. Named rather than inlined because a future surge model may want both.
 */
export const DRIVING_PROFILE = "mapbox/driving-traffic";

/**
 * Coordinate precision in the request URL. Six decimal places is ~11 cm — past that is noise, and
 * a stable URL is one that could be cached if we ever wanted to.
 */
const COORDINATE_DECIMALS = 6;

const formatCoordinate = (value: number): string =>
  String(Number(value.toFixed(COORDINATE_DECIMALS)));

/**
 * Rejects a coordinate that isn't on Earth, **before** it becomes a request.
 *
 * This is the guard against the classic Mapbox bug. Mapbox takes `{longitude},{latitude}`; nearly
 * every other API in this repo says lat/lng. A San Diego pair passed the wrong way round has a
 * "latitude" of −117, which is out of range — so instead of a valid-looking request for a point in
 * the Indian Ocean, or a `NoSegment`, or (worst) a plausible route with a wrong distance, you get
 * an exception naming the field. **The classic bug becomes a crash instead of a wrong price.**
 *
 * Throws rather than returning a result: a caller cannot recover from this, and it is a programmer
 * error rather than something a rider did.
 */
function assertOnEarth(point: Coordinates, label: string): void {
  const { lng, lat } = point;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error(
      `buildDirectionsUrl: ${label}.lng must be a longitude within ±180, got ${lng} — did lat and lng get swapped?`,
    );
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error(
      `buildDirectionsUrl: ${label}.lat must be a latitude within ±90, got ${lat} — did lat and lng get swapped?`,
    );
  }
}

export interface DirectionsUrlInput {
  readonly pickup: Coordinates;
  readonly dropoff: Coordinates;
  readonly accessToken: string;
}

/** The Directions request for one pickup and one dropoff. */
export function buildDirectionsUrl(input: DirectionsUrlInput): string {
  const { pickup, dropoff, accessToken } = input;

  assertOnEarth(pickup, "pickup");
  assertOnEarth(dropoff, "dropoff");
  if (!accessToken) {
    throw new Error("buildDirectionsUrl: accessToken is required");
  }

  const path = [pickup, dropoff]
    .map((p) => `${formatCoordinate(p.lng)},${formatCoordinate(p.lat)}`)
    .join(";");

  const query = new URLSearchParams({
    geometries: "geojson",
    overview: "full",
    steps: "false",
    alternatives: "false",
    access_token: accessToken,
  });

  return `${DIRECTIONS_ORIGIN}/${DRIVING_PROFILE}/${path}?${query.toString()}`;
}

/**
 * Removes the access token from a URL so it can safely reach a log line or an error message.
 *
 * A Mapbox URL carries its credential in the query string, which means every naive
 * `console.error(url)` and every "request failed: <url>" message is a token leak into whatever
 * collects logs. Anything in this module that could surface a URL goes through here first.
 */
export function redactToken(url: string): string {
  return url.replace(/([?&]access_token=)[^&]*/g, "$1REDACTED");
}

export type DirectionsParse =
  | { readonly ok: true; readonly measurement: RouteMeasurement }
  | { readonly ok: false; readonly code: string };

interface MapboxRouteShape {
  distance?: unknown;
  duration?: unknown;
  geometry?: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A GeoJSON LineString, if that's what this is. Display-only, so a bad one is dropped, not fatal. */
function readGeometry(value: unknown): RouteGeometry | null {
  if (!isRecord(value) || value.type !== "LineString" || !Array.isArray(value.coordinates)) {
    return null;
  }
  const coordinates: (readonly [number, number])[] = [];
  for (const pair of value.coordinates) {
    if (!Array.isArray(pair) || pair.length < 2) return null;
    const [lng, lat] = pair;
    if (typeof lng !== "number" || typeof lat !== "number") return null;
    coordinates.push([lng, lat]);
  }
  return { type: "LineString", coordinates };
}

/**
 * Turns an already-JSON-parsed Directions body into a `RouteMeasurement`, or says why it can't.
 *
 * Takes a parsed body rather than a `Response` so the whole thing stays pure and testable against
 * committed fixtures. The caller does the network; this decides what the answer means.
 *
 * **The rounding.** `Math.round`, not floor or ceil — nearest, and deliberately neutral rather
 * than house-favourable. Against the seeded San Diego card, one metre of distance is 0.066¢ and
 * one second of duration is 0.45¢, so the choice is sub-cent either way. Stating the number is how
 * you show it doesn't matter, rather than asserting that it doesn't.
 *
 * Everything that isn't a usable measurement returns `ok: false` with Mapbox's own code, so
 * `mapsErrorMessage` can say something specific. Notably `code: "NoRoute"` arrives with HTTP 200.
 */
export function parseDirectionsBody(body: unknown): DirectionsParse {
  if (!isRecord(body)) {
    return { ok: false, code: "MalformedResponse" };
  }

  const code = typeof body.code === "string" ? body.code : "MalformedResponse";
  if (code !== "Ok") {
    return { ok: false, code };
  }

  if (!Array.isArray(body.routes) || body.routes.length === 0) {
    // Mapbox says Ok but gave us nothing to price. Report it as NoRoute rather than as success
    // with zeros, which would quote a rider the minimum fare for a trip we can't route.
    return { ok: false, code: "NoRoute" };
  }

  const route = body.routes[0] as MapboxRouteShape;
  const { distance, duration } = route;

  if (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0) {
    return { ok: false, code: "MalformedResponse" };
  }
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
    return { ok: false, code: "MalformedResponse" };
  }

  return {
    ok: true,
    measurement: {
      distanceMeters: Math.round(distance),
      durationSeconds: Math.round(duration),
      geometry: readGeometry(route.geometry),
    },
  };
}

/**
 * The whole read path in one call: parse the body, and on failure translate the code into a
 * message a component can render. Kept separate from `parseDirectionsBody` so tests can assert on
 * the code without depending on copy.
 */
export function measurementFromBody(
  body: unknown,
  toMessage: (code: string) => string,
): MapsResult<RouteMeasurement> {
  const parsed = parseDirectionsBody(body);
  return parsed.ok ? { ok: true, data: parsed.measurement } : failed(toMessage(parsed.code));
}
