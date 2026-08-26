/**
 * What a ride costs the rider.
 *
 * The other half of this package decides how a fare is *split*; this decides what the fare *is*.
 * Same rules apply: pure, integer cents, no float anywhere in the path, and not one rate written
 * as a literal — the card is a row in `fare_rate_cards`, exactly as the commission bands are rows
 * in `commission_tiers`. Changing what a ride costs is a row edit, not a deploy.
 *
 * The shape is base + distance + time, with a floor:
 *
 *     metered = base + perMile x miles + perMinute x minutes
 *     fare    = max(metered, minimumFare) x surge
 *
 * Deliberately the same shape incumbents use. Riders already understand it, and a price nobody
 * can decompose is exactly the opacity the brand is positioned against — which is why a quote
 * carries its own breakdown rather than just a number.
 *
 * RIDO's price is NOT computed from a competitor's. It comes from our own card, whose values were
 * *calibrated* to sit a target margin below a modelled incumbent fare — see ADR-0009 and
 * `scripts/calibrate-fares.mjs`. Nothing at runtime knows what anyone else charges, so a stale
 * figure about a competitor can never move a rider's price.
 */

import {
  applyMultiplierBps,
  type Bps,
  BPS_DENOMINATOR,
  type Cents,
  cents,
  roundHalfUpDiv,
} from "./money.ts";

/**
 * Metres in an international mile, scaled by 1000 so the conversion stays exact in integers.
 *
 * A mile is 1609.344 m — fractional, which is the whole problem. Distance arrives in metres (what
 * `rides.distance_meters` stores and what every mapping SDK returns) while the rate is per mile,
 * so the naive multiply produces a fraction. Scaling the numerator by 1000 instead makes the
 * divisor a whole number and keeps every intermediate an integer.
 */
const MILLI_METRES_PER_MILE = 1_609_344;
const MILLI = 1_000;
const SECONDS_PER_MINUTE = 60;

/** No surge. Kept as a named value so a caller passing nothing and a caller passing 1.00x agree. */
export const NO_SURGE_BPS = BPS_DENOMINATOR;

/**
 * A market's rate card. Values are DATA, loaded from `fare_rate_cards` and passed in — this
 * module never hardcodes a price, the same way `tiers.ts` never hardcodes a rate.
 */
export interface FareRateCard {
  /** Charged on every ride before distance or time. */
  readonly baseCents: number;
  readonly perMileCents: number;
  readonly perMinuteCents: number;
  /** The metered fare is raised to this if it comes in below. */
  readonly minimumFareCents: number;
}

/**
 * A pass-through charge that is NOT RIDO revenue: a CPUC surcharge, an airport pickup fee.
 *
 * These must never be commissionable — taking a cut of a fee we merely collect and remit would be
 * taking a cut of someone else's money. Hence the split in `FareQuote` below: `fareCents` is the
 * commissionable subtotal and these ride alongside it.
 *
 * Nothing produces one yet. The shape exists so that when the CPUC and airport rules are worked
 * out (roadmap Phase 4) they become data rather than a restructuring of everything downstream of
 * a quote — and, more importantly, so nobody is tempted to fold them into the fare to keep the
 * arithmetic simple. `market-viability.md` records what happened to a competitor whose cheaper
 * price turned out to be built on fees it wasn't collecting.
 */
export interface FareLineItem {
  readonly code: string;
  readonly label: string;
  readonly amountCents: number;
}

export interface FareBreakdown {
  readonly baseCents: number;
  readonly distanceCents: number;
  readonly timeCents: number;
  /** True when the metered fare came in under the floor and was raised to it. */
  readonly minimumApplied: boolean;
  readonly surgeMultiplierBps: number;
}

export interface FareQuote {
  /**
   * The commissionable fare — what lands in `rides.fare_cents`, and what `commissionForRide`
   * splits. Its meaning is unchanged from before this module existed.
   */
  readonly fareCents: Cents;
  /** Pass-throughs. Empty today; see FareLineItem. */
  readonly lineItems: readonly FareLineItem[];
  /** What the rider is actually charged: the fare plus every pass-through. */
  readonly riderTotalCents: Cents;
  readonly breakdown: FareBreakdown;
}

export interface FareQuoteInput {
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly rateCard: FareRateCard;
  /**
   * Demand multiplier in basis points; 10,000 is 1.00x and is the default.
   *
   * **The seam, not the engine.** Nothing computes this yet: ADR-0008 puts spatial-temporal work
   * outside the request path, and the demand data that would drive it is only now being recorded.
   * A future surge model supplies this argument; the fare math is complete and testable without
   * one.
   */
  readonly surgeMultiplierBps?: number;
}

