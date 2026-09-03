import "server-only";

import {
  BPS_DENOMINATOR,
  cents,
  type CommissionTier,
  roundHalfUpDiv,
  tierPositionFor,
  type TierPosition,
} from "@rido/pricing";
import { createServerClient } from "@/lib/supabase/server";
import { failed, type CommissionResult } from "./result.ts";

/**
 * Reads what commission looks like right now: the active tiers, and a driver's month-to-date
 * position. Nothing here does money math except handing figures to `@rido/pricing` — `tiers.ts`'s
 * `tierPositionFor` and `roundHalfUpDiv` are called, never reimplemented, the same division of
 * labour `src/lib/fares/server.ts` holds for fare quoting.
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

/** A driver's whole `driver_monthly_stats` row for the current month, cents and count alike. */
export interface DriverMonthSummary {
  readonly grossFareCents: number;
  readonly commissionCents: number;
  readonly payoutCents: number;
  readonly ridesCount: number;
}

/**
 * A driver's month-to-date position: gross fares, commission, payout and ride count — the whole
 * `driver_monthly_stats` row for the current month, not just the gross figure.
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
 * **A driver with no completed rides this month has no row at all**, not a zeroed one — the table
 * is written only by the `bump_monthly_stats()` trigger on ride completion. A missing row reads as
 * every figure being 0 rather than a failure, which is also how a genuinely brand-new driver's
 * first visit to `/drive` should render: nothing earned yet, not an error.
 */
export async function getDriverMonthSummary(
  driverId: string,
): Promise<CommissionResult<DriverMonthSummary>> {
  const supabase = await createServerClient();

  const { data: yearMonth, error: yearMonthError } = await supabase.rpc("rido_year_month", {
    p_ts: new Date().toISOString(),
  });
  if (yearMonthError || !yearMonth) {
    return failed("We couldn't determine the current billing month. Try again in a moment.");
  }

  const { data, error } = await supabase
    .from("driver_monthly_stats")
    .select("gross_fare_cents, commission_cents, payout_cents, rides_count")
    .eq("driver_id", driverId)
    .eq("year_month", yearMonth)
    .maybeSingle();

  if (error) {
    return failed("We couldn't load your month-to-date earnings. Try again in a moment.");
  }

  return {
    ok: true,
    data: {
      grossFareCents: data?.gross_fare_cents ?? 0,
      commissionCents: data?.commission_cents ?? 0,
      payoutCents: data?.payout_cents ?? 0,
      ridesCount: data?.rides_count ?? 0,
    },
  };
}

/**
 * A driver's gross fares so far this month, in cents — the `mtdGrossCents` `commissionForRide`
 * needs to bracket a new ride at the right point in the schedule.
 *
 * Delegates to `getDriverMonthSummary()` and projects one field, so there is exactly one place
 * that knows how to find "this driver's row for this month" rather than two queries that could
 * drift apart.
 */
export async function getDriverMonthToDateCents(
  driverId: string,
): Promise<CommissionResult<number>> {
  const summary = await getDriverMonthSummary(driverId);
  if (!summary.ok) return summary;
  return { ok: true, data: summary.data.grossFareCents };
}

/**
 * Everything `TierProgress` needs to render, already computed — the component only formats.
 * `.claude/rules/money.md`: "a number shown to a driver comes from a snapshot or from
 * `@rido/pricing` — not from arithmetic in a component." Every figure here traces to one of
 * those two places.
 */
export interface DriverTierProgress {
  /** The full band set, so the meter can draw every segment, not only the current one. */
  readonly tiers: readonly CommissionTier[];
  /** Where this month's gross sits among the bands — `"climbing"` toward a lower rate, or
   *  `"top"`, already in the cheapest one. */
  readonly position: TierPosition;
  readonly ridesCount: number;
  readonly grossFareCents: number;
  readonly payoutCents: number;
  /**
   * `payoutCents` as a proportion of `grossFareCents`, in basis points — the MONTH's blended keep
   * rate, distinct from the MARGINAL rate `position.currentTier.rateBps` implies for the next
   * fare (`docs/business/monetization.md` warns explicitly against presenting one as the other).
   * `null` when `grossFareCents` is 0: nothing to blend yet, and dividing by it would either throw
   * or read as a nonsensical 0%/NaN — a driver with no rides this month has no month rate to show.
   */
  readonly blendedKeepRateBps: number | null;
}

/**
 * Assembles `DriverTierProgress` from the two reads above and `tierPositionFor()`
 * (`@rido/pricing`). One network round trip's worth of composition, kept out of the component and
 * out of `drive/page.tsx`, so neither has to reason about the shape of `driver_monthly_stats` or
 * the tier table directly.
 */
export async function getDriverTierProgress(
  driverId: string,
): Promise<CommissionResult<DriverTierProgress>> {
  const tiers = await getActiveCommissionTiers();
  if (!tiers.ok) return tiers;

  const summary = await getDriverMonthSummary(driverId);
  if (!summary.ok) return summary;

  const position = tierPositionFor(cents(summary.data.grossFareCents), tiers.data);

  const blendedKeepRateBps =
    summary.data.grossFareCents === 0
      ? null
      : roundHalfUpDiv(summary.data.payoutCents * BPS_DENOMINATOR, summary.data.grossFareCents);

  return {
    ok: true,
    data: {
      tiers: tiers.data,
      position,
      ridesCount: summary.data.ridesCount,
      grossFareCents: summary.data.grossFareCents,
      payoutCents: summary.data.payoutCents,
      blendedKeepRateBps,
    },
  };
}
