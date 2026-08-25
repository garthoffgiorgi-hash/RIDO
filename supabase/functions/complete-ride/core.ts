/**
 * complete-ride — the pure half.
 *
 * No Supabase import, no fetch, no Date.now(), no Deno globals. Everything this module needs
 * arrives as an argument, and it returns plain data.
 *
 * That is not a style preference. ADR-0008 puts heavy spatial-temporal computation OUTSIDE the
 * completion path, which means the rating logic has to be callable from somewhere that isn't an
 * HTTP request — a pg_cron/pgmq worker, a batch re-simulation over historical rides, a pricing
 * experiment. A module that reaches for a database client can't be. So the seam is here, and
 * `index.ts` is the only file that knows an HTTP request exists.
 *
 * It also makes the two rules that matter testable without a database: who may complete a ride,
 * and what the ride is worth.
 */

import { cents, commissionForRide, type CommissionTier } from "@rido/pricing";

/**
 * The ride lifecycle is requested -> accepted -> in_progress -> completed. Completing a ride
 * nobody accepted, or one already canceled, is a bug in the caller. Mirrored by
 * apply_ride_commission's own status check — this is the app-side half, so a bad request gets a
 * useful message instead of a bare "not_completable" from the database.
 */
export const COMPLETABLE_STATUSES = ["accepted", "in_progress"] as const;

export interface RideRow {
  readonly id: string;
  readonly driverId: string;
  readonly status: string;
  /** Read from our own rides row. NEVER from a request body — supabase/CLAUDE.md. */
  readonly fareCents: number;
}

/** Who is asking. Resolved from the JWT by `db.ts`; this module just applies the rule. */
export type Caller =
  | { readonly kind: "service_role" }
  | {
      readonly kind: "driver";
      readonly driverId: string;
      /** drivers.status — 'pending' | 'active' | 'suspended'. */
      readonly driverStatus: string;
    };

export type Refusal = "not_the_driver" | "driver_not_active" | "ride_not_completable";

export type Decision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly refusal: Refusal; readonly message: string };

/**
 * The authorization rule, as a pure function.
 *
 * Two things are being enforced, and they're different in kind:
 *
 *   ownership  — a driver may only complete their own ride. The database can't express this on
 *                its own here: every write to `rides` goes through the service role (which
 *                bypasses RLS), so this check is the real one, not a convenience.
 *   compliance — root CLAUDE.md invariant 6. The database already refuses to let a driver REACH
 *                status='active' without both checks passed (drivers_activation_gate), so
 *                requiring 'active' here inherits that gate rather than restating its terms.
 *                docs/roadmap.md notes the app-side half was missing; this is it.
 */
export function authorizeCompletion(ride: RideRow, caller: Caller): Decision {
  // Identity before state, deliberately. Answering "that ride can't be completed" to someone who
  // doesn't own the ride tells them something about a row RLS wouldn't let them read. Ride ids
  // are unguessable UUIDs so the exposure is small, but ordering the checks correctly costs
  // nothing and means the refusal never depends on data the caller isn't entitled to.
  //
  // The service role is our own backend — dispatch, an admin correction, a future worker. It
  // holds no driver identity, so ownership doesn't apply to it; the compliance gate was already
  // enforced when the ride was accepted.
  if (caller.kind === "driver") {
    if (caller.driverId !== ride.driverId) {
      return {
        allowed: false,
        refusal: "not_the_driver",
        message: "You are not the driver on this ride.",
      };
    }

    if (caller.driverStatus !== "active") {
      return {
        allowed: false,
        refusal: "driver_not_active",
        message: `Your driver account is '${caller.driverStatus}'. Only an active account can complete rides.`,
      };
    }
  }

  if (!(COMPLETABLE_STATUSES as readonly string[]).includes(ride.status)) {
    return {
      allowed: false,
      refusal: "ride_not_completable",
      message: `Ride ${ride.id} is '${ride.status}'. Only ${COMPLETABLE_STATUSES.join(" or ")} rides can be completed.`,
    };
  }

  return { allowed: true };
}

export interface RatingContext {
  readonly ride: RideRow;
  /** driver_monthly_stats.gross_fare_cents for `yearMonth`, BEFORE this ride. */
  readonly mtdGrossCents: number;
  /** The bucket that MTD figure came from, carried through into the compare-and-swap. */
  readonly yearMonth: string;
  /** Active tiers in effect today. Filtering is the caller's job — packages/pricing/CLAUDE.md. */
  readonly tiers: readonly CommissionTier[];
}

/** Exactly the arguments apply_ride_commission takes, plus what the response needs. */
export interface RatedCompletion {
  readonly rideId: string;
  readonly fareCents: number;
  readonly yearMonth: string;
  readonly mtdGrossCents: number;
  readonly commissionRateBps: number;
  readonly commissionCents: number;
  readonly driverPayoutCents: number;
}

/**
 * Rates one ride against the driver's month-to-date position.
 *
 * This function performs NO arithmetic of its own — root CLAUDE.md invariant 5. It marshals
 * arguments into `commissionForRide` and marshals the result back out. If you find yourself
 * adding a `+` to a money value in this file, it belongs in packages/pricing instead.
 *
 * Note what is NOT asserted here: commission + payout === fare. That invariant has two real
 * homes — packages/pricing asserts it at the point of computation, and rides_commission_sums_to_fare
 * enforces it at the point of storage. Restating it in the middle would be a third copy of a
 * rule with no new information.
 */
export function rateCompletion(ctx: RatingContext): RatedCompletion {
  const { ride, mtdGrossCents, yearMonth, tiers } = ctx;

  const { commissionCents, driverPayoutCents, commissionRateBps } = commissionForRide({
    fareCents: cents(ride.fareCents),
    mtdGrossCents: cents(mtdGrossCents),
    tiers,
  });

  return {
    rideId: ride.id,
    fareCents: ride.fareCents,
    yearMonth,
    mtdGrossCents,
    commissionRateBps,
    commissionCents,
    driverPayoutCents,
  };
}

/**
 * How many times the caller may re-rate after a compare-and-swap conflict.
 *
 * A conflict means a competing completion for the same driver already committed, so the retry
 * reads a fresh figure immediately — there is nothing to back off from, and the conflict result
 * carries the new month-to-date position so the retry costs no extra round trip. Three attempts
 * covers three of one driver's rides finishing in the same instant, which is already a scenario
 * that requires them to be in two cars.
 */
export const MAX_RATING_ATTEMPTS = 3;
