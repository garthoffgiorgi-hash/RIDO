/**
 * Commission tier types and band traversal.
 *
 * Tiers are DATA, loaded from the `commission_tiers` table and passed in. This module never
 * hardcodes a rate or a boundary — see supabase/seed/commission_tiers.sql, the one home for
 * those values.
 */

/** A single commission band. Bounds are integer cents; rate is basis points (2000 = 20%). */
export interface CommissionTier {
  readonly tierOrder: number;
  readonly lowerBoundCents: number;
  /** null means unbounded. */
  readonly upperBoundCents: number | null;
  readonly rateBps: number;
}

/**
 * Sort tiers and assert they form a gapless, non-overlapping cover starting at 0 with exactly
 * one unbounded top band. A malformed tier set must fail loudly here rather than silently
 * under-charging every ride.
 */
export function normalizeTiers(_tiers: readonly CommissionTier[]): readonly CommissionTier[] {
  throw new Error("not implemented");
}
