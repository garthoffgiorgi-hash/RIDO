/**
 * Flat-fee resolution: pilot vs steady state.
 *
 * The fee is a STATE on the driver's subscription row, never a date comparison. Any
 * implementation that computes `now > launchDate + 6 months` is wrong — the turn-on is gated
 * on a traction signal, not the calendar. See docs/decisions/0003-pilot-fee-waiver.md.
 */

import { type Cents, cents } from "./money.ts";

export type Plan = "pilot" | "standard";

export interface SubscriptionState {
  readonly plan: Plan;
  /** The traction-gated flip. When false, no flat fee is charged regardless of plan. */
  readonly feeActive: boolean;
  /** From the subscriptions row — zero during the pilot, the standard amount in steady state. */
  readonly flatFeeCents: Cents;
}

/**
 * What this driver is actually billed as a flat fee this period.
 *
 * Reads state only. Because the answer comes from the row rather than the calendar, the pilot
 * ending on schedule and the pilot being extended are the same code path — which is the point
 * of ADR-0003.
 *
 * A pilot-plan row with the fee switched on is refused rather than charged. That combination is
 * data corruption, and the root CLAUDE.md guardrail "never reintroduce the flat fee inside the
 * pilot window" is worth more than a graceful degrade: billing a pilot driver is the exact
 * outcome the rule exists to prevent, and silently returning zero would leave the broken row in
 * place to surprise someone later.
 */
export function monthlyFlatFee(subscription: SubscriptionState): Cents {
  const { plan, feeActive, flatFeeCents } = subscription;

  if (!Number.isInteger(flatFeeCents) || flatFeeCents < 0) {
    throw new Error(
      `monthlyFlatFee: flatFeeCents must be a non-negative integer, got ${flatFeeCents}`,
    );
  }

  if (plan === "pilot" && feeActive) {
    throw new Error(
      "Contradictory subscription state: plan is 'pilot' but feeActive is true. The pilot " +
        "waives the flat fee entirely (ADR-0003), so charging here would violate a guardrail. " +
        "Fix the subscriptions row: either set fee_active false, or move the driver to 'standard'.",
    );
  }

  return feeActive ? cents(flatFeeCents) : cents(0);
}