const requireNonNegativeInteger = (value: number, name: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`quoteFare: ${name} must be a non-negative integer, got ${value}`);
  }
};

/**
 * Structural validation of a card. Deliberately has NO opinion about what a fare should be — only
 * that the card is coherent, exactly as `normalizeTiers` validates shape and never values.
 *
 * This is what keeps repricing free: a card at half these rates, or double them, passes
 * identically. The only judgement it makes is that a minimum below the base is meaningless,
 * because such a floor could never bind.
 */
export function validateRateCard(card: FareRateCard): void {
  requireNonNegativeInteger(card.baseCents, "rateCard.baseCents");
  requireNonNegativeInteger(card.perMileCents, "rateCard.perMileCents");
  requireNonNegativeInteger(card.perMinuteCents, "rateCard.perMinuteCents");
  requireNonNegativeInteger(card.minimumFareCents, "rateCard.minimumFareCents");

  if (card.minimumFareCents < card.baseCents) {
    throw new Error(
      `quoteFare: minimumFareCents (${card.minimumFareCents}) is below baseCents (${card.baseCents}), so it could never apply — one of the two is wrong.`,
    );
  }
}

/**
 * Prices one trip.
 *
 * Rounding order is fixed and load-bearing: each component rounds to whole cents, they are summed,
 * then the floor and the multiplier apply. Rounding at the end of the whole expression instead
 * would give a different answer by a cent on some trips, and two implementations that disagree by
 * a cent on a rider's receipt is the failure this package exists to prevent. The order is asserted
 * in the tests, not just described here.
 */
export function quoteFare(input: FareQuoteInput): FareQuote {
  const { distanceMeters, durationSeconds, rateCard } = input;
  const surgeMultiplierBps = input.surgeMultiplierBps ?? NO_SURGE_BPS;

  requireNonNegativeInteger(distanceMeters, "distanceMeters");
  requireNonNegativeInteger(durationSeconds, "durationSeconds");
  requireNonNegativeInteger(surgeMultiplierBps, "surgeMultiplierBps");
  validateRateCard(rateCard);

  // Guard the products before they happen rather than inspecting the wreckage afterwards. Both
  // sit far inside the safe range at any real trip length — a 1,000-mile ride is ~1.7e11 — but a
  // silent precision loss on a price is exactly the failure mode worth an explicit check.
  const distanceNumerator = rateCard.perMileCents * distanceMeters * MILLI;
  if (!Number.isSafeInteger(distanceNumerator)) {
    throw new Error(
      `quoteFare: distance is too large to price exactly (${distanceMeters} m at ${rateCard.perMileCents} cents/mile)`,
    );
  }
  const timeNumerator = rateCard.perMinuteCents * durationSeconds;
  if (!Number.isSafeInteger(timeNumerator)) {
    throw new Error(
      `quoteFare: duration is too large to price exactly (${durationSeconds} s at ${rateCard.perMinuteCents} cents/minute)`,
    );
  }

  const distanceCents = roundHalfUpDiv(distanceNumerator, MILLI_METRES_PER_MILE);
  const timeCents = roundHalfUpDiv(timeNumerator, SECONDS_PER_MINUTE);

  const meteredCents = rateCard.baseCents + distanceCents + timeCents;
  const minimumApplied = meteredCents < rateCard.minimumFareCents;
  const flooredCents = minimumApplied ? rateCard.minimumFareCents : meteredCents;

  // Surge applies AFTER the floor, so a 2x multiplier on a minimum-fare trip actually doubles it
  // rather than being swallowed by the floor. A deliberate choice; a future surge model may want
  // to revisit it, which is why it's stated here rather than left implicit in the ordering.
  const fareCents =
    surgeMultiplierBps === NO_SURGE_BPS
      ? cents(flooredCents)
      : applyMultiplierBps(cents(flooredCents), surgeMultiplierBps as Bps);

  // Empty today. Summed rather than assumed zero so that adding the first pass-through is a
  // one-line change here and no change at all anywhere downstream.
  const lineItems: readonly FareLineItem[] = [];
  const passThroughCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);

  return {
    fareCents,
    lineItems,
    riderTotalCents: cents(fareCents + passThroughCents),
    breakdown: {
      baseCents: rateCard.baseCents,
      distanceCents,
      timeCents,
      minimumApplied,
      surgeMultiplierBps,
    },
  };
}
