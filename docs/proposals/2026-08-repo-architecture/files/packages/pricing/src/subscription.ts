/**
 * Flat-fee resolution: pilot vs steady state.
 *
 * The fee is a STATE on the driver's subscription row, never a date comparison. Any
 * implementation that computes `now > launchDate + 6 months` is wrong — the turn-on is gated
 * on a traction signal, not the calendar. See docs/decisions/0003-pilot-fee-waiver.md.
 */

import type { Cents } from "./money.ts";

export type Plan = "pilot" | "standard";

export interface SubscriptionState {
  readonly plan: Plan;
  /** The traction-gated flip. When false, no flat fee is charged regardless of plan. */
  readonly feeActive: boolean;
  /** From the subscriptions row — zero during the pilot, the standard amount in steady state. */
  readonly flatFeeCents: Cents;
}

/** What this driver is actually billed as a flat fee this period. */
export function monthlyFlatFee(_subscription: SubscriptionState): Cents {
  throw new Error("not implemented");
}
