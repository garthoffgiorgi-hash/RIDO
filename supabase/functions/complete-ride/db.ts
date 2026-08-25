/**
 * complete-ride — the vendor boundary.
 *
 * The ONLY file in this function that imports the Supabase SDK. ADR-0006 states the rule for
 * `apps/web`; the reasoning doesn't stop at the app's edge. `index.ts` handles HTTP, `core.ts`
 * decides, and this file talks to the database — so a PostgREST error shape can never reach a
 * response body, and the decision logic can be tested with no database at all.
 *
 * Every function here returns RIDO-shaped data.
 *
 * On types: the interfaces below describe SELECT PROJECTIONS and one function's return contract,
 * not tables — they are not hand-copies of anything generated. `database.types.ts` is generated
 * from the live schema and has not been regenerated since these migrations were written; run
 * `npm run types:generate` after they are applied to the project.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CommissionTier } from "@rido/pricing";
import type { Caller, RatedCompletion, RideRow } from "./core.ts";

/**
 * Supabase injects these into every Edge Function. Read at module scope so a misconfigured
 * deployment fails on the first request with a clear message, rather than on whichever code path
 * happens to need the value.
 */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(
      `complete-ride: ${name} is not set. Supabase injects it automatically; if this is a local run, set it in supabase/functions/.env.`,
    );
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

/**
 * Writes go through the service role deliberately: `rides` has no INSERT or UPDATE grant for
 * `authenticated` at all (see the rides migration), and the commission columns are service-role
 * only. The authorization rule in core.ts is therefore the real gate, not a second opinion on
 * top of RLS — which is exactly why it lives in a pure, tested function.
 *
 * No session persistence: an Edge Function instance is shared across requests and must never
 * carry one caller's session into another's.
 */
const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Length-independent byte comparison, so a wrong key can't be narrowed by timing the response. */
function secretsMatch(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  // Compare a fixed number of bytes either way; length inequality is folded into the result
  // rather than short-circuiting on it.
  let diff = left.length ^ right.length;
  const span = Math.max(left.length, right.length);
  for (let i = 0; i < span; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Turns an Authorization header into "who is asking", or null if it resolves to nobody we can
 * act for.
 *
 * Two kinds of caller, and they're authenticated differently:
 *   - our own backend, presenting the service-role key itself
 *   - a signed-in driver, presenting a user JWT that we exchange for their `drivers` row
 *
 * A signed-in user with no driver row is not a driver, and gets null — riders reach this
 * endpoint with a perfectly valid JWT.
 */
export async function resolveCaller(authorizationHeader: string | null): Promise<Caller | null> {
  if (!authorizationHeader) return null;
  const token = authorizationHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  if (secretsMatch(token, SERVICE_ROLE_KEY)) return { kind: "service_role" };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: driver, error: driverError } = await admin
    .from("drivers")
    .select("id, status")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (driverError) throw new Error(`complete-ride: could not load driver — ${driverError.message}`);
  if (!driver) return null;

  return { kind: "driver", driverId: driver.id as string, driverStatus: driver.status as string };
}

export async function loadRide(rideId: string): Promise<RideRow | null> {
  const { data, error } = await admin
    .from("rides")
    .select("id, driver_id, status, fare_cents")
    .eq("id", rideId)
    .maybeSingle();

  if (error) throw new Error(`complete-ride: could not load ride ${rideId} — ${error.message}`);
  if (!data) return null;

  return {
    id: data.id as string,
    driverId: data.driver_id as string,
    status: data.status as string,
    fareCents: Number(data.fare_cents),
  };
}

/**
 * The bands in effect today. Filtering `active` and `effective_from` is deliberately the
 * caller's job rather than the pricing package's (packages/pricing/CLAUDE.md) — and the filter
 * itself lives in SQL so "today" means today in America/Los_Angeles.
 */
export async function loadActiveTiers(): Promise<CommissionTier[]> {
  const { data, error } = await admin.rpc("active_commission_tiers");
  if (error) throw new Error(`complete-ride: could not load commission tiers — ${error.message}`);

  const rows = (data ?? []) as ReadonlyArray<Record<string, unknown>>;
  if (rows.length === 0) {
    throw new Error(
      "complete-ride: no active commission tiers. Seed them from supabase/seed/commission_tiers.sql — refusing to rate a ride without rates.",
    );
  }

  return rows.map((row) => ({
    tierOrder: Number(row.tier_order),
    lowerBoundCents: Number(row.lower_bound_cents),
    upperBoundCents: row.upper_bound_cents === null ? null : Number(row.upper_bound_cents),
    rateBps: Number(row.rate_bps),
  }));
}

export interface MonthToDate {
  readonly yearMonth: string;
  readonly grossFareCents: number;
}

/** Where the driver stands this month, before this ride. Zero on their first ride of the month. */
export async function loadMonthToDate(driverId: string): Promise<MonthToDate> {
  const { data, error } = await admin.rpc("driver_month_to_date", { p_driver_id: driverId });
  if (error) {
    throw new Error(
      `complete-ride: could not read month-to-date for ${driverId} — ${error.message}`,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) throw new Error(`complete-ride: driver_month_to_date returned nothing for ${driverId}`);

  return { yearMonth: String(row.year_month), grossFareCents: Number(row.gross_fare_cents) };
}

/** Mirrors the `outcome` values of the ride_commission_application composite type. */
export type ApplicationOutcome =
  | "applied"
  | "conflict"
  | "already_completed"
  | "not_found"
  | "not_completable";

export interface Application {
  readonly outcome: ApplicationOutcome;
  readonly rideId: string;
  readonly rideStatus: string | null;
  readonly fareCents: number | null;
  readonly yearMonth: string | null;
  readonly mtdGrossCents: number | null;
  readonly commissionRateBps: number | null;
  readonly commissionCents: number | null;
  readonly driverPayoutCents: number | null;
  readonly completedAt: string | null;
}

/**
 * The write. Everything the transaction needs arrives as arguments, so the critical section on
 * the other side is pure SQL — see the apply_ride_commission migration for why that matters.
 */
export async function applyRideCommission(rated: RatedCompletion): Promise<Application> {
  const { data, error } = await admin.rpc("apply_ride_commission", {
    p_ride_id: rated.rideId,
    p_expected_year_month: rated.yearMonth,
    p_expected_mtd_gross_cents: rated.mtdGrossCents,
    p_commission_rate_bps: rated.commissionRateBps,
    p_commission_cents: rated.commissionCents,
    p_driver_payout_cents: rated.driverPayoutCents,
  });

  if (error) {
    throw new Error(
      `complete-ride: apply_ride_commission failed for ${rated.rideId} — ${error.message}`,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row)
    throw new Error(`complete-ride: apply_ride_commission returned nothing for ${rated.rideId}`);

  const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

  return {
    outcome: String(row.outcome) as ApplicationOutcome,
    rideId: String(row.ride_id),
    rideStatus: row.ride_status === null ? null : String(row.ride_status),
    fareCents: num(row.fare_cents),
    yearMonth: row.year_month === null ? null : String(row.year_month),
    mtdGrossCents: num(row.mtd_gross_cents),
    commissionRateBps: num(row.commission_rate_bps),
    commissionCents: num(row.commission_cents),
    driverPayoutCents: num(row.driver_payout_cents),
    completedAt: row.completed_at === null ? null : String(row.completed_at),
  };
}
