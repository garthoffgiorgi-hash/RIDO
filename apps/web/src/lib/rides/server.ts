import "server-only";

import type { FareBreakdown } from "@rido/pricing";
import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/server";
import { quoteRide } from "@/lib/fares/server";
import { measureRoute } from "@/lib/maps/server.ts";
import type { Coordinates, Place, RouteGeometry } from "@/lib/maps/types.ts";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import { failed, type RidesResult } from "./result.ts";
import { ACTIVE_STATUSES, canRiderCancel, type RideStatus } from "./status.ts";

/**
 * The rider half of booking: quote a trip before commitment, book it, read the one ride that's
 * live, cancel it. `complete-ride`'s SDK boundary is the model — a service-role write reached
 * through exactly the functions here, never a client insert. See ADR-0012.
 */

/**
 * `database.types.ts` is stale relative to `20260829120000_enable_ride_requests.sql` — it
 * predates `driver_id` becoming nullable and `canceled_at` existing, the same gap
 * `pickup_address`/`dropoff_address` had under ADR-0011 until the migration was pushed and
 * regenerated for real. This container has no Docker, so `supabase gen types` can't run here to
 * close it directly. These two overrides patch exactly the fields the migration changed — every
 * other field still comes from the generated type, so a real drift anywhere else still fails to
 * compile. Delete both once the migration is live and regenerated; they should end up identical
 * to what the generator produces.
 */
type RidesInsert = Omit<Database["public"]["Tables"]["rides"]["Insert"], "driver_id"> & {
  driver_id: string | null;
};
type RidesUpdate = Database["public"]["Tables"]["rides"]["Update"] & {
  canceled_at?: string | null;
};

/** First market is San Diego, matching every other hardcoded market string in this codebase. */
const MARKET = "san-diego";

export interface RideQuote {
  readonly fareCents: number;
  readonly riderTotalCents: number;
  readonly breakdown: FareBreakdown;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly geometry: RouteGeometry | null;
}

/** Composes the two server-only reads a quote needs. Not exported — both public functions below share it. */
async function measureAndQuote(
  pickup: Coordinates,
  dropoff: Coordinates,
): Promise<RidesResult<RideQuote>> {
  const measurement = await measureRoute(pickup, dropoff);
  if (!measurement.ok) return measurement;

  const quote = await quoteRide(measurement.data, MARKET);
  if (!quote.ok) return quote;

  return {
    ok: true,
    data: {
      fareCents: quote.data.fareCents,
      riderTotalCents: quote.data.riderTotalCents,
      breakdown: quote.data.breakdown,
      distanceMeters: measurement.data.distanceMeters,
      durationSeconds: measurement.data.durationSeconds,
      geometry: measurement.data.geometry,
    },
  };
}

/**
 * The fare shown before a rider commits to anything. Read-only — measures and prices, writes
 * nothing. Called every time the pickup or dropoff changes, same as `/dev/maps`'s quote panel.
 */
export async function quoteRideRequest(
  pickup: Coordinates,
  dropoff: Coordinates,
): Promise<RidesResult<RideQuote>> {
  await requireUser();
  return measureAndQuote(pickup, dropoff);
}

export type RequestRideOutcome =
  | { readonly kind: "booked"; readonly rideId: string }
  | { readonly kind: "price_changed"; readonly quote: RideQuote }
  | { readonly kind: "failed"; readonly message: string };

/**
 * Books a ride, or explains why it didn't book.
 *
 * Re-measures and re-prices from scratch rather than trusting anything the browser is holding —
 * `shownFareCents` is compared against, never stored. The number that actually reaches the row is
 * always the fresh quote computed right here, from our own rate card (ADR-0009, ADR-0010). A
 * tampered `shownFareCents` can only ever trigger a spurious re-confirm or suppress a real one —
 * it cannot move a price by one cent.
 *
 * If the fresh fare disagrees with what the rider was shown, nothing is written: the caller gets
 * the new quote back and re-confirms, one extra tap rather than a rider being charged a number
 * they never saw (ADR-0012).
 */
