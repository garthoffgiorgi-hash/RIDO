"use server";

import type { FareBreakdown } from "@rido/pricing";
import { requireUser } from "@/lib/auth/server";
import { quoteRide } from "@/lib/fares/server";
import { distanceBetweenMetres } from "@/lib/maps/map-geometry";
import { measureRoute, resolveStorableCoordinates } from "@/lib/maps/server";
import type { Coordinates, Place, RouteGeometry } from "@/lib/maps/types";

/**
 * The one server action this page needs: measure the trip, then price it. Proves the two
 * server-only halves — `measureRoute()` (ADR-0010) and `quoteRide()` (ADR-0009) — actually agree
 * end to end, against a real Mapbox account and a real `fare_rate_cards` row.
 *
 * `market` is fixed to San Diego rather than exposed as a form field: this page proves the
 * pipeline works, it isn't the place to explore other markets.
 */
const MARKET = "san-diego";

export interface DevRouteQuote {
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly geometry: RouteGeometry | null;
  readonly fareCents: number;
  readonly riderTotalCents: number;
  readonly breakdown: FareBreakdown;
}

export type DevRouteQuoteResult =
  | { readonly ok: true; readonly data: DevRouteQuote }
  | { readonly ok: false; readonly message: string };

export async function getRouteQuote(
  pickup: Coordinates,
  dropoff: Coordinates,
): Promise<DevRouteQuoteResult> {
  // A Server Action is its own HTTP endpoint, reachable independent of the page around it — the
  // page's requireUser() gate does not cover it. Same reasoning as every other write path here.
  await requireUser();

  const measurement = await measureRoute(pickup, dropoff);
  if (!measurement.ok) return measurement;

  const quote = await quoteRide(measurement.data, MARKET);
  if (!quote.ok) return quote;

  return {
    ok: true,
    data: {
      distanceMeters: measurement.data.distanceMeters,
      durationSeconds: measurement.data.durationSeconds,
      geometry: measurement.data.geometry,
      fareCents: quote.data.fareCents,
      riderTotalCents: quote.data.riderTotalCents,
      breakdown: quote.data.breakdown,
    },
  };
}

export interface StorableCoordinateReport {
  /** What Search Box returned — display-only, may never be persisted. */
  readonly displayed: Coordinates;
  /** What Geocoding v6 returned with `permanent=true` — the one that may reach a rides row. */
  readonly storable: Coordinates;
  readonly driftMetres: number;
}

export type StorableCoordinateResult =
  | { readonly ok: true; readonly data: StorableCoordinateReport }
  | { readonly ok: false; readonly message: string };

/**
 * Resolves a storable coordinate for a place, and reports how far it landed from the displayed
 * one. **This is the only call in the codebase that spends money on the first request** —
 * permanent geocoding has no free tier — which is why it is behind a deliberate button rather
 * than firing whenever a place is selected.
 *
 * Nothing in a booking flow calls this. It exists so the permanent product can be confirmed
 * enabled on the account before ADR-0011's turn-on trigger is ever pulled.
 */
export async function getStorableCoordinate(place: Place): Promise<StorableCoordinateResult> {
  await requireUser();

  const displayed = place.coordinates;
  if (!displayed) {
    return { ok: false, message: "That place has no coordinate to compare against." };
  }

  const resolved = await resolveStorableCoordinates(place);
  if (!resolved.ok) return resolved;

  return {
    ok: true,
    data: {
      displayed,
      storable: resolved.data,
      driftMetres: Math.round(distanceBetweenMetres(displayed, resolved.data)),
    },
  };
}
