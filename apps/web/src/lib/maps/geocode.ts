/**
 * Building and reading Mapbox **Geocoding v6** requests. **Pure — no fetch, no clock, no env.**
 *
 * A second Mapbox search product, and the reason it exists here alongside `places.ts` is a terms
 * distinction, not a technical one:
 *
 * - **Search Box** (`places.ts`) knows POIs — "Geisel Library", "Price Center" — which is what
 *   riders actually type. Its results **may not be stored**, at any price, under any parameter.
 * - **Geocoding v6** (this file) knows only addresses, streets and postcodes. But it supports
 *   `permanent=true`, which grants the right to keep a coordinate in a database column.
 *
 * So the two are used in sequence rather than as alternatives: Search Box finds the place the
 * rider means, and this re-looks-up that place's *address line* to obtain a coordinate we are
 * allowed to persist. The slight drift between a building's centroid and its street address is
 * acceptable and arguably desirable — a car needs a point on a road, not the middle of a library.
 *
 * `permanent=true` is **not an argument**. This module exists only for the storable case, so the
 * flag is set unconditionally and cannot be forgotten at a call site — the same reasoning that
 * put `shouldCreateUser: false` inside `apps/web/src/lib/auth/browser.ts` rather than leaving it
 * to callers (ADR-0006).
 *
 * **Permanent geocoding costs real money from the first request** — no free tier, and a payment
 * method must be on file. It is switched OFF for the pilot; see ADR-0011 for why and for the
 * written trigger to turn it on. The only caller today is `/dev/maps`.
 */

import { failed, type MapsResult } from "./result.ts";
import type { Coordinates, Place } from "./types.ts";

const GEOCODE_ORIGIN = "https://api.mapbox.com/search/geocode/v6";

/** First market is San Diego, matching `places.ts`. Widen when a second market lands. */
const COUNTRY = "us";

/**
 * One result, deliberately. Unlike search — where a rider picks from a list — this is a lookup of
 * an address the rider has *already chosen*, so a list would have nothing to disambiguate against.
 * Each extra result is also a billed request we would then discard.
 */
const LIMIT = 1;

export interface PermanentForwardInput {
  /** The address line to resolve — `Place.address`, not `Place.name`; v6 has no POI data. */
  readonly query: string;
  readonly accessToken: string;
  /** Bias toward the display coordinate we already have. Improves the match, costs nothing. */
  readonly near?: Coordinates;
}

export function buildPermanentForwardUrl(input: PermanentForwardInput): string {
  const { query, accessToken, near } = input;

  if (!query.trim()) throw new Error("buildPermanentForwardUrl: query is required");
  if (!accessToken) throw new Error("buildPermanentForwardUrl: accessToken is required");

  const params = new URLSearchParams({
    q: query.trim(),
    country: COUNTRY,
    limit: String(LIMIT),
    // Unconditional, and the whole point of this module. See the header.
    permanent: "true",
    access_token: accessToken,
  });
  if (near) params.set("proximity", `${near.lng},${near.lat}`);

  return `${GEOCODE_ORIGIN}/forward?${params.toString()}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function readCoordinates(geometry: unknown): Coordinates | null {
  if (!isRecord(geometry) || !Array.isArray(geometry.coordinates)) return null;
  const [lng, lat] = geometry.coordinates;
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  return { lng, lat };
}

/**
 * One Geocoding v6 feature as a `Place`, or null if it isn't usable.
 *
 * v6's `properties` shape differs from Search Box's — `full_address` and `name` are present but
 * the identifier is `mapbox_id` at the property level, and there is no `feature_type` worth
 * keeping. Same discipline as `parsePlaces`: **every vendor field is dropped**, so a `Place` from
 * either API is indistinguishable to a caller (ADR-0006).
 *
 * A feature with no coordinates is skipped rather than returned with `coordinates: null`. This
 * module's entire purpose is producing a storable coordinate, so a result without one is not a
 * partial answer — it is no answer.
 */
function toPlace(feature: unknown): Place | null {
  if (!isRecord(feature)) return null;
  const properties = isRecord(feature.properties) ? feature.properties : {};

  const coordinates = readCoordinates(feature.geometry);
  if (!coordinates) return null;

  const fullAddress = typeof properties.full_address === "string" ? properties.full_address : null;
  const name =
    typeof properties.name === "string" && properties.name ? properties.name : fullAddress;
  if (!name) return null;

  const id =
    typeof properties.mapbox_id === "string"
      ? properties.mapbox_id
      : typeof feature.id === "string"
        ? feature.id
        : null;
  if (!id) return null;

  const address = fullAddress && fullAddress !== name ? fullAddress : null;

  return { id, name, address, coordinates };
}

/**
 * A Geocoding v6 FeatureCollection as `Place[]`.
 *
 * An empty `features` array is a successful lookup that matched nothing — `ok: true` with `[]`.
 * "No match" is an answer; the caller decides whether that is fatal, and for
 * `resolveStorableCoordinates` it is.
 */
export function parseGeocodingFeatures(body: unknown): MapsResult<Place[]> {
  if (!isRecord(body) || !Array.isArray(body.features)) {
    return failed("We couldn't confirm that address. Try picking the place again.");
  }

  const places: Place[] = [];
  for (const feature of body.features) {
    const place = toPlace(feature);
    if (place) places.push(place);
  }
  return { ok: true, data: places };
}
