import type { MapsResult } from "@/lib/maps/result.ts";
import type { Coordinates } from "@/lib/maps/types.ts";

/**
 * Whether a booking may spend money geocoding a storable coordinate, and what to write when it
 * does (ADR-0029).
 *
 * ADR-0011 deferred coordinate storage for the pilot and left `resolveStorableCoordinates()`
 * built but switched off, because permanent geocoding has no free tier and bills from the first
 * request. Driver navigation is what finally wants those columns — a different motivation than
 * the spatial heatmap ADR-0011's written turn-on trigger named, which is why ADR-0029 exists
 * rather than this being a one-line flip.
 *
 * Pure, and colocated-tested, for the same reason `./live.ts` is: the fail-safe default has to be
 * provable without touching `process.env`, and a `server-only` import would break a plain
 * `node --test` run.
 */

/**
 * Exact-match `"true"`, everything else off — the same shape `parseRidesLive()` uses, and for the
 * same reason. The failure direction here is money rather than legality, but it is still a
 * direction: an unset, empty, misspelled or `"TRUE"` value must never start billing.
 */
export function parseStoreCoordinates(rawValue: string | undefined): boolean {
  return rawValue === "true";
}

export function shouldStoreCoordinates(): boolean {
  return parseStoreCoordinates(process.env.STORE_RIDE_COORDINATES);
}

/** The four nullable columns as `requestRide()`'s insert payload wants them. */
export interface RideCoordinateColumns {
  readonly pickup_lat: number | null;
  readonly pickup_lng: number | null;
  readonly dropoff_lat: number | null;
  readonly dropoff_lng: number | null;
}

const NO_COORDINATES: RideCoordinateColumns = {
  pickup_lat: null,
  pickup_lng: null,
  dropoff_lat: null,
  dropoff_lng: null,
};

/**
 * Turns two best-effort geocode attempts into the columns to write.
 *
 * **A failure writes null, never a fabricated coordinate, and never throws.** A geocode is a
 * nice-to-have that improves a driver's map; a booking is the rider's actual transaction. Losing
 * the second because the first timed out would be the same mistake `captureRideCharge()` and
 * `payoutRide()` are both written to avoid — "neither may turn a completed ride into a failed
 * one" (ADR-0015, ADR-0017), here applied one step earlier in the lifecycle.
 *
 * The two ends are independent on purpose: a dropped-pin pickup with no address can't be
 * geocoded, but the dropoff usually still can, and half a map beats none. `resolveStorableCoordinates()`
 * already fails closed on a missing address rather than falling back to the non-storable display
 * coordinate, so a failure reaching here is never a licensing question — only an absent answer.
 */
export function coordinateColumns(
  pickup: MapsResult<Coordinates> | null,
  dropoff: MapsResult<Coordinates> | null,
): RideCoordinateColumns {
  return {
    pickup_lat: pickup?.ok ? pickup.data.lat : null,
    pickup_lng: pickup?.ok ? pickup.data.lng : null,
    dropoff_lat: dropoff?.ok ? dropoff.data.lat : null,
    dropoff_lng: dropoff?.ok ? dropoff.data.lng : null,
  };
}

/** What to write when the flag is off — named so the disabled path reads as a decision. */
export const NO_STORED_COORDINATES = NO_COORDINATES;
