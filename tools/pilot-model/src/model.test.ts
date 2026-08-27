/**
 * Tests for the pilot economics model.
 *
 * This is money math, so ADR-0007 says it ships with tests. It's also the file that used to hold
 * a second commission implementation, so most of what's asserted here is that it no longer has
 * one: the figures must equal what `@rido/pricing` produces, and the flat fee must follow a
 * traction signal rather than the calendar (ADR-0003).
 *
 * Tier fixtures are SYNTHETIC. The seeded rates are pinned in exactly one place
 * (packages/pricing/src/commission.seed.test.ts); a copy here would be a second thing to update
 * at every repricing, which is the drift that split exists to prevent.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { type CommissionTier, cents, commissionForRide } from "@rido/pricing";
import { type ModelInputs, runModel } from "./model.ts";

/** Two synthetic bands: 25% up to $500/mo, then 10%. Not RIDO's rates. */
const TIERS: readonly CommissionTier[] = [
  { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: 50_000, rateBps: 2500 },
  { tierOrder: 2, lowerBoundCents: 50_000, upperBoundCents: null, rateBps: 1000 },
];

const BASE: ModelInputs = {
  horizonMonths: 12,
  fareCents: 1_800,
  driversStart: 25,
  driversEnd: 200,
  ridesPerDriverStart: 20,
  ridesPerDriverEnd: 120,
  ridersStart: 100,
  ridersEnd: 1_000,
  flatFeeCents: 5_000,
  feeOnAtDrivers: 100,
  waiveCommissionBeforeFee: false,
  tiers: TIERS,
  insuranceFixedCents: 300_000,
  insurancePerRideCents: 40,
  mapboxCentsPerRide: 2,
  processingRateBps: 290,
  processingPerRideCents: 30,
  passProcessingToDrivers: false,
  techCents: 100_000,
  acquisitionPerDriverCents: 3_000,
  acquisitionPerRiderCents: 500,
  teamCents: 0,
  incumbentTakeBps: 3000,
};

const run = (over: Partial<ModelInputs> = {}) => runModel({ ...BASE, ...over });

describe("the flat fee follows traction, not the calendar", () => {
  it("is off while the driver count is below the threshold", () => {
    const { rows } = run({ feeOnAtDrivers: 150 });
    for (const row of rows.filter((r) => r.drivers < 150)) {
      assert.equal(row.feePerDriverCents, 0);
      assert.equal(row.feeActive, false);
      assert.equal(row.phase, "Pilot");
    }
  });

  it("is on once the driver count reaches the threshold", () => {
    const { rows } = run({ feeOnAtDrivers: 150 });
    const on = rows.filter((r) => r.drivers >= 150);
    assert.ok(on.length > 0, "the ramp should cross the threshold somewhere");
    for (const row of on) {
      assert.equal(row.feePerDriverCents, BASE.flatFeeCents);
      assert.equal(row.phase, "Steady");
    }
  });

  it("starts in a different month when the ramp is different — the month itself decides nothing", () => {
    // Same threshold, same horizon. Only the growth curve changes. If the fee were a deadline,
    // these would start in the same month.
    const fast = run({ feeOnAtDrivers: 100, driversStart: 90, driversEnd: 400 });
    const slow = run({ feeOnAtDrivers: 100, driversStart: 5, driversEnd: 110 });
    assert.notEqual(fast.feeStartsMonth, slow.feeStartsMonth);
    assert.ok((fast.feeStartsMonth ?? 99) < (slow.feeStartsMonth ?? 99));
  });

  it("never starts if the business never reaches the threshold, however long the horizon", () => {
    const { feeStartsMonth, rows } = run({ feeOnAtDrivers: 5_000 });
    assert.equal(feeStartsMonth, null);
    assert.ok(rows.every((r) => r.feePerDriverCents === 0));
  });
});

describe("commission", () => {
  it("runs while the fee is still off — the pilot waives the fee, not the commission", () => {
    // ADR-0003, and a root CLAUDE.md guardrail.
    const { rows } = run({ feeOnAtDrivers: 5_000 });
    assert.ok(rows.every((r) => r.feePerDriverCents === 0));
    assert.ok(rows.every((r) => r.commissionPerDriverCents > 0));
  });

  it("equals what @rido/pricing computes — there is no second implementation", () => {
    for (const row of run().rows) {
      const expected = commissionForRide({
        fareCents: cents(row.grossPerDriverCents),
        mtdGrossCents: cents(0),
        tiers: TIERS,
      }).commissionCents;
      assert.equal(row.commissionPerDriverCents, expected);
    }
  });

  it("can be waived as an explicit counterfactual, and only before the fee starts", () => {
    const { rows } = run({ waiveCommissionBeforeFee: true, feeOnAtDrivers: 150 });
    for (const row of rows) {
      if (row.feeActive) assert.ok(row.commissionPerDriverCents > 0);
      else assert.equal(row.commissionPerDriverCents, 0);
    }
  });
});

describe("the driver comparison", () => {
  it("take-home is the driver's fares minus BOTH what we take", () => {
    // The previous version displayed RIDO's revenue per driver under the label "Driver
    // take-home" — it computed gross − (gross − revenue). This is the assertion that would have
    // caught it.
    const { rows, steady } = run();
    const last = rows[rows.length - 1];
    assert.equal(
      steady.driverTakeHomeCents,
      last.grossPerDriverCents - last.commissionPerDriverCents - last.feePerDriverCents,
    );
    assert.notEqual(steady.driverTakeHomeCents, last.revenuePerDriverCents);
  });

  it("compares a driver against a driver, not against our revenue", () => {
    const { steady } = run();
    assert.equal(
      steady.advantageCents,
      steady.driverTakeHomeCents - steady.incumbentTakeHomeCents,
    );
  });

  it("a lower incumbent take makes our advantage smaller", () => {
    const greedy = run({ incumbentTakeBps: 4500 }).steady.advantageCents;
    const gentle = run({ incumbentTakeBps: 1500 }).steady.advantageCents;
    assert.ok(greedy > gentle);
  });

  it("blended take is our revenue over the driver's fares", () => {
    const { steady } = run();
    assert.ok(steady.blendedTakeBps > 0 && steady.blendedTakeBps < 10_000);
    assert.equal(
      steady.grossPerDriverCents - steady.revenuePerDriverCents,
      steady.driverTakeHomeCents,
    );
  });
});

