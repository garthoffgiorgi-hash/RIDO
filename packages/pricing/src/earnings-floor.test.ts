/**
 * Prop 22 earnings floor.
 *
 * The rates here are synthetic and round, chosen so the arithmetic is checkable by eye. The real
 * San Diego figures are cited in `docs/compliance/ca-tnc.md` and used by the calibration script —
 * they change every January, which is exactly why this module takes them as arguments and why no
 * test in this file depends on their current values.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  aggregateFloorShortfall,
  type EarningsFloorRates,
  earningsFloorForTrip,
  tripFloorComparison,
} from "./earnings-floor.ts";

/** $24.00/hr engaged (i.e. 120% of a $20 wage) and $0.50 per engaged mile. Not the real rates. */
const RATES: EarningsFloorRates = { hourlyFloorCents: 2_400, perEngagedMileCents: 50 };
const MILE = 1_609;

describe("the floor for one trip", () => {
  it("pays the hourly component pro rata", () => {
    assert.equal(
      earningsFloorForTrip({ engagedSeconds: 3_600, engagedMeters: 0 }, RATES).floorCents,
      2_400,
    );
    assert.equal(
      earningsFloorForTrip({ engagedSeconds: 1_800, engagedMeters: 0 }, RATES).floorCents,
      1_200,
    );
    assert.equal(
      earningsFloorForTrip({ engagedSeconds: 900, engagedMeters: 0 }, RATES).floorCents,
      600,
    );
  });

  it("pays the mileage component per mile", () => {
    const floor = earningsFloorForTrip({ engagedSeconds: 0, engagedMeters: 10 * MILE }, RATES);
    assert.equal(floor.mileageComponentCents, 500);
  });

  it("sums the two components", () => {
    // 30 minutes at $24/hr = $12.00, plus 6 miles at $0.50 = $3.00.
    const floor = earningsFloorForTrip({ engagedSeconds: 1_800, engagedMeters: 6 * MILE }, RATES);
    assert.equal(floor.timeComponentCents, 1_200);
    assert.equal(floor.mileageComponentCents, 300);
    assert.equal(floor.floorCents, 1_500);
  });

  it("is zero for a trip with no time and no distance", () => {
    assert.equal(
      earningsFloorForTrip({ engagedSeconds: 0, engagedMeters: 0 }, RATES).floorCents,
      0,
    );
  });

  it("is monotone in both time and distance", () => {
    let previous = -1;
    for (let seconds = 0; seconds <= 3_600; seconds += 60) {
      const floor = earningsFloorForTrip(
        { engagedSeconds: seconds, engagedMeters: 5_000 },
        RATES,
      ).floorCents;
      assert.ok(floor >= previous);
      previous = floor;
    }
    previous = -1;
    for (let meters = 0; meters <= 40_000; meters += 500) {
      const floor = earningsFloorForTrip(
        { engagedSeconds: 900, engagedMeters: meters },
        RATES,
      ).floorCents;
      assert.ok(floor >= previous);
      previous = floor;
    }
  });

  it("never produces a fractional value", () => {
    for (let seconds = 0; seconds < 5_000; seconds += 137) {
      for (let meters = 0; meters < 30_000; meters += 811) {
        const floor = earningsFloorForTrip(
          { engagedSeconds: seconds, engagedMeters: meters },
          RATES,
        );
        assert.ok(Number.isInteger(floor.floorCents));
        assert.ok(Number.isInteger(floor.timeComponentCents));
        assert.ok(Number.isInteger(floor.mileageComponentCents));
      }
    }
  });

  it("rejects negative or fractional inputs rather than computing a floor from them", () => {
    assert.throws(() => earningsFloorForTrip({ engagedSeconds: -1, engagedMeters: 0 }, RATES));
    assert.throws(() => earningsFloorForTrip({ engagedSeconds: 0, engagedMeters: 1.5 }, RATES));
    assert.throws(() =>
      earningsFloorForTrip(
        { engagedSeconds: 60, engagedMeters: 0 },
        { ...RATES, hourlyFloorCents: -1 },
      ),
    );
  });
});

describe("comparing one trip against its own floor", () => {
  const trip = { engagedSeconds: 1_800, engagedMeters: 6 * MILE }; // floor = 1500

  it("reports a shortfall when the driver earns less", () => {
    const result = tripFloorComparison(trip, RATES, 1_200);
    assert.equal(result.floorCents, 1_500);
    assert.equal(result.shortfallCents, 300);
    assert.equal(result.meetsFloor, false);
  });

  it("reports no shortfall when the driver clears it", () => {
    const result = tripFloorComparison(trip, RATES, 1_800);
    assert.equal(result.shortfallCents, 0);
    assert.equal(result.meetsFloor, true);
  });

  it("never reports a negative shortfall — clearing the floor is not a credit", () => {
    assert.equal(tripFloorComparison(trip, RATES, 99_999).shortfallCents, 0);
  });

  it("treats exactly meeting the floor as meeting it", () => {
    assert.equal(tripFloorComparison(trip, RATES, 1_500).meetsFloor, true);
  });
});

describe("the aggregate comparison, which is the one the statute actually uses", () => {
  const trips = [
    { engagedSeconds: 1_800, engagedMeters: 6 * MILE }, // floor 1500
    { engagedSeconds: 1_800, engagedMeters: 6 * MILE }, // floor 1500
    { engagedSeconds: 900, engagedMeters: MILE }, //       floor  650
  ];

  it("sums the floors across the period", () => {
    assert.equal(aggregateFloorShortfall(trips, RATES, 0).floorCents, 3_650);
  });

  it("is strictly weaker than requiring every trip to clear its own floor", () => {
    // The whole reason the distinction matters. One trip is badly underwater on its own; the
    // period as a whole is fine, and no adjustment is owed.
    const perTrip = [1_000, 2_000, 1_000]; // trip 1 is 500 short of its own floor
    assert.equal(tripFloorComparison(trips[0], RATES, perTrip[0]).meetsFloor, false);

    const total = perTrip.reduce((a, b) => a + b, 0); // 4000 vs a 3650 aggregate floor
    const aggregate = aggregateFloorShortfall(trips, RATES, total);
    assert.equal(aggregate.meetsFloor, true);
    assert.equal(aggregate.shortfallCents, 0);
  });

  it("still catches a period that genuinely falls short", () => {
    const aggregate = aggregateFloorShortfall(trips, RATES, 3_000);
    assert.equal(aggregate.shortfallCents, 650);
    assert.equal(aggregate.meetsFloor, false);
  });

  it("handles a period with no trips", () => {
    const aggregate = aggregateFloorShortfall([], RATES, 0);
    assert.equal(aggregate.floorCents, 0);
    assert.equal(aggregate.meetsFloor, true);
  });
});
