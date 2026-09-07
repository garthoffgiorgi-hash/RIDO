import "server-only";

import { requireUser } from "@/lib/auth/server";
import { getOwnDriverProfile } from "@/lib/drivers/server.ts";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase/server";
import { failed, type RatingsResult } from "./result.ts";

/**
 * Two-directional post-ride ratings — the `rate` state `brand/design-system.md`'s rider blueprint
 * has named since before `ride_ratings` (`20260904120200_create_ride_ratings.sql`, ADR-0022) gave
 * it a table to write to. This module is that write, and the read that decides whether to ask.
 *
 * `ride_ratings` has no `INSERT` grant to `authenticated` — a rating is a claim about someone
 * else, not a one-writer-forever fact about yourself, so every write here goes through the
 * service role, same posture `acceptRide()`/`declineRide()` take in `src/lib/rides/server.ts`.
 * The migration's own `validate_ride_rating` trigger re-derives and re-checks the same ride/
 * rider/driver match this module works out below — defense in depth, not the only gate, the same
 * relationship root CLAUDE.md invariant 6 already describes for the compliance check.
 */

export interface RatingStatus {
  /** Whether the signed-in caller has already rated this ride, so a prompt doesn't reappear. */
  readonly alreadyRated: boolean;
}

/**
 * Whether the signed-in caller still has a rating to submit for this ride.
 *
 * Reads through the RLS-scoped client: `ride_ratings_select_own_as_rater` already scopes this to
 * rows the caller themselves submitted, so a caller who was never part of the ride simply reads
 * back nothing rather than an error — there is nothing here that needs the service role. This is
 * a display decision, not a security boundary; `submitRating()` re-derives everything it needs
 * independently rather than trusting a prior call to this function.
 */
export async function getRatingStatus(rideId: string): Promise<RatingsResult<RatingStatus>> {
  const user = await requireUser();
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("ride_ratings")
    .select("id")
    .eq("ride_id", rideId)
    .eq("rater_id", user.id)
    .maybeSingle();

  if (error) {
    return failed("We couldn't check your rating status. Try again in a moment.");
  }

  return { ok: true, data: { alreadyRated: data != null } };
}

/**
 * Submits the signed-in caller's rating of the other party on a completed ride.
 *
 * **Direction is derived here, never taken from the caller.** `rides_select_own_as_rider`/
 * `_as_driver` mean a `rides` read that comes back at all already proves the caller is one of
 * this ride's two parties (`src/lib/rides/server.ts`'s `getActiveRide`/`getDriverActiveRide` lean
 * on the same fact) — so "not the rider" only ever means "the driver" for a row this query could
 * see in the first place. The driver side still confirms explicitly via `getOwnDriverProfile()`
 * rather than inferring it from that silence alone, the same defense-in-depth `cancelRide()`
 * applies to ownership before trusting a status transition.
 *
 * A duplicate submission — the unique `(ride_id, rater_id)` constraint — is reported as an
 * ordinary failure, not a crash: a rider re-opening a trip-complete summary they already rated
 * hits this, not a bug.
 */
export async function submitRating(
  rideId: string,
  stars: number,
  comment: string | null,
): Promise<RatingsResult<null>> {
  const user = await requireUser();

  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return failed("Choose 1 to 5 stars.");
  }

  const supabase = await createServerClient();
  const { data: ride, error: rideError } = await supabase
    .from("rides")
    .select("id, status, rider_id, driver_id")
    .eq("id", rideId)
    .maybeSingle();

  if (rideError || !ride) {
    return failed("We couldn't find that ride.");
  }
  if (ride.status !== "completed") {
    return failed("This ride hasn't finished yet.");
  }

  let direction: "rider_rates_driver" | "driver_rates_rider";
  let rateeId: string;

  if (ride.rider_id === user.id) {
    if (!ride.driver_id) {
      return failed("This ride has no driver to rate.");
    }
    // The rider has no RLS read of the drivers table at all (`drivers_select_own`) — the service
    // role is what resolves the driver's person-identity, same as `ride_ratings`' own migration
    // note explains for why rater_id/ratee_id reference auth.users, not drivers.id.
    const service = createServiceRoleClient();
    const { data: driver } = await service
      .from("drivers")
      .select("auth_user_id")
      .eq("id", ride.driver_id)
      .maybeSingle();
    if (!driver) {
      return failed("We couldn't find your driver.");
    }
    direction = "rider_rates_driver";
    rateeId = driver.auth_user_id;
  } else {
    const driver = await getOwnDriverProfile(user);
    if (!driver || driver.id !== ride.driver_id) {
      return failed("You weren't part of this ride.");
    }
    direction = "driver_rates_rider";
    rateeId = ride.rider_id;
  }

  const trimmedComment = comment?.trim();
  const service = createServiceRoleClient();
  const { error: insertError } = await service.from("ride_ratings").insert({
    ride_id: rideId,
    rater_id: user.id,
    ratee_id: rateeId,
    direction,
    stars,
    comment: trimmedComment || null,
  });

  if (insertError) {
    // 23505 is the (ride_id, rater_id) unique constraint — an expected, named conflict, not a bug.
    if (insertError.code === "23505") {
      return failed("You've already rated this ride.");
    }
    return failed("We couldn't submit your rating. Try again in a moment.");
  }

  return { ok: true, data: null };
}
