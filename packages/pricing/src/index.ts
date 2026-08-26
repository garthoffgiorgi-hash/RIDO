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
// roundHalfUpDiv is exported for the same reason as BPS_DENOMINATOR: a caller expressing one
// integer amount as a proportion of another — a blended take rate over a month, say — should
// round the way this package rounds, not invent a second convention with Math.round.
export {
  cents,
  bps,
  applyBps,
  applyMultiplierBps,
  BPS_DENOMINATOR,
  roundHalfUpDiv,
} from "./money.ts";
export type { Cents, Bps } from "./money.ts";

export { normalizeTiers } from "./tiers.ts";
export type { CommissionTier } from "./tiers.ts";

export { commissionForRide } from "./commission.ts";
export type { RideCommissionInput, RideCommission } from "./commission.ts";

export { monthlyFlatFee } from "./subscription.ts";
export type { Plan, SubscriptionState } from "./subscription.ts";

export { NO_SURGE_BPS, quoteFare, validateRateCard } from "./fare.ts";
export type {
  FareBreakdown,
  FareLineItem,
  FareQuote,
  FareQuoteInput,
  FareRateCard,
} from "./fare.ts";

export {
  aggregateFloorShortfall,
  earningsFloorForTrip,
  tripFloorComparison,
} from "./earnings-floor.ts";
export type {
  EarningsFloor,
  EarningsFloorRates,
  EngagedTrip,
  FloorComparison,
} from "./earnings-floor.ts";
