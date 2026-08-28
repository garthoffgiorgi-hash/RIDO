"use server";

import type { FareBreakdown } from "@rido/pricing";
import { requireUser } from "@/lib/auth/server";
import { quoteRide } from "@/lib/fares/server";
import { measureRoute } from "@/lib/maps/server";
import type { Coordinates, RouteGeometry } from "@/lib/maps/types";

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
