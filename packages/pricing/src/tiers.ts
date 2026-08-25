/**
 * Commission tier types and band traversal.
 *
 * Tiers are DATA, loaded from the `commission_tiers` table and passed in. This module never
 * hardcodes a rate or a boundary — see supabase/seed/commission_tiers.sql, the one home for
 * those values.
 */

import { BPS_DENOMINATOR } from "./money.ts";

/** A single commission band. Bounds are integer cents; rate is basis points (2000 = 20%). */
export interface CommissionTier {
  readonly tierOrder: number;
  readonly lowerBoundCents: number;
  /** null means unbounded. */
  readonly upperBoundCents: number | null;
  readonly rateBps: number;
}

/** Renders a band for an error message, without assuming how many bands exist. */
function describe(tier: CommissionTier): string {
  const upper = tier.upperBoundCents === null ? "unbounded" : String(tier.upperBoundCents);
  return `tier ${tier.tierOrder} [${tier.lowerBoundCents}, ${upper}) @ ${tier.rateBps}bps`;
}

/**
 * Field-level checks on one band, independent of the others.
 *
 * Deliberately validates SHAPE, never VALUES: this package has no opinion about what a rate
 * should be, only that a band is coherent. Repricing is a row change in `commission_tiers`
 * (see docs/business/changing-rates.md) and must not require touching this file.
 */
function validateTier(tier: CommissionTier): void {
  if (!Number.isInteger(tier.tierOrder)) {
    throw new Error(`Invalid commission tier: tierOrder must be an integer — ${describe(tier)}`);
  }
  if (!Number.isInteger(tier.lowerBoundCents) || tier.lowerBoundCents < 0) {
    throw new Error(
      `Invalid commission tier: lowerBoundCents must be a non-negative integer — ${describe(tier)}`,
    );
  }
  if (tier.upperBoundCents !== null) {
    if (!Number.isInteger(tier.upperBoundCents)) {
      throw new Error(
        `Invalid commission tier: upperBoundCents must be an integer or null — ${describe(tier)}`,
      );
    }
    if (tier.upperBoundCents <= tier.lowerBoundCents) {
      throw new Error(
        `Invalid commission tier: upperBoundCents must exceed lowerBoundCents — ${describe(tier)}`,
      );
    }
  }
  if (!Number.isInteger(tier.rateBps) || tier.rateBps < 0 || tier.rateBps > BPS_DENOMINATOR) {
    // The upper bound is what guarantees commission <= fare, which in turn keeps
    // driver_payout_cents non-negative and commission_rate_bps inside the rides CHECK.
    throw new Error(
      `Invalid commission tier: rateBps must be an integer in [0, ${BPS_DENOMINATOR}] — ${describe(tier)}`,
    );
  }
}

/**
 * Sort tiers and assert they form a gapless, non-overlapping cover starting at 0 with exactly
 * one unbounded top band. A malformed tier set must fail loudly here rather than silently
 * under-charging every ride.
 *
 * Works for any number of bands — one, three, nine. Nothing downstream assumes a count, so
 * adding or removing a band is a row change, not a code change.
 */
export function normalizeTiers(tiers: readonly CommissionTier[]): readonly CommissionTier[] {
  if (tiers.length === 0) {
    throw new Error(
      "Invalid commission tiers: the set is empty. Every fare must fall in some band — " +
        "check the query filtering commission_tiers (active / effective_from).",
    );
  }

  for (const tier of tiers) validateTier(tier);

  const sorted = [...tiers].sort((a, b) => a.lowerBoundCents - b.lowerBoundCents);

  const first = sorted[0];
  if (first === undefined) throw new Error("Invalid commission tiers: the set is empty.");
  if (first.lowerBoundCents !== 0) {
    throw new Error(
      `Invalid commission tiers: the lowest band must start at 0, starts at ${first.lowerBoundCents}. ` +
        "A driver's first cent of the month has to be priced.",
    );
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current === undefined || next === undefined) {
      throw new Error("Invalid commission tiers: unexpected gap while walking the set.");
    }
    if (current.upperBoundCents === null) {
      throw new Error(
        `Invalid commission tiers: only the top band may be unbounded — ${describe(current)} is not last.`,
      );
    }
    if (current.upperBoundCents !== next.lowerBoundCents) {
      const problem = current.upperBoundCents < next.lowerBoundCents ? "gap" : "overlap";
      throw new Error(
        `Invalid commission tiers: ${problem} between ${describe(current)} and ${describe(next)}. ` +
          "Bands must tile the range exactly — one band's upper bound is the next one's lower bound.",
      );
    }
  }

  const last = sorted[sorted.length - 1];
  if (last === undefined) throw new Error("Invalid commission tiers: the set is empty.");
  if (last.upperBoundCents !== null) {
    throw new Error(
      `Invalid commission tiers: the top band must be unbounded (upperBoundCents null) — ${describe(last)}. ` +
        "Otherwise a high-earning driver's fares fall off the end of the table.",
    );
  }

  return sorted;
}
