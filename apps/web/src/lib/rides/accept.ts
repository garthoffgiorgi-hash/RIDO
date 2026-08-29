/**
 * The accept authorization rule, as a pure function — mirrors the shape of
 * `supabase/functions/complete-ride/core.ts`'s `authorizeCompletion`, not its code.
 *
 * That function can't be reused here: its ownership check refuses a caller whose `driverId`
 * doesn't match the ride's — exactly backwards for accept, where the whole point is that the ride
 * has **no** driver yet. And it lives under `supabase/functions/complete-ride/`, resolving
 * `@rido/pricing` through the Deno import map registered in `supabase/config.toml`; reaching it
 * from `apps/web` would cross that boundary for no benefit, since accept needs none of the pricing
 * import anyway.
 *
 * Pure — no I/O, safe to test without a database. The Supabase read/write lives in `./server.ts`.
 */

export type AcceptRefusal = "driver_not_active" | "ride_taken" | "ride_not_open";

export type AcceptDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly refusal: AcceptRefusal; readonly message: string };

export interface OpenRide {
  readonly status: string;
  readonly driverId: string | null;
}

/**
 * Whether `driverStatus` may accept `ride`.
 *
 * Compliance is checked first, before anything about the ride's own state — root `CLAUDE.md`
 * invariant 6, and the same ordering discipline `authorizeCompletion` uses: an inactive driver
 * gets refused for that reason even if the ride is also already taken, not whichever check
 * happens to run first.
 *
 * Two distinct ride-state refusals, not one generic "unavailable": `ride_taken` (another driver
 * already has it) and `ride_not_open` (the rider canceled it, or it moved on without this driver)
 * read differently to someone deciding whether to try a different open request or reload the
 * list.
 */
export function canAcceptRide(ride: OpenRide, driverStatus: string): AcceptDecision {
  if (driverStatus !== "active") {
    return {
      allowed: false,
      refusal: "driver_not_active",
      message: `Your driver account is '${driverStatus}'. Only an active account can accept rides.`,
    };
  }

  if (ride.driverId !== null) {
    return {
      allowed: false,
      refusal: "ride_taken",
      message: "Another driver already accepted this ride.",
    };
  }

  if (ride.status !== "requested") {
    return {
      allowed: false,
      refusal: "ride_not_open",
      message: `This ride is '${ride.status}' and can no longer be accepted.`,
    };
  }

  return { allowed: true };
}
