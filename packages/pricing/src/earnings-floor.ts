/**
 * California's Prop 22 earnings guarantee, as arithmetic.
 *
 * Prop 22 (upheld in Castellanos v. State, July 2024 — see `docs/compliance/ca-tnc.md`) lets an
 * app-based transportation company classify drivers as independent contractors, in exchange for
 * obligations. One of them is an earnings floor:
 *
 *     floor = 120% of the LOCAL minimum wage x engaged time
 *           + a per-engaged-mile expense rate
 *
 * "Engaged" means from accepting a ride to dropping off. Tips and reimbursements sit outside the
 * calculation entirely — a driver keeps those on top.
 *
 * ── READ THIS BEFORE USING THE RESULT ───────────────────────────────────────────────────────
 *
 * **The statutory obligation is assessed on a two-week AGGREGATE, not per trip.** A platform
 * compares a driver's total earnings across the period against the total floor across the period,
 * and tops up the difference. A single ride landing under its own floor is not a violation and
 * not a debt — it is netted against every other ride in the fortnight.
 *
 * So the per-trip figure this module produces is a **diagnostic**, not a liability: it answers
 * "which trip shapes drag" and "roughly what would topping them up cost", which is what you need
 * to price sensibly. `aggregateFloorShortfall` is the one that matches the actual obligation.
 *
 * Nothing here is hardcoded. The minimum wage is set per city and changes annually (San Diego's
 * is above California's), and the per-mile rate is republished each year by the State Treasurer.
 * Both are arguments for the same reason commission rates are rows: they will change, and that
 * should never mean editing this file.
 *
 * This module does not decide the open legal question in `docs/README.md` — how the floor
 * interacts with RIDO's model is a lawyer's call. It turns the question into a number you can
 * take to one.
 */

import { type Cents, cents, roundHalfUpDiv } from "./money.ts";

const SECONDS_PER_HOUR = 3_600;
const MILLI_METRES_PER_MILE = 1_609_344;
const MILLI = 1_000;

/**
 * The statutory rates, which vary by city and by year — hence arguments, never constants.
 *
 * `hourlyFloorCents` is the ALREADY-MULTIPLIED figure (120% of the local minimum wage), not the
 * minimum wage itself. Passing the raw wage would be a silent 20% underpayment, so the field name
 * says what it holds and the validation below refuses obvious nonsense.
 */
export interface EarningsFloorRates {
  /** 120% of the local minimum wage, per hour, in cents. */
  readonly hourlyFloorCents: number;
  /** The per-engaged-mile expense rate, in cents. */
  readonly perEngagedMileCents: number;
}

export interface EngagedTrip {
  /** Accept to drop-off. */
  readonly engagedSeconds: number;
  readonly engagedMeters: number;
}

export interface EarningsFloor {
  readonly floorCents: Cents;
  readonly timeComponentCents: number;
  readonly mileageComponentCents: number;
}

const requireNonNegativeInteger = (value: number, name: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`earnings floor: ${name} must be a non-negative integer, got ${value}`);
  }
};

/**
 * The guaranteed minimum earnings for one engaged trip.
 *
 * Exact integer arithmetic throughout, by the same method `fare.ts` uses for its per-mile term:
 * scale the numerator so the fractional metres-per-mile divisor becomes a whole number, and round
 * once. The two components round independently and are then summed, because they are two separate
 * statutory entitlements rather than parts of one quantity.
 */
export function earningsFloorForTrip(trip: EngagedTrip, rates: EarningsFloorRates): EarningsFloor {
  requireNonNegativeInteger(trip.engagedSeconds, "engagedSeconds");
  requireNonNegativeInteger(trip.engagedMeters, "engagedMeters");
  requireNonNegativeInteger(rates.hourlyFloorCents, "hourlyFloorCents");
  requireNonNegativeInteger(rates.perEngagedMileCents, "perEngagedMileCents");

  const timeComponentCents = roundHalfUpDiv(
    rates.hourlyFloorCents * trip.engagedSeconds,
    SECONDS_PER_HOUR,
  );

  const mileageNumerator = rates.perEngagedMileCents * trip.engagedMeters * MILLI;
  if (!Number.isSafeInteger(mileageNumerator)) {
    throw new Error(
      `earnings floor: engagedMeters too large to compute exactly (${trip.engagedMeters})`,
    );
  }
  const mileageComponentCents = roundHalfUpDiv(mileageNumerator, MILLI_METRES_PER_MILE);

  return {
    floorCents: cents(timeComponentCents + mileageComponentCents),
    timeComponentCents,
    mileageComponentCents,
  };
}

export interface FloorComparison {
  readonly floorCents: number;
  readonly earningsCents: number;
  /** Positive when earnings fall short of the floor; zero when they meet or exceed it. */
  readonly shortfallCents: number;
  readonly meetsFloor: boolean;
}

/**
 * Compares one trip's driver payout against its own floor.
 *
 * **A diagnostic, not an obligation** — see the module header. Use it to find which trip shapes
 * are underwater, not to compute what anyone is owed.
 *
 * `earningsCents` should be the driver's payout for the trip, excluding tips (which Prop 22
 * excludes from the comparison).
 */
export function tripFloorComparison(
  trip: EngagedTrip,
  rates: EarningsFloorRates,
  earningsCents: number,
): FloorComparison {
  requireNonNegativeInteger(earningsCents, "earningsCents");
  const { floorCents } = earningsFloorForTrip(trip, rates);
  const shortfallCents = Math.max(0, floorCents - earningsCents);
  return {
    floorCents,
    earningsCents,
    shortfallCents,
    meetsFloor: shortfallCents === 0,
  };
}

/**
 * The comparison that actually matches the statute: total earnings against total floor across an
 * earnings period.
 *
 * This is strictly weaker than requiring every trip to clear its own floor, and the difference is
 * the point — a fortnight of good trips absorbs a handful of slow short ones. Anything reasoning
 * about what the guarantee costs should use this; `tripFloorComparison` only tells you where the
 * drag comes from.
 */
export function aggregateFloorShortfall(
  trips: readonly EngagedTrip[],
  rates: EarningsFloorRates,
  totalEarningsCents: number,
): FloorComparison {
  requireNonNegativeInteger(totalEarningsCents, "totalEarningsCents");
  const floorCents = trips.reduce(
    (sum, trip) => sum + earningsFloorForTrip(trip, rates).floorCents,
    0,
  );
  const shortfallCents = Math.max(0, floorCents - totalEarningsCents);
  return {
    floorCents,
    earningsCents: totalEarningsCents,
    shortfallCents,
    meetsFloor: shortfallCents === 0,
  };
}
