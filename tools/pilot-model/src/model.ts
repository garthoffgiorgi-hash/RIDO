/**
 * The pilot economics model — the arithmetic, with no React in it.
 *
 * This file used to be a function called `gradComm()` inside the component, computing bracketed
 * commission a second time, in floating-point dollars, with the pilot decided by `m <= pilotMonths`.
 * Three things were wrong with that, in increasing order of seriousness:
 *
 *   1. It was a duplicate of `commissionForRide`. A model that disagrees with production is not a
 *      model, it's a second opinion — and this one had no tests to notice if it drifted.
 *   2. It was floats and dollars, against root CLAUDE.md invariant 1.
 *   3. It decided the flat fee by comparing a month index against a pilot length. ADR-0003 says
 *      the fee turn-on is a per-driver state gated on a traction signal, **never a date in code**.
 *      Modelling it as a deadline models a business we decided not to run.
 *
 * So: every money value here is integer cents, every rate is basis points, and every commission
 * and fee figure comes from `@rido/pricing`. The fee turns on when driver count crosses a
 * threshold — a traction signal, which is the shape ADR-0003 actually describes.
 *
 * Separated from the component so it can be tested (ADR-0007 — this is money math), and so the
 * revenue modelling that comes next has something to call.
 *
 * **Still a planning tool, not accounting.** It models the *average* driver, so the real blended
 * take runs a little higher: more drivers sit low in the bands, where the rate is higher, than
 * the average driver-month suggests. Directional.
 */

import {
  applyBps,
  bps,
  BPS_DENOMINATOR,
  cents,
  type CommissionTier,
  commissionForRide,
  monthlyFlatFee,
  roundHalfUpDiv,
} from "@rido/pricing";

/**
 * Card processing, as basis points rather than 0.029: Stripe's ~2.9% + $0.30. Whether RIDO
 * absorbs this or passes it to drivers is Open Question #3 in docs/README.md — hence the toggle.
 */
const PROCESSING_RATE_BPS = 290;
const PROCESSING_PER_RIDE_CENTS = 30;

export interface ModelInputs {
  readonly horizonMonths: number;
  /** Average gross fare, integer cents. */
  readonly fareCents: number;
  readonly driversStart: number;
  readonly driversEnd: number;
  readonly ridesPerDriverStart: number;
  readonly ridesPerDriverEnd: number;

  /** Steady-state monthly subscription, integer cents. */
  readonly flatFeeCents: number;
  /**
   * The traction signal that turns the fee on: the driver count at which a driver moves from the
   * pilot plan to the standard one. NOT a month. (ADR-0003)
   */
  readonly feeOnAtDrivers: number;
  /**
   * Counterfactual: waive commission too, while the fee is off. ADR-0003 decided commission runs
   * during the pilot, so this is off by default — it exists to price the road not taken.
   */
  readonly waiveCommissionBeforeFee: boolean;
  readonly tiers: readonly CommissionTier[];

  readonly insuranceFixedCents: number;
  readonly insurancePerRideCents: number;
  readonly passProcessingToDrivers: boolean;
  readonly techCents: number;
  readonly acquisitionPerDriverCents: number;
  readonly teamCents: number;

  /** Incumbent effective take, for the driver comparison. Basis points. */
  readonly incumbentTakeBps: number;
}

export interface MonthRow {
  readonly month: number;
  readonly drivers: number;
  readonly rides: number;
  readonly gmvCents: number;
  readonly revenueCents: number;
  readonly costCents: number;
  readonly netCents: number;
  readonly cumCents: number;
  readonly feeActive: boolean;
  readonly phase: "Pilot" | "Steady";
  readonly grossPerDriverCents: number;
  readonly revenuePerDriverCents: number;
  readonly commissionPerDriverCents: number;
  readonly feePerDriverCents: number;
}

export interface SteadyState {
  readonly grossPerDriverCents: number;
  readonly revenuePerDriverCents: number;
  readonly blendedTakeBps: number;
  readonly driverTakeHomeCents: number;
  readonly incumbentTakeHomeCents: number;
  /** Positive means a RIDO driver keeps more than an incumbent driver on the same fares. */
  readonly advantageCents: number;
}

