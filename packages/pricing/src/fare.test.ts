/**
 * Properties of the fare quote that must hold for ANY rate card.
 *
 * Nothing in this file names a rate RIDO charges. The card below is synthetic — invented for the
 * test with round numbers chosen to make the arithmetic checkable by hand. The seeded San Diego
 * card is pinned in exactly one place (`fare.seed.test.ts`) and the discount it produces in one
 * more (`fare.calibration.test.ts`), so a repricing breaks those two files and nothing here.
 *
 * If a test in THIS file fails after a price change, the maths broke — not the pricing.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { type FareRateCard, NO_SURGE_BPS, quoteFare, validateRateCard } from "./fare.ts";

/** $2 base, $1/mile, $0.30/minute, $5 minimum. Deliberately round, deliberately not ours. */
const CARD: FareRateCard = {
  baseCents: 200,
  perMileCents: 100,
  perMinuteCents: 30,
  minimumFareCents: 500,
};

const MILE = 1609; // metres, rounded as a real routing engine would report it
const quote = (meters: number, seconds: number, surge?: number) =>
  quoteFare({
    distanceMeters: meters,
    durationSeconds: seconds,
    rateCard: CARD,
    surgeMultiplierBps: surge,
  });

describe("the metered components", () => {
  it("charges the per-mile rate over a mile", () => {
    // 1609 m is 0.99979 mi, so 100 cents/mi rounds to 100.
    assert.equal(quote(MILE, 0).breakdown.distanceCents, 100);
  });

  it("charges the per-minute rate over a minute", () => {
    assert.equal(quote(0, 60).breakdown.timeCents, 30);
  });

  it("scales both linearly", () => {
    assert.equal(quote(10 * MILE, 0).breakdown.distanceCents, 1_000);
    assert.equal(quote(0, 600).breakdown.timeCents, 300);
  });

  it("prices distance exactly, without a floating-point mile conversion", () => {
    // 4828 m = 3.00000x mi. A float path (metres / 1609.344) drifts here; integer division
    // scaled by 1000 does not.
    assert.equal(quote(4_828, 0).breakdown.distanceCents, 300);
  });

  it("rounds each component to whole cents before summing", () => {
    // 805 m = 0.50021 mi -> 50.02 cents -> 50. 30 s = 0.5 min -> 15 cents exactly.
    const q = quote(805, 30);
    assert.equal(q.breakdown.distanceCents, 50);
    assert.equal(q.breakdown.timeCents, 15);
    // base 200 + 50 + 15 = 265, above the 500 floor? No - so the floor applies.
    assert.equal(q.fareCents, CARD.minimumFareCents);
  });

  it("never produces a fractional value", () => {
    for (let meters = 0; meters < 50_000; meters += 337) {
      for (let seconds = 0; seconds < 3_600; seconds += 271) {
        const q = quote(meters, seconds);
        assert.ok(Number.isInteger(q.fareCents), `fare ${q.fareCents} not an integer`);
        assert.ok(Number.isInteger(q.breakdown.distanceCents));
        assert.ok(Number.isInteger(q.breakdown.timeCents));
        assert.ok(Number.isInteger(q.riderTotalCents));
      }
    }
  });
});

describe("the minimum fare", () => {
  it("applies to a trip that never happened", () => {
    const q = quote(0, 0);
    assert.equal(q.fareCents, CARD.minimumFareCents);
    assert.equal(q.breakdown.minimumApplied, true);
    // The base alone is below the floor, so a quote must return the floor, not the base.
    assert.notEqual(q.fareCents, CARD.baseCents);
  });

  it("stops applying once the metered fare passes it", () => {
    // base 200 + 5 miles at 100 = 700, comfortably over the 500 floor.
    const q = quote(5 * MILE, 0);
    assert.equal(q.breakdown.minimumApplied, false);
    assert.equal(q.fareCents, 200 + 500);
  });

  it("means no fare is ever below the floor, at any trip shape", () => {
    for (let meters = 0; meters < 20_000; meters += 421) {
      for (let seconds = 0; seconds < 1_800; seconds += 173) {
        assert.ok(quote(meters, seconds).fareCents >= CARD.minimumFareCents);
      }
    }
  });
});

