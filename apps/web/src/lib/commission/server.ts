import "server-only";

import type { CommissionTier } from "@rido/pricing";
import { createServerClient } from "@/lib/supabase/server";
import { failed, type CommissionResult } from "./result.ts";

/**
 * Reads what commission looks like right now: the active tiers, and a driver's month-to-date
 * gross. Nothing here does money math — handing both to `commissionForRide` (`@rido/pricing`) is
 * the caller's job, the same division of labour `src/lib/fares/server.ts` holds for fare quoting.
 */

/**
 * The tiers in force today, or a failure already in RIDO's voice.
 *
 * `active_commission_tiers()` is granted to `authenticated` — its own migration comment says why:
 * "a driver has to be able to see the rates to be shown 'you keep $X (Y%)' before accepting a
 * ride." So this reads through the RLS-scoped client, the same posture
 * `getActiveFareRateCard()` holds for `fare_rate_cards`.
 */
export async function getActiveCommissionTiers(): Promise<CommissionResult<CommissionTier[]>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("active_commission_tiers");

  if (error) {
    return failed("We couldn't load commission rates right now. Try again in a moment.");
  }
  if (!data || data.length === 0) {
    return failed("There are no active commission tiers configured yet.");
  }

  return {
    ok: true,
    data: data.map((row) => ({
      tierOrder: row.tier_order,
      lowerBoundCents: row.lower_bound_cents,
      upperBoundCents: row.upper_bound_cents,
      rateBps: row.rate_bps,
    })),
  };
}

/**
 * A driver's gross fares so far this month, in cents — the `mtdGrossCents` `commissionForRide`
 * needs to bracket a new ride at the right point in the schedule.
 *
 * Reads `driver_monthly_stats` directly rather than the `driver_month_to_date()` RPC: that RPC is
 * deliberately service-role only — its migration comment explains that as `SECURITY INVOKER`, a
 * driver calling it for someone else's id would silently get 0 rather than an error, and keeping
 * the grant to `service_role` is what makes that confusion impossible. `driver_monthly_stats`'s
 * own RLS already scopes rows to their owner, so reading the table directly is both the RLS-legal
 * path and the one that can't be pointed at the wrong driver.
 *
 * The month bucket comes from `rido_year_month()` — root `CLAUDE.md` invariant 9's one canonical
 * place for that conversion — never re-derived here.
 *
 * A driver with no rides yet this month has **no row at all**, not a zeroed one, so a missing row
 * reads as 0 cents rather than a failure.
 */
export async function getDriverMonthToDateCents(
  driverId: string,
): Promise<CommissionResult<number>> {
  const supabase = await createServerClient();

  const { data: yearMonth, error: yearMonthError } = await supabase.rpc("rido_year_month", {
    p_ts: new Date().toISOString(),
  });
  if (yearMonthError || !yearMonth) {
    return failed("We couldn't determine the current billing month. Try again in a moment.");
  }

  const { data, error } = await supabase
    .from("driver_monthly_stats")
    .select("gross_fare_cents")
    .eq("driver_id", driverId)
    .eq("year_month", yearMonth)
    .maybeSingle();

  if (error) {
    return failed("We couldn't load your month-to-date earnings. Try again in a moment.");
  }

  return { ok: true, data: data?.gross_fare_cents ?? 0 };
}
