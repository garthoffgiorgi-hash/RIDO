import "server-only";

import { mapsErrorMessage } from "./errors.ts";
import { buildPermanentForwardUrl, parseGeocodingFeatures } from "./geocode.ts";
import { distanceBetweenMetres } from "./map-geometry.ts";
import { buildDirectionsUrl, measurementFromBody, redactToken } from "./route.ts";
import { failed, type MapsResult } from "./result.ts";
import type { Coordinates, Place, RouteMeasurement } from "./types.ts";

/**
 * The trust boundary, in one file.
 *
 * > **The browser may name two places. Only the server may measure the trip between them.**
 *
 * If a rider's device measured its own trip and sent us "1.2 miles, 6 minutes", anyone could edit
 * that number and pay a minimum fare to reach the airport. So the client sends two *places* and
 * `measureRoute` — here, on the server, with a secret token — asks Mapbox how far apart they
 * actually are. That measurement is the only one permitted to reach `quoteFare()`.
 *
 * This is invariants 1 and 2 in the root `CLAUDE.md` ("all money math is server-computed and never
 * trusted from a client") applied to the one input that didn't exist until now. `import
 * "server-only"` makes importing this from a client component a **build error, not a review
 * catch** — the same mechanism `auth/server.ts` and `drivers/server.ts` use.
 *
 * Nothing here calls `quoteFare`. Money math lives in `packages/pricing`; this module supplies an
 * input to it, and keeping the two apart is what lets a caller mock one without mocking the other.
 */

/**
 * How long to wait for Mapbox before giving up.
 *
 * A hung routing call must not hang a quote. Four seconds is well past Directions' normal
 * response time and well inside what a rider will wait staring at a "getting your price" spinner.
 */
const TIMEOUT_MS = 4_000;

/**
 * Measures the driving trip between two points.
 *
 * Never throws and never returns a vendor shape: every failure — misconfiguration, network,
 * timeout, or Mapbox's HTTP-200 `NoRoute` — comes back as `ok: false` with a message already in
 * RIDO's voice.
 *
 * **Fails closed.** With no token configured it returns a failure rather than a fabricated
 * measurement. A quote is either real or it doesn't exist; there is no degraded mode where a rider
 * is quoted a guess.
 */