describe("Mapbox is a per-ride cost, not a constant", () => {
  it("is zero when the per-ride rate is zero", () => {
    const { rows } = run({ mapboxCentsPerRide: 0 });
    assert.ok(rows.every((r) => r.mapboxCents === 0));
  });

  it("scales linearly with ride volume", () => {
    const { rows } = run({ mapboxCentsPerRide: 3 });
    for (const row of rows) {
      assert.equal(row.mapboxCents, row.rides * 3);
    }
  });

  it("adds to total cost rather than replacing another line", () => {
    const withIt = run({ mapboxCentsPerRide: 5 });
    const without = run({ mapboxCentsPerRide: 0 });
    for (let i = 0; i < withIt.rows.length; i++) {
      assert.equal(withIt.rows[i].costCents - without.rows[i].costCents, withIt.rows[i].rides * 5);
    }
  });
});

describe("card processing is an input, not a hardcoded constant", () => {
  it("a higher rate charges more on the same volume", () => {
    const low = run({ processingRateBps: 100, processingPerRideCents: 0 });
    const high = run({ processingRateBps: 500, processingPerRideCents: 0 });
    const lastLow = low.rows[low.rows.length - 1];
    const lastHigh = high.rows[high.rows.length - 1];
    assert.ok(lastHigh.processingCents > lastLow.processingCents);
  });

  it("still zeroes out when passed to drivers, whatever the rate", () => {
    const { rows } = run({
      processingRateBps: 999,
      processingPerRideCents: 99,
      passProcessingToDrivers: true,
    });
    assert.ok(rows.every((r) => r.processingCents === 0));
  });
});

describe("rider acquisition mirrors driver acquisition", () => {
  // Month 1 always charges acquisition for the starting cohort — previousRiders (like
  // previousDrivers) begins at zero, so ridersStart itself counts as "new" on the first row. Same
  // property the driver side already had; this is the first test to exercise it either way.
  it("costs nothing past month 1 when the rider count never grows", () => {
    const { rows } = run({ ridersStart: 500, ridersEnd: 500, acquisitionPerRiderCents: 1_000 });
    assert.equal(rows[0].riderAcquisitionCents, 500 * 1_000);
    assert.ok(rows.slice(1).every((r) => r.riderAcquisitionCents === 0));
  });

  it("charges the acquisition rate on every new rider added that month", () => {
    const { rows } = run({ ridersStart: 0, ridersEnd: 1_100, acquisitionPerRiderCents: 200 });
    let previous = 0;
    for (const row of rows) {
      const newRiders = Math.max(0, row.riders - previous);
      assert.equal(row.riderAcquisitionCents, newRiders * 200);
      previous = row.riders;
    }
  });

  it("is independent of driver acquisition — one growing doesn't change the other's cost", () => {
    const { rows } = run({
      driversStart: 0,
      driversEnd: 100,
      acquisitionPerDriverCents: 1_000,
      ridersStart: 0,
      ridersEnd: 0,
      acquisitionPerRiderCents: 1_000,
    });
    assert.ok(rows.every((r) => r.riderAcquisitionCents === 0));
    assert.ok(rows.some((r) => r.driverAcquisitionCents > 0));
  });
});

describe("the exposed cost lines sum to the total", () => {
  it("costCents always equals the sum of its components", () => {
    for (const row of run().rows) {
      assert.equal(
        row.costCents,
        row.insuranceCents +
          row.mapboxCents +
          row.processingCents +
          row.techCents +
          row.driverAcquisitionCents +
          row.riderAcquisitionCents +
          row.teamCents,
      );
    }
  });
});

describe("everything stays in integer cents", () => {
  it("no money figure is fractional", () => {
    const result = run();
    for (const row of result.rows) {
      for (const [key, value] of Object.entries(row)) {
        if (key.endsWith("Cents")) {
          assert.ok(Number.isInteger(value as number), `${key} = ${value} is not an integer`);
        }
      }
    }
    for (const key of ["cashToFundCents"] as const) {
      assert.ok(Number.isInteger(result[key]));
    }
    for (const [key, value] of Object.entries(result.steady)) {
      assert.ok(Number.isInteger(value as number), `steady.${key} = ${value} is not an integer`);
    }
  });

  it("cumulative cash is the running sum of monthly net", () => {
    let running = 0;
    for (const row of run().rows) {
      running += row.netCents;
      assert.equal(row.cumCents, running);
    }
  });

  it("reports the cash to fund as a positive amount", () => {
    const { rows, cashToFundCents, deepestMonth } = run();
    const deepest = Math.min(...rows.map((r) => r.cumCents));
    assert.equal(cashToFundCents, -Math.min(0, deepest));
    if (cashToFundCents > 0) assert.equal(rows[deepestMonth - 1].cumCents, deepest);
  });

  it("rejects a horizon that isn't a positive whole number of months", () => {
    assert.throws(() => run({ horizonMonths: 0 }));
    assert.throws(() => run({ horizonMonths: 6.5 }));
  });
});
