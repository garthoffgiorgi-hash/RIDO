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

export type AcceptRefusal =
  | "driver_not_active"
  | "driver_not_accepting"
  | "ride_taken"
  | "ride_not_open";

export type AcceptDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly refusal: AcceptRefusal; readonly message: string };

export interface OpenRide {
  readonly status: string;
  readonly driverId: string | null;
}

/**
 * The two facts about the CALLER this rule needs. Deliberately not `DriverProfile`, which is the
 * generated `drivers` row — depending on it here would drag the database's schema types into a
 * file whose whole point is being dependency-free, and would make every test fixture twenty
 * columns wide to assert one boolean.
 */
export interface AcceptingDriver {
  readonly status: string;
  readonly acceptingRides: boolean;
}

/**
 * Whether `driver` may accept `ride`.
 *
 * **Properties of the caller are checked before properties of the subject.** That is the rule the
 * ordering follows, and why compliance comes first (root `CLAUDE.md` invariant 6, the same
 * discipline `authorizeCompletion` uses) with availability beside it: an inactive driver is
 * refused for *that* reason even when the ride is also already taken, and an offline one is told
 * they're offline rather than sent to hunt for a different request that would refuse them too.
 *
 * `driver_not_accepting` is defense in depth rather than the main gate — `/drive` disables Accept
 * while offline, so reaching this refusal means a stale tab or a direct Server Action call.
 * Availability gates *taking new work and never finishing committed work*, which is why
 * `canStartTrip()` and the completion path deliberately do not consult it: a driver may go offline
 * mid-ride and still carry that rider to their destination (ADR-0019).
 *
 * Two distinct ride-state refusals, not one generic "unavailable": `ride_taken` (another driver
 * already has it) and `ride_not_open` (the rider canceled it, or it moved on without this driver)
 * read differently to someone deciding whether to try a different open request or reload the
 * list.
 */
export function canAcceptRide(ride: OpenRide, driver: AcceptingDriver): AcceptDecision {
  if (driver.status !== "active") {
    return {
      allowed: false,
      refusal: "driver_not_active",
      message: `Your driver account is '${driver.status}'. Only an active account can accept rides.`,
    };
  }

  if (!driver.acceptingRides) {
    return {
      allowed: false,
      refusal: "driver_not_accepting",
      message: "You're offline. Go online to accept rides.",
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
