/**
 * @rido/pricing — the single source of RIDO's money math.
 *
 * Consumed by three runtimes: apps/web (bundler), supabase/functions (Deno), and
 * tools/pilot-model (browser). Zero dependencies, pure functions, integer cents throughout.
 *
 * Callers import from here and nowhere else.
 */

// BPS_DENOMINATOR is exported because it's what "basis points" MEANS. A caller rendering a rate
// as a percentage, or taking its complement ("the driver keeps the rest"), needs the same
// denominator this package divides by — and writing 10_000 at the call site would be a second
// definition of the unit, which is exactly the drift this package exists to prevent.
export { cents, bps, applyBps, BPS_DENOMINATOR } from "./money.ts";
export type { Cents, Bps } from "./money.ts";

export { normalizeTiers } from "./tiers.ts";
export type { CommissionTier } from "./tiers.ts";

export { commissionForRide } from "./commission.ts";
export type { RideCommissionInput, RideCommission } from "./commission.ts";

export { monthlyFlatFee } from "./subscription.ts";
export type { Plan, SubscriptionState } from "./subscription.ts";