export interface ModelResult {
  readonly rows: readonly MonthRow[];
  /** The deepest cumulative hole, as a positive number: the cash you have to fund. */
  readonly cashToFundCents: number;
  readonly deepestMonth: number;
  readonly breakEvenMonth: number | null;
  readonly cashRecoupedMonth: number | null;
  /** First month the traction threshold is met and the fee starts. */
  readonly feeStartsMonth: number | null;
  readonly steady: SteadyState;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Take-home under a single flat rate, via the same engine — never a hand-rolled percentage. */
function flatRateTakeHome(grossCents: number, rateBps: number): number {
  const { driverPayoutCents } = commissionForRide({
    fareCents: cents(grossCents),
    mtdGrossCents: cents(0),
    tiers: [{ tierOrder: 1, lowerBoundCents: 0, upperBoundCents: null, rateBps }],
  });
  return driverPayoutCents;
}

export function runModel(inputs: ModelInputs): ModelResult {
  const {
    horizonMonths,
    fareCents,
    driversStart,
    driversEnd,
    ridesPerDriverStart,
    ridesPerDriverEnd,
    flatFeeCents,
    feeOnAtDrivers,
    waiveCommissionBeforeFee,
    tiers,
    insuranceFixedCents,
    insurancePerRideCents,
    passProcessingToDrivers,
    techCents,
    acquisitionPerDriverCents,
    teamCents,
    incumbentTakeBps,
  } = inputs;

  if (!Number.isInteger(horizonMonths) || horizonMonths < 1) {
    throw new Error(`runModel: horizonMonths must be a positive integer, got ${horizonMonths}`);
  }

  const rows: MonthRow[] = [];
  let cumCents = 0;
  let previousDrivers = 0;
  let cashToFundCents = 0;
  let deepestMonth = 0;
  let breakEvenMonth: number | null = null;
  let cashRecoupedMonth: number | null = null;
  let feeStartsMonth: number | null = null;

  for (let month = 1; month <= horizonMonths; month++) {
    const t = horizonMonths > 1 ? (month - 1) / (horizonMonths - 1) : 0;
    const drivers = Math.round(lerp(driversStart, driversEnd, t));
    const ridesPerDriver = lerp(ridesPerDriverStart, ridesPerDriverEnd, t);

    // Rides per driver is a rate, not money, so it interpolates as a float — but everything
    // downstream of it is rounded to whole rides and whole cents before any money touches it.
    const rides = Math.round(drivers * ridesPerDriver);
    const grossPerDriverCents = Math.round(ridesPerDriver * fareCents);
    const gmvCents = drivers * grossPerDriverCents;

    // The traction switch, not a deadline (ADR-0003). Crossing the threshold moves a driver from
    // the pilot plan to the standard one; monthlyFlatFee refuses the contradictory combination.
    const feeActive = drivers >= feeOnAtDrivers;
    if (feeActive && feeStartsMonth === null) feeStartsMonth = month;

    // One driver-month of fares, rated from a month-to-date position of zero, IS the whole month
    // bracketed in one pass — ADR-0002's "mathematically identical" property, used deliberately.
    const commissionPerDriverCents =
      !feeActive && waiveCommissionBeforeFee
        ? 0
        : commissionForRide({
            fareCents: cents(grossPerDriverCents),
            mtdGrossCents: cents(0),
            tiers,
          }).commissionCents;

    const feePerDriverCents = monthlyFlatFee({
      plan: feeActive ? "standard" : "pilot",
      feeActive,
      flatFeeCents: cents(flatFeeCents),
    });

    const revenuePerDriverCents = commissionPerDriverCents + feePerDriverCents;
    const revenueCents = drivers * revenuePerDriverCents;

    const insuranceCents = insuranceFixedCents + insurancePerRideCents * rides;
    const processingCents = passProcessingToDrivers
      ? 0
      : applyBps(cents(gmvCents), bps(PROCESSING_RATE_BPS)) + rides * PROCESSING_PER_RIDE_CENTS;
    const newDrivers = Math.max(0, drivers - previousDrivers);
    const marketingCents = newDrivers * acquisitionPerDriverCents;
    const costCents = insuranceCents + processingCents + techCents + marketingCents + teamCents;

    const netCents = revenueCents - costCents;
    cumCents += netCents;

    if (cumCents < cashToFundCents) {
      cashToFundCents = cumCents;
      deepestMonth = month;
    }
    if (breakEvenMonth === null && netCents >= 0) breakEvenMonth = month;
    if (cashRecoupedMonth === null && cumCents >= 0 && month > 1) cashRecoupedMonth = month;

    rows.push({
      month,
      drivers,
      rides,
      gmvCents,
      revenueCents,
      costCents,
      netCents,
      cumCents,
      feeActive,
      phase: feeActive ? "Steady" : "Pilot",
      grossPerDriverCents,
      revenuePerDriverCents,
      commissionPerDriverCents,
      feePerDriverCents,
    });
    previousDrivers = drivers;
  }

  const last = rows[rows.length - 1];

  // What the driver actually keeps: their fares, minus our commission AND minus the flat fee.
  // The previous version labelled RIDO's revenue per driver as "Driver take-home" — it computed
  // gross − (gross − revenue), which is revenue. The comparison against an incumbent was built on
  // that, so it was comparing our revenue to a driver's earnings.
  const driverTakeHomeCents = last.grossPerDriverCents - last.revenuePerDriverCents;
  const incumbentTakeHomeCents = flatRateTakeHome(last.grossPerDriverCents, incumbentTakeBps);

  const steady: SteadyState = {
    grossPerDriverCents: last.grossPerDriverCents,
    revenuePerDriverCents: last.revenuePerDriverCents,
    blendedTakeBps:
      last.grossPerDriverCents === 0
        ? 0
        : roundHalfUpDiv(last.revenuePerDriverCents * BPS_DENOMINATOR, last.grossPerDriverCents),
    driverTakeHomeCents,
    incumbentTakeHomeCents,
    advantageCents: driverTakeHomeCents - incumbentTakeHomeCents,
  };

  return {
    rows,
    // Reported as the positive amount of cash to raise, rather than as a negative balance.
    cashToFundCents: -cashToFundCents,
    deepestMonth,
    breakEvenMonth,
    cashRecoupedMonth,
    feeStartsMonth,
    steady,
  };
}
