/**
 * Pure geometry for fitting a map view to a set of points or a route line.
 *
 * Split out from `map.ts` because this part has no DOM and no `mapbox-gl` dependency — it can be
 * tested directly, the way the vendor glue in `map.ts` cannot without a browser. ADR-0007 asks
 * pure `lib/` logic to ship with tests; this is the slice of "draw a map" that qualifies.
 */

import type { Coordinates, RouteGeometry } from "./types.ts";

/** A bounding box in the same lng/lat order as everything else in this module. */
export interface LngLatBounds {
  readonly sw: Coordinates;
  readonly ne: Coordinates;
}

/**
 * Fallback half-width, in degrees, used when every point coincides — a pickup and dropoff at the
 * same spot, or a single point. `fitBounds` on a zero-area box zooms in as far as the map allows,
 * which reads as a bug rather than "very close by". ~150m at San Diego's latitude: enough to keep
 * a marker from filling the screen without misleading anyone about scale.
 */
const MIN_SPAN_DEGREES = 0.0015;

/**
 * The smallest box containing every point, widened off a degenerate (zero-width or zero-height)
 * box so `fitBounds` always has something to fit to. Throws on an empty list — there is no
 * smallest box containing nothing.
 */
export function boundsForCoordinates(points: readonly Coordinates[]): LngLatBounds {
  const first = points[0];
  if (!first) {
    throw new Error("boundsForCoordinates: at least one point is required");
  }

  let minLng = first.lng;
  let maxLng = first.lng;
  let minLat = first.lat;
  let maxLat = first.lat;

  for (const point of points) {
    if (point.lng < minLng) minLng = point.lng;
    if (point.lng > maxLng) maxLng = point.lng;
    if (point.lat < minLat) minLat = point.lat;
    if (point.lat > maxLat) maxLat = point.lat;
  }

  if (minLng === maxLng) {
    minLng -= MIN_SPAN_DEGREES;
    maxLng += MIN_SPAN_DEGREES;
  }
  if (minLat === maxLat) {
    minLat -= MIN_SPAN_DEGREES;
    maxLat += MIN_SPAN_DEGREES;
  }

  return { sw: { lng: minLng, lat: minLat }, ne: { lng: maxLng, lat: maxLat } };
}

/**
 * Same box, from a route's drawn line rather than just its endpoints — so a route that bows out
 * (a detour around a closure, a freeway loop) still fits entirely in view, not just its start and
 * end.
 */
export function boundsForGeometry(geometry: RouteGeometry): LngLatBounds {
  return boundsForCoordinates(geometry.coordinates.map(([lng, lat]) => ({ lng, lat })));
}