describe("monotonicity", () => {
  it("a longer trip never costs less", () => {
    let previous = -1;
    for (let meters = 0; meters <= 40_000; meters += 500) {
      const fare = quote(meters, 600).fareCents;
      assert.ok(fare >= previous, `fare fell from ${previous} to ${fare} at ${meters} m`);
      previous = fare;
    }
  });

  it("a slower trip never costs less", () => {
    let previous = -1;
    for (let seconds = 0; seconds <= 3_600; seconds += 30) {
      const fare = quote(8_000, seconds).fareCents;
      assert.ok(fare >= previous, `fare fell from ${previous} to ${fare} at ${seconds} s`);
      previous = fare;
    }
  });
});

describe("surge", () => {
  it("defaults to no surge, and 1.00x is the same as omitting it", () => {
    const implicit = quote(8_000, 900);
    const explicit = quote(8_000, 900, NO_SURGE_BPS);
    assert.equal(implicit.fareCents, explicit.fareCents);
    assert.equal(implicit.breakdown.surgeMultiplierBps, NO_SURGE_BPS);
  });

  it("multiplies the fare", () => {
    const base = quote(8_000, 900).fareCents;
    assert.equal(quote(8_000, 900, 15_000).fareCents, Math.round(base * 1.5));
  });

  it("applies AFTER the minimum, so it isn't swallowed by the floor", () => {
    // A trip that would otherwise sit exactly on the floor.
    const floored = quote(0, 0);
    assert.equal(floored.fareCents, CARD.minimumFareCents);
    assert.equal(quote(0, 0, 20_000).fareCents, CARD.minimumFareCents * 2);
  });

  it("can discount as well as raise, since it is just a multiplier", () => {
    const base = quote(8_000, 900).fareCents;
    assert.ok(quote(8_000, 900, 5_000).fareCents < base);
  });
});

describe("the quote's shape", () => {
  it("carries a breakdown that reconstructs the metered fare", () => {
    const q = quote(12_000, 1_200);
    const { baseCents, distanceCents, timeCents } = q.breakdown;
    assert.equal(baseCents + distanceCents + timeCents, q.fareCents);
  });

  it("has no pass-through line items yet, and the rider total equals the fare", () => {
    // When CPUC or airport fees land, this test changes and everything downstream does not.
    const q = quote(12_000, 1_200);
    assert.deepEqual(q.lineItems, []);
    assert.equal(q.riderTotalCents, q.fareCents);
  });
});

describe("validation", () => {
  it("rejects a negative or fractional distance rather than pricing it", () => {
    assert.throws(() => quote(-1, 600));
    assert.throws(() => quote(1_000.5, 600));
  });

  it("rejects a negative or fractional duration", () => {
    assert.throws(() => quote(1_000, -1));
    assert.throws(() => quote(1_000, 60.5));
  });

  it("rejects a negative surge multiplier", () => {
    assert.throws(() => quote(1_000, 600, -1));
  });

  it("rejects a card with a negative component", () => {
    assert.throws(() => validateRateCard({ ...CARD, perMileCents: -1 }));
    assert.throws(() => validateRateCard({ ...CARD, baseCents: -1 }));
  });

  it("rejects a card whose minimum sits below its base, since it could never apply", () => {
    assert.throws(() => validateRateCard({ ...CARD, baseCents: 900, minimumFareCents: 500 }));
  });

  it("accepts a card at wildly different values — it validates shape, not price", () => {
    // The property that makes repricing free. Half these rates, and ten times them, both pass.
    assert.doesNotThrow(() =>
      validateRateCard({
        baseCents: 100,
        perMileCents: 50,
        perMinuteCents: 15,
        minimumFareCents: 250,
      }),
    );
    assert.doesNotThrow(() =>
      validateRateCard({
        baseCents: 2_000,
        perMileCents: 1_000,
        perMinuteCents: 300,
        minimumFareCents: 5_000,
      }),
    );
  });

  it("refuses a trip too long to price exactly rather than losing precision silently", () => {
    assert.throws(() => quote(Number.MAX_SAFE_INTEGER, 0));
  });

  it("prices a very long trip exactly", () => {
    // ~1,000 miles. Well inside the safe range, asserted rather than assumed.
    const q = quote(1_609_344, 0);
    assert.equal(q.breakdown.distanceCents, 100_000);
  });
});
