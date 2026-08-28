/**
 * Building and reading Mapbox Search Box requests. **Pure — no fetch, no clock, no env.**
 *
 * Why Search Box and not the Geocoding API: Geocoding v6 covers addresses, streets and postcodes
 * but carries **no POI data** — POIs were removed in v6. RIDO's first market is UCSD, where riders
 * will type "Geisel Library" and "Price Center", not street addresses. Geocoding alone would not
 * find the places our riders actually go.
 *
 * Why `/forward` and not `/suggest` + `/retrieve`: the two endpoints bill differently — `/forward`
 * per request against a large free allowance, `/suggest` per *session* against a much smaller one.
 * At pilot volume the request model is free where the session model is not. The trade is that
 * `/forward` has no session-scoped typeahead, so callers debounce instead of firing per keystroke.
 * Revisit if search volume ever approaches the request allowance; the switch is confined to this
 * file. Figures and dates: `docs/business/mapbox-costs.md`.
 *
 * **Everything this file returns is display-only.** Search Box results may not be stored — at any
 * price, under any parameter. Permanent storage rights are a *Geocoding API* feature, and Search
 * Box has no storable tier. A coordinate from here may be shown, mapped, and used to ask Mapbox
 * for a route; it may never reach a database column.
 *
 * This module used to take a `permanent` flag, which Search Box does not accept — it read as a
 * safety mechanism and did nothing, which is more dangerous than its absence. The storable path is
 * `./geocode.ts`, and it is a different API. (ADR-0011)
 */

import { failed, type MapsResult } from "./result.ts";
import type { Coordinates, Place } from "./types.ts";

const SEARCH_ORIGIN = "https://api.mapbox.com/search/searchbox/v1";

/** First market is San Diego. Widen this when a second market lands, not before. */
const COUNTRY = "us";
const DEFAULT_LIMIT = 5;

export interface ForwardSearchInput {
  readonly query: string;
  readonly accessToken: string;
  /** Bias results toward here — usually the map centre. Cheap, and hugely improves relevance. */
  readonly near?: Coordinates;
  readonly limit?: number;
}

export function buildForwardSearchUrl(input: ForwardSearchInput): string {
  const { query, accessToken, near, limit } = input;

  if (!query.trim()) throw new Error("buildForwardSearchUrl: query is required");
  if (!accessToken) throw new Error("buildForwardSearchUrl: accessToken is required");

  const params = new URLSearchParams({
    q: query.trim(),
    country: COUNTRY,
    limit: String(limit ?? DEFAULT_LIMIT),
    access_token: accessToken,
  });
  if (near) params.set("proximity", `${near.lng},${near.lat}`);

  return `${SEARCH_ORIGIN}/forward?${params.toString()}`;
}

export interface ReverseSearchInput {
  readonly at: Coordinates;
  readonly accessToken: string;
}

/** Coordinates to a street address — for a dropped pin, or a device's GPS fix. */
export function buildReverseUrl(input: ReverseSearchInput): string {
  const { at, accessToken } = input;

  if (!accessToken) throw new Error("buildReverseUrl: accessToken is required");

  const params = new URLSearchParams({
    longitude: String(at.lng),
    latitude: String(at.lat),
    access_token: accessToken,
  });

  return `${SEARCH_ORIGIN}/reverse?${params.toString()}`;
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
 * One Search Box feature as a RIDO `Place`, or null if it isn't usable.
 *
 * **Every vendor field is dropped here.** No `mapbox_id` internals, no `context` array, no
 * `relevance` score, no `feature_type` reaches a caller — a `Place` has exactly four fields. That
 * is the ADR-0006 boundary doing its job: a component depending on `relevance` would quietly bind
 * this app to Mapbox's ranking model.
 */
function toPlace(feature: unknown): Place | null {
  if (!isRecord(feature)) return null;
  const properties = isRecord(feature.properties) ? feature.properties : {};

  const name = typeof properties.name === "string" ? properties.name : null;
  if (!name) return null;

  const id =
    typeof properties.mapbox_id === "string"
      ? properties.mapbox_id
      : typeof feature.id === "string"
        ? feature.id
        : null;
  if (!id) return null;

  // `full_address` includes the place name; `address` is just the street line. Prefer the fuller
  // one, fall back, and null out the case where it merely repeats the name back.
  const candidate =
    typeof properties.full_address === "string"
      ? properties.full_address
      : typeof properties.address === "string"
        ? properties.address
        : null;
  const address = candidate && candidate !== name ? candidate : null;

  return { id, name, address, coordinates: readCoordinates(feature.geometry) };
}

/**
 * A Search Box FeatureCollection as `Place[]`.
 *
 * An empty `features` array is a successful search that found nothing — `ok: true` with `[]`, not
 * a failure. "No results" is an answer; a caller renders it differently from "search broke".
 */
export function parsePlaces(body: unknown): MapsResult<Place[]> {
  if (!isRecord(body) || !Array.isArray(body.features)) {
    return failed("We couldn't read that search result. Try again.");
  }

  const places: Place[] = [];
  for (const feature of body.features) {
    const place = toPlace(feature);
    if (place) places.push(place);
  }
  return { ok: true, data: places };
}
