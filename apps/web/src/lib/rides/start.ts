/**
 * The start-trip authorization rule, as a pure function — mirrors the shape and the check
 * *ordering* of `supabase/functions/complete-ride/core.ts`'s `authorizeCompletion`, not its code.
 * `accept.ts`'s `canAcceptRide` is the wrong model here: accept has no ownership check to run,
 * because an open ride is unassigned by definition. Start does — the ride already has a driver,
 * so an impostor calling with someone else's ride id is a real case to refuse, not a hypothetical
 * one.
 *
 * Ownership before compliance before state, matching `authorizeCompletion` exactly: a refusal
 * must never reveal anything about a row the caller couldn't otherwise read, so "who owns this"
 * is answered first, then "is this driver even allowed to work", then "is the ride in a state
 * this action makes sense for".
 *
 * Pure — no I/O, safe to test without a database. The Supabase read/write lives in `./server.ts`.
 */

export type StartRefusal = "not_the_driver" | "driver_not_active" | "ride_not_startable";

export type StartDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly refusal: StartRefusal; readonly message: string };

export interface StartableRide {
  readonly status: string;
  /** Nullable: a ride still 'requested' legitimately has no driver, and that's a real case to
   * refuse (not_the_driver) rather than a type this module can rule out. */
  readonly driverId: string | null;
}

/**
 * Whether `callerDriverId` (at `driverStatus`) may start the trip on `ride`.
 */
export function canStartTrip(
  ride: StartableRide,
  callerDriverId: string,
  driverStatus: string,
): StartDecision {
  if (ride.driverId !== callerDriverId) {
    return {
      allowed: false,
      refusal: "not_the_driver",
      message: "You are not the driver on this ride.",
    };
  }

  if (driverStatus !== "active") {
    return {
      allowed: false,
      refusal: "driver_not_active",
      message: `Your driver account is '${driverStatus}'. Only an active account can start a trip.`,
    };
  }

  if (ride.status !== "accepted") {
    return {
      allowed: false,
      refusal: "ride_not_startable",
      message: `This ride is '${ride.status}' and cannot be started.`,
    };
  }

  return { allowed: true };
}
