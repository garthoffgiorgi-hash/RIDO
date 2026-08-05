/**
 * @rido/pricing — the single source of RIDO's money math.
 *
 * Consumed by three runtimes: apps/web (bundler), supabase/functions (Deno), and
 * tools/pilot-model (browser). Zero dependencies, pure functions, integer cents throughout.
 *
 * Callers import from here and nowhere else.
 */

export { cents, bps, applyBps } from "./money.ts";
export type { Cents, Bps } from "./money.ts";

export { normalizeTiers } from "./tiers.ts";
export type { CommissionTier } from "./tiers.ts";

export { commissionForRide } from "./commission.ts";
export type { RideCommissionInput, RideCommission } from "./commission.ts";

export { monthlyFlatFee } from "./subscription.ts";
export type { Plan, SubscriptionState } from "./subscription.ts";
