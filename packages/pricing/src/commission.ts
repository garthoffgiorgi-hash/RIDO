/**
 * Bracketed commission — the most important function in RIDO.
 *
 * A ride is rated against the driver's month-to-date fare volume and split across whatever
 * bands it spans, exactly like tax brackets. The result is snapshotted onto the `rides` row
 * and never recomputed. See docs/decisions/0002-bracketed-per-ride-commission.md.
 */

import { BPS_DENOMINATOR, type Bps, type Cents, bps, cents, roundHalfUpDiv } from "./money.ts";
import { type CommissionTier, normalizeTiers } from "./tiers.ts";

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
 *
 * ## Why this rounds once, at the end
 *
 * The obvious implementation applies each band's rate to its slice, rounds, and sums. That is
 * wrong twice over: it rounds quantities that are not money on their own (a driver is never paid
 * "the part of the ride in band 2"), and the per-band error compounds.
 *
 * Instead this accumulates an exact integer numerator — the sum of (slice x rate) — and rounds a
 * single time, on the only figure that is actually money. Nothing here is ever a fractional
 * value, so there is no floating-point arithmetic anywhere in the path.
 *
 * `driverPayoutCents` is then DERIVED as `fare - commission` rather than computed independently,
 * which is what makes `commission + payout === fare` true by construction instead of by luck.
 * ride-completion.md requires that exactly; the rides table enforces it as a CHECK constraint.
 *
 * ## A note on month-end totals
 *
 * ADR-0002 observes that per-ride bracketing is "mathematically identical" to bracketing the
 * whole month in one pass. That holds exactly in unrounded arithmetic and to within a few cents
 * once every ride is rounded to whole cents. It never matters in practice, because nothing
 * computes the whole-month figure: `driver_monthly_stats` is the SUM OF THE SNAPSHOTS, so there
 * is no second computation to disagree with. Worth knowing before anyone writes a reconciliation
 * script, sees a three-cent difference, and concludes the books are broken.
 */
export function commissionForRide(input: RideCommissionInput): RideCommission {
  const { fareCents, mtdGrossCents, tiers } = input;

  if (!Number.isInteger(fareCents) || fareCents < 0) {
    throw new Error(
      `commissionForRide: fareCents must be a non-negative integer, got ${fareCents}`,
    );
  }
  if (!Number.isInteger(mtdGrossCents) || mtdGrossCents < 0) {
    throw new Error(
      `commissionForRide: mtdGrossCents must be a non-negative integer, got ${mtdGrossCents}`,
    );
  }

  // Validates the set even for a zero fare: a malformed tier table should fail loudly on the
  // first ride of the month, not silently until someone happens to cross a band.
  const bands = normalizeTiers(tiers);

  // Sum of (slice x rateBps). Exact integer; divided by BPS_DENOMINATOR once, below.
  let rateWeightedNumerator = 0;
  // Plain numbers on purpose: the Cents brand guards the API surface, and arithmetic on a
  // branded type widens anyway. These are re-branded at the return.
  let position: number = mtdGrossCents;
  let remaining: number = fareCents;

  for (const band of bands) {
    if (remaining === 0) break;

    const bandEnd = band.upperBoundCents;
    // Entirely behind the driver's current position — they passed through it earlier this month.
    if (bandEnd !== null && position >= bandEnd) continue;

    const capacity = bandEnd === null ? remaining : bandEnd - position;
    const slice = Math.min(remaining, capacity);
    if (slice <= 0) continue;

    rateWeightedNumerator += slice * band.rateBps;
    if (!Number.isSafeInteger(rateWeightedNumerator)) {
      throw new Error(
        "commissionForRide: fare exceeds the range this package computes exactly. " +
          "Refusing to return a figure that may have lost precision.",
      );
    }

    position += slice;
    remaining -= slice;
  }

  // normalizeTiers guarantees an unbounded top band, so the fare is always fully consumed.
  if (remaining !== 0) {
    throw new Error(
      `commissionForRide: ${remaining} cents of the fare fell outside every band. ` +
        "The tier set should have been rejected by normalizeTiers — this is a bug.",
    );
  }

  const commissionCents = roundHalfUpDiv(rateWeightedNumerator, BPS_DENOMINATOR);
  const driverPayoutCents = fareCents - commissionCents;

  if (commissionCents < 0 || commissionCents > fareCents) {
    throw new Error(
      `commissionForRide: commission ${commissionCents} outside [0, ${fareCents}] — this is a bug.`,
    );
  }

  // A zero fare has no meaningful blended rate; report zero rather than dividing by zero. The
  // rides table permits fare_cents = 0, so the case is defined rather than left to chance.
  const commissionRateBps =
    fareCents === 0 ? 0 : roundHalfUpDiv(commissionCents * BPS_DENOMINATOR, fareCents);

  return {
    commissionCents: cents(commissionCents),
    driverPayoutCents: cents(driverPayoutCents),
    commissionRateBps: bps(commissionRateBps),
  };
}