export async function requestRide(
  pickup: Place,
  dropoff: Place,
  shownFareCents: number,
): Promise<RequestRideOutcome> {
  const user = await requireUser();

  if (!pickup.coordinates || !dropoff.coordinates) {
    return { kind: "failed", message: "Pick a specific pickup and dropoff to continue." };
  }

  const quote = await measureAndQuote(pickup.coordinates, dropoff.coordinates);
  if (!quote.ok) return { kind: "failed", message: quote.message };

  if (quote.data.fareCents !== shownFareCents) {
    return { kind: "price_changed", quote: quote.data };
  }

  const payload: RidesInsert = {
    rider_id: user.id,
    driver_id: null,
    fare_cents: quote.data.fareCents,
    pickup_address: pickup.address,
    dropoff_address: dropoff.address,
  };

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("rides")
    // The cast bridges RidesInsert to the client's stale generated Insert type — see the comment
    // on RidesInsert above. `payload` itself is fully checked; nothing here is unchecked.
    .insert(payload as unknown as Database["public"]["Tables"]["rides"]["Insert"])
    .select("id")
    .single();

  if (error) {
    // 23505 is rides_one_active_per_rider — the expected, named conflict. Anything else is not.
    if (error.code === "23505") {
      return { kind: "failed", message: "You already have a ride in progress." };
    }
    return { kind: "failed", message: "We couldn't book that ride. Try again in a moment." };
  }

  return { kind: "booked", rideId: data.id };
}

export interface ActiveRide {
  readonly id: string;
  readonly status: RideStatus;
  readonly fareCents: number;
  readonly pickupAddress: string | null;
  readonly dropoffAddress: string | null;
  readonly requestedAt: string;
}

/**
 * The signed-in rider's one live ride, or `null`. Takes the already-resolved `User`, the same
 * pattern `getOwnDriverProfile()` uses — every call site already has one from `requireUser()`.
 *
 * Reads through the RLS-scoped client: `rides_select_own_as_rider` already permits a rider to
 * read their own rows, so there's nothing here that needs the service role to bypass.
 */
export async function getActiveRide(user: User): Promise<ActiveRide | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("rides")
    .select("id, status, fare_cents, pickup_address, dropoff_address, requested_at")
    .eq("rider_id", user.id)
    .in("status", ACTIVE_STATUSES)
    .maybeSingle();

  if (error) {
    throw new Error(`getActiveRide: could not load the active ride — ${error.message}`);
  }
  if (!data) return null;

  return {
    id: data.id,
    status: data.status as RideStatus,
    fareCents: data.fare_cents,
    pickupAddress: data.pickup_address,
    dropoffAddress: data.dropoff_address,
    requestedAt: data.requested_at,
  };
}

/**
 * Cancels a ride the signed-in user requested. Re-checks ownership and `canRiderCancel()`
 * server-side rather than trusting that the cancel button was only rendered when it was allowed —
 * the same defense-in-depth `requireUser()` already applies to every Server Action here, not just
 * the page around it.
 */
export async function cancelRide(rideId: string): Promise<RidesResult<null>> {
  const user = await requireUser();

  const supabase = await createServerClient();
  const { data: ride, error: readError } = await supabase
    .from("rides")
    .select("id, status, rider_id")
    .eq("id", rideId)
    .maybeSingle();

  if (readError || !ride || ride.rider_id !== user.id) {
    return failed("We couldn't find that ride.");
  }
  if (!canRiderCancel(ride.status as RideStatus)) {
    return failed("That ride can no longer be canceled.");
  }

  const patch: RidesUpdate = {
    status: "canceled",
    canceled_at: new Date().toISOString(),
  };

  const service = createServiceRoleClient();
  const { error: updateError } = await service
    .from("rides")
    // Same bridge as requestRide()'s insert — see the comment on RidesUpdate above.
    .update(patch as unknown as Database["public"]["Tables"]["rides"]["Update"])
    .eq("id", rideId);

  if (updateError) {
    return failed("We couldn't cancel that ride. Try again in a moment.");
  }
  return { ok: true, data: null };
}