export async function measureRoute(
  pickup: Coordinates,
  dropoff: Coordinates,
): Promise<MapsResult<RouteMeasurement>> {
  const accessToken = process.env.MAPBOX_SECRET_TOKEN;
  if (!accessToken) {
    return failed(mapsErrorMessage({ status: 401, raw: "MAPBOX_SECRET_TOKEN is not set" }));
  }

  let url: string;
  try {
    // Throws on a coordinate that isn't on Earth — the lat/lng swap guard. A programmer error
    // rather than something a rider did, but it must not reach a user as a stack trace.
    url = buildDirectionsUrl({ pickup, dropoff, accessToken });
  } catch (error) {
    return failed(mapsErrorMessage({ code: "InvalidInput", raw: messageOf(error) }));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      // A traffic-aware duration must never be served from Next's fetch cache: a cached answer is
      // a stale price. This is also the terms-safe choice — Mapbox's Navigation terms restrict
      // storing routing results. See docs/architecture/maps.md.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    // The URL carries the token in its query string, so anything derived from it is redacted
    // before it can reach a log line.
    return failed(mapsErrorMessage({ raw: redactToken(messageOf(error)) }));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  // Mapbox signals a routing failure with HTTP 200 and a `code` in the body, so the status alone
  // is not the answer — but a non-2xx still needs reporting even when the body is unreadable.
  if (!response.ok) {
    const code =
      typeof (body as { code?: unknown })?.code === "string"
        ? (body as { code: string }).code
        : undefined;
    const raw =
      typeof (body as { message?: unknown })?.message === "string"
        ? (body as { message: string }).message
        : undefined;
    return failed(mapsErrorMessage({ status: response.status, code, raw: redactRaw(raw) }));
  }

  return measurementFromBody(body, (code) => mapsErrorMessage({ status: 200, code }));
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** Mapbox's own error strings can echo the token back. Never pass one through unfiltered. */
const redactRaw = (raw: string | undefined): string | undefined =>
  raw === undefined
    ? undefined
    : redactToken(raw).replace(/\b(pk|sk)\.[A-Za-z0-9._-]+/g, "$1.REDACTED");

/**
 * How far a permanent geocode may land from the point the rider actually tapped, in metres.
 *
 * A POI search returns a building's centroid; re-geocoding its street address returns a point on
 * the road. On a campus those legitimately differ by a couple of hundred metres — Geisel's
 * centroid against its Gilman Drive address is well inside this. What this catches is the other
 * failure: v6 matching a *different* place with a similar address, which would send a driver
 * somewhere the rider never chose.
 *
 * Deliberately generous. A false rejection costs one failed booking; a false acceptance puts a
 * car on the wrong street.
 */
const MAX_GEOCODE_DRIFT_METRES = 500;

/**
 * Turns a place the rider picked into a coordinate we are allowed to keep.
 *
 * **The terms problem, in one function.** Search Box knows POIs but its results may not be stored
 * at any price; Geocoding v6 grants storage rights but knows only addresses. So this takes the
 * *address line* of a Search Box result and looks it up again through v6 with `permanent=true`.
 * The coordinate that comes back is the one that may reach `rides.pickup_lat/lng`. (ADR-0011)
 *
 * **Switched off for the pilot.** Permanent geocoding has no free tier and bills from the first
 * request, so nothing in the booking flow calls this — the pilot stores `pickup_address` and
 * defers the geocode to a backfill that is both later and cheaper. Its only caller today is the
 * deliberate button on `/dev/maps`. The written trigger to turn it on is in ADR-0011.
 *
 * **Fails closed**, the same posture `measureRoute` takes. A place with no address cannot be
 * re-geocoded, and falling back to the display coordinate would silently persist exactly the
 * thing this function exists to avoid — so that path does not exist.
 */
export async function resolveStorableCoordinates(place: Place): Promise<MapsResult<Coordinates>> {
  const accessToken = process.env.MAPBOX_SECRET_TOKEN;
  if (!accessToken) {
    return failed(mapsErrorMessage({ status: 401, raw: "MAPBOX_SECRET_TOKEN is not set" }));
  }

  // No address, no storable coordinate. A dropped pin in a parking lot legitimately reaches here;
  // the caller decides whether to refuse the booking or proceed without one.
  if (!place.address) {
    return failed(
      "We couldn't confirm an address for that spot. Try picking it from the list instead.",
    );
  }

  let url: string;
  try {
    url = buildPermanentForwardUrl({
      query: place.address,
      accessToken,
      near: place.coordinates ?? undefined,
    });
  } catch (error) {
    return failed(mapsErrorMessage({ code: "InvalidInput", raw: messageOf(error) }));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      // A permanent geocode is a billed request whose whole point is that we may keep the answer.
      // Caching it here would mean paying for a result we then serve from a copy Mapbox's terms
      // say nothing about — the storage we are licensed for is the rides row, not a fetch cache.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    return failed(mapsErrorMessage({ raw: redactToken(messageOf(error)) }));
  }

  if (!response.ok) {
    return failed(mapsErrorMessage({ status: response.status }));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const places = parseGeocodingFeatures(body);
  if (!places.ok) return places;

  const match = places.data[0];
  if (!match?.coordinates) {
    return failed("We couldn't confirm that address. Try picking the place again.");
  }

  // The disagreement guard. Only meaningful when we have a display coordinate to compare against;
  // a Place without one has nothing to contradict.
  if (place.coordinates) {
    const drift = distanceBetweenMetres(place.coordinates, match.coordinates);
    if (drift > MAX_GEOCODE_DRIFT_METRES) {
      return failed(
        "That address resolved somewhere unexpected. Try picking the place again, or drop a pin.",
      );
    }
  }

  return { ok: true, data: match.coordinates };
}
