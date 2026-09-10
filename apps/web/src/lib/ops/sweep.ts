import "server-only";

import { captureRideCharge } from "@/lib/payments/server";
import { settlePayoutForSweep } from "@/lib/payouts/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  type StuckChargeCandidate,
  type StuckPayoutCandidate,
  type SweepAttemptOutcome,
  type SweepReport,
  sweepStuckMoney,
} from "./stuck-money.ts";

/**
 * Wires the pure sweep in `./stuck-money.ts` to real Postgres reads and the real
 * `captureRideCharge()`/`settlePayoutForSweep()` calls. Carries no logic of its own worth
 * getting wrong — every property about ordering, resilience, and which statuses are ever touched
 * is proved one file over, without Stripe or Postgres. ADR-0025.
 *
 * `runStuckMoneySweep()` is the cron route's one call.
 */

/** What `ride_charges` joined to its ride looks like, narrowed the same way `RideChargeRow` is. */
type ChargeJoinRow = {
  ride_id: string;
  status: "authorized" | "authorizing";
  rides: { completed_at: string | null } | null;
};

/**
 * Every ride whose charge is still `'authorized'` or `'authorizing'` while the ride itself is
 * `'completed'`. The inner join on `rides.status = 'completed'` is what makes this "unsettled
 * AFTER completion" rather than "unsettled" alone — a ride still `'in_progress'` legitimately has
 * an uncaptured hold, and that is not this sweep's business.
 *
 * At most one row per ride: `ride_charges_one_live_per_ride` is a partial unique index over
 * exactly `('authorizing', 'authorized', 'captured')`, so a ride can never have two rows in either
 * status this query selects.
 */
async function findCompletedRidesWithUnsettledCharge(): Promise<readonly StuckChargeCandidate[]> {
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("ride_charges")
    .select("ride_id, status, rides!inner(completed_at)")
    .in("status", ["authorized", "authorizing"])
    .eq("rides.status", "completed");

  if (error) {
    console.error("ops/sweep: could not read unsettled charges", { cause: error.message });
    return [];
  }

  // completed_at is guaranteed by rides_started_at_present_iff_in_progress's sibling constraint on
  // completion, but this reads across two tables through an untyped embed — filter rather than
  // trust it, the same defensiveness `getRecentlyCompletedRide` already applies to the same column.
  return ((data ?? []) as ChargeJoinRow[])
    .filter(
      (row): row is ChargeJoinRow & { rides: { completed_at: string } } =>
        row.rides?.completed_at != null,
    )
    .map((row) => ({
      rideId: row.ride_id,
      status: row.status,
      completedAt: row.rides.completed_at,
    }));
}

type PayoutRow = { id: string; status: "pending" | "failed" | "paid"; updated_at: string };

/** Every payout row currently `'pending'` — `'failed'` and `'paid'` are never this sweep's business. */
async function findPendingPayouts(): Promise<readonly StuckPayoutCandidate[]> {
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("driver_payouts")
    .select("id, status, updated_at")
    .eq("status", "pending");

  if (error) {
    console.error("ops/sweep: could not read pending payouts", { cause: error.message });
    return [];
  }

  return ((data ?? []) as PayoutRow[]).map((row) => ({
    payoutId: row.id,
    status: row.status,
    updatedAt: row.updated_at,
  }));
}

/**
 * `ChargeOutcome` has five kinds because `authorizeRideCharge`/`voidRideCharge` share the type
 * with `captureRideCharge` — but `captureRideCharge` itself only ever produces `captured`,
 * `deferred`, or `failed` (confirmed against its own source: every return in `captureCharge()` is
 * one of those three). The other two are handled rather than assumed away, so a future change to
 * that guarantee fails loudly here instead of silently mis-scoring the sweep.
 */
function toAttemptOutcome(
  outcome: Awaited<ReturnType<typeof captureRideCharge>>,
): SweepAttemptOutcome {
  switch (outcome.kind) {
    case "captured":
      return { ok: true };
    case "deferred":
    case "failed":
      return { ok: false, message: outcome.message };
    default:
      return {
        ok: false,
        message: `ops/sweep: captureRideCharge returned an unexpected kind: ${outcome.kind}`,
      };
  }
}

export async function runStuckMoneySweep(): Promise<SweepReport> {
  return sweepStuckMoney({
    findCompletedRidesWithUnsettledCharge,
    captureCharge: async (rideId) => toAttemptOutcome(await captureRideCharge(rideId)),
    findPendingPayouts,
    settlePayout: async (payoutId) => {
      const result = await settlePayoutForSweep(payoutId);
      if (!result.ok) return { ok: false, message: result.message };
      // `null` is the already-paid race settlePayoutForSweep's own docstring names — a benign
      // no-op, not a failure.
      if (result.data === null || result.data.kind === "paid") return { ok: true };
      return { ok: false, message: result.data.message };
    },
  });
}
