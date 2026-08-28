/**
 * The only file in this repo that imports `mapbox-gl`. Enforced by `check-context.mjs` rule 7,
 * the same way `src/lib/supabase/` is the only importer of `@supabase/supabase-js`.
 *
 * `types.ts` says it plainly: a component "never sees a Mapbox `Feature`, a `mapbox_id`, a
 * `relevance` score, **or a `Map` instance**." So this module does not export `mapboxgl.Map`. It
 * exports `createRideMap()`, which returns an opaque `RideMapHandle` — a small set of RIDO verbs
 * (`setPickup`, `setDropoff`, `drawRoute`, `fitToRoute`, `destroy`). A caller that only ever sees
 * that handle cannot depend on a mapbox-gl API detail, which is what lets this file be rewritten
 * against a different provider without touching `RideMap.tsx` or anything upstream of it.
 *
 * `mapbox-gl` is dynamically imported rather than imported at module scope. It's a ~230KB
 * (gzipped) library that touches `window` as soon as its module body runs, so a static import
 * risks pulling it into a server bundle the first time this file is reached from one — dynamic
 * import keeps that failure mode from existing at all, not just from being caught in review.
 */

// Mapbox's own stylesheet — positions controls and attribution, not a component's styling.
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Marker } from "mapbox-gl";
import { publicMapToken } from "./browser.ts";
import type { Coordinates, RouteGeometry } from "./types.ts";

/** San Diego / UCSD — the first market, and a reasonable default before a rider has typed anything. */
const DEFAULT_CENTER: Coordinates = { lng: -117.2378, lat: 32.8811 };
const DEFAULT_ZOOM = 12;

const ROUTE_SOURCE_ID = "rido-route";
const ROUTE_LAYER_ID = "rido-route-line";

/** Reads the CSS custom property so map colours stay in sync with `globals.css`'s `@theme`. */
function themeColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export interface RideMapHandle {
  setPickup(at: Coordinates | null): void;
  setDropoff(at: Coordinates | null): void;
  /** Draws (or clears, when passed `null`) the route line. Display only — never priced. */
  drawRoute(geometry: RouteGeometry | null): void;
  /** Frames the camera on whatever pickup/dropoff/route is currently set. No-op if nothing is. */
  fitToRoute(): void;
  /** Tears down the map instance and its event listeners. Call from a cleanup effect. */
  destroy(): void;
}

export interface CreateRideMapOptions {
  readonly container: HTMLElement;
  readonly center?: Coordinates;
  readonly zoom?: number;
}

/**
 * Mounts a Mapbox GL map into `container` and returns a handle for driving it.
 *
 * Rejects when `NEXT_PUBLIC_MAPBOX_TOKEN` is missing, the same fail-closed posture
 * `measureRoute()` takes on the server — a map that silently doesn't render is worse than one
 * that visibly failed to start.
 */
export async function createRideMap(options: CreateRideMapOptions): Promise<RideMapHandle> {
  const token = publicMapToken();
  if (!token) {
    throw new Error(
      "createRideMap: NEXT_PUBLIC_MAPBOX_TOKEN is not set — see apps/web/.env.example.",
    );
  }

  const mapboxgl = (await import("mapbox-gl")).default;
  mapboxgl.accessToken = token;

  const map = new mapboxgl.Map({
    container: options.container,
    style: "mapbox://styles/mapbox/light-v11",
    center: toLngLat(options.center ?? DEFAULT_CENTER),
    zoom: options.zoom ?? DEFAULT_ZOOM,
  });

  let pickupMarker: Marker | null = null;
  let dropoffMarker: Marker | null = null;
  let currentGeometry: RouteGeometry | null = null;
  let styleLoaded = false;
  let destroyed = false;

  const midnight = themeColor("--color-midnight", "#0b2a5b");

  // The route line is a GL layer, which only exists once the style has finished loading — an
  // earlier drawRoute() call is remembered in currentGeometry and applied once it's ready.
  const ready = new Promise<void>((resolve) => {
    map.on("load", () => {
      styleLoaded = true;
      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: emptyFeatureCollection(),
      });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        // A GL layer paint property needs a literal colour value, not a CSS var — the one
        // documented exception to "never a hex in a component" (apps/web/CLAUDE.md), and it's
        // scoped to this file alone.
        paint: { "line-color": midnight, "line-width": 4 },
      });
      if (currentGeometry) applyGeometry(currentGeometry);
      resolve();
    });
  });

  function applyGeometry(geometry: RouteGeometry | null): void {
    if (!styleLoaded || destroyed) return;
    const source = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(geometry ? lineFeatureCollection(geometry) : emptyFeatureCollection());
  }

  function makeMarker(): Marker {
    const el = document.createElement("div");
    el.className = "rido-map-marker";
    el.style.width = "16px";
    el.style.height = "16px";
    el.style.borderRadius = "50%";
    el.style.background = midnight;
    el.style.border = "2px solid white";
    el.style.boxShadow = "0 1px 4px rgba(11, 42, 91, 0.4)";
    return new mapboxgl.Marker({ element: el });
  }

  return {
    setPickup(at) {
      pickupMarker?.remove();
      pickupMarker = at ? makeMarker().setLngLat(toLngLat(at)).addTo(map) : null;
    },
    setDropoff(at) {
      dropoffMarker?.remove();
      dropoffMarker = at ? makeMarker().setLngLat(toLngLat(at)).addTo(map) : null;
    },
    drawRoute(geometry) {
      currentGeometry = geometry;
      void ready.then(() => applyGeometry(geometry));
    },
    fitToRoute() {
      const points: Coordinates[] = [];
      if (pickupMarker) points.push(fromLngLat(pickupMarker.getLngLat()));
      if (dropoffMarker) points.push(fromLngLat(dropoffMarker.getLngLat()));
      if (points.length === 0) return;

      void import("./map-geometry.ts").then(({ boundsForCoordinates, boundsForGeometry }) => {
        const bounds = currentGeometry
          ? boundsForGeometry(currentGeometry)
          : boundsForCoordinates(points);
        map.fitBounds(
          [
            [bounds.sw.lng, bounds.sw.lat],
            [bounds.ne.lng, bounds.ne.lat],
          ],
          { padding: 64, duration: 500 },
        );
      });
    },
    destroy() {
      destroyed = true;
      pickupMarker?.remove();
      dropoffMarker?.remove();
      map.remove();
    },
  };
}

const toLngLat = (c: Coordinates): [number, number] => [c.lng, c.lat];
const fromLngLat = (l: { lng: number; lat: number }): Coordinates => ({ lng: l.lng, lat: l.lat });

function lineFeatureCollection(geometry: RouteGeometry): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: geometry.coordinates.map(([lng, lat]) => [lng, lat]),
        },
      },
    ],
  };
}

function emptyFeatureCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
