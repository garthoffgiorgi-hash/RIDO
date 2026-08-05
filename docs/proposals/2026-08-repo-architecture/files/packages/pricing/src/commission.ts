/**
 * Bracketed commission — the most important function in RIDO.
 *
 * A ride is rated against the driver's month-to-date fare volume and split across whatever
 * bands it spans, exactly like tax brackets. The result is snapshotted onto the `rides` row
 * and never recomputed. See docs/decisions/0002-bracketed-per-ride-commission.md.
 */

import type { Cents, Bps } from "./money.ts";
import type { CommissionTier } from "./tiers.ts";

export interface RideCommissionInput {
  /** This ride's fare. */
  readonly fareCents: Cents;
  /** The driver's gross fares so far this month, BEFORE this ride. */
  readonly mtdGrossCents: Cents;
  /** Active tiers, loaded from commission_tiers. Never hardcoded. */
  readonly tiers: readonly CommissionTier[];
}

export interface RideCommission {
  readonly commissionCents: Cents;
  readonly driverPayoutCents: Cents;
  /** Effective blended rate for THIS ride — what gets snapshotted. */
  readonly commissionRateBps: Bps;
}

/**
 * Invariants this must satisfy, asserted in commission.test.ts:
 *   - commissionCents + driverPayoutCents === fareCents, exactly, always.
 *   - Monotonic: more MTD volume never raises the marginal rate; a larger fare never
 *     produces a smaller payout.
 *   - A ride spanning two or three bands is split at the boundaries, not rated wholesale.
 */
export function commissionForRide(_input: RideCommissionInput): RideCommission {
  throw new Error("not implemented");
}
