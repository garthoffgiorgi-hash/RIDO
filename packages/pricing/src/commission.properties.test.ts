/**
 * Rate-independent. These are the invariants that must hold for ANY valid tier set — every
 * fixture below is invented for the test and carries no business meaning.
 *
 * This is deliberately the bulk of the suite. Repricing (a row change in commission_tiers) must
 * never break these; only commission.seed.test.ts pins today's actual numbers. If you change the
 * rates and something in THIS file fails, the change broke the math, not just the pricing.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { commissionForRide } from "./commission.ts";
import { BPS_DENOMINATOR, applyBps, bps, cents } from "./money.ts";
import type { CommissionTier } from "./tiers.ts";

/** N internal boundaries produce N+1 bands, with descending arbitrary rates. */
function bandsOf(...boundaries: readonly number[]): CommissionTier[] {
  const bands: CommissionTier[] = [];
  let lower = 0;
  boundaries.forEach((boundary, i) => {
    bands.push({
      tierOrder: i + 1,
      lowerBoundCents: lower,
      upperBoundCents: boundary,
      rateBps: 2500 - i * 500,
    });
    lower = boundary;
  });
  bands.push({
    tierOrder: boundaries.length + 1,
    lowerBoundCents: lower,
    upperBoundCents: null,
    rateBps: 2500 - boundaries.length * 500,
  });
  return bands;
}

/** Tier sets of varying shape, to prove nothing assumes a band count. */
const SHAPES: ReadonlyArray<readonly [string, CommissionTier[]]> = [
  ["1 band", bandsOf()],
  ["2 bands", bandsOf(5_000)],
  ["3 bands", bandsOf(5_000, 20_000)],
  ["5 bands", bandsOf(1_000, 5_000, 20_000, 50_000)],
];

const FARES = [0, 1, 2, 7, 99, 100, 333, 1_000, 4_999, 5_000, 5_001, 25_000] as const;
const POSITIONS = [0, 1, 999, 4_999, 5_000, 5_001, 19_999, 20_000, 20_001, 90_000] as const;

test("commission and payout always sum to the fare, exactly", () => {
  for (const [label, tiers] of SHAPES) {
    for (const fare of FARES) {
      for (const mtd of POSITIONS) {
        const result = commissionForRide({
          fareCents: cents(fare),
          mtdGrossCents: cents(mtd),
          tiers,
        });
        assert.equal(
          result.commissionCents + result.driverPayoutCents,
          fare,
          `${label}: fare ${fare} at MTD ${mtd} did not reconcile`,
        );
      }
    }
  }
});

test("commission never exceeds the fare and is never negative", () => {
  for (const [label, tiers] of SHAPES) {
    for (const fare of FARES) {
      for (const mtd of POSITIONS) {
        const { commissionCents, driverPayoutCents, commissionRateBps } = commissionForRide({
          fareCents: cents(fare),
          mtdGrossCents: cents(mtd),
          tiers,
        });
        assert.ok(
          commissionCents >= 0 && commissionCents <= fare,
          `${label}: commission ${commissionCents} outside [0, ${fare}] at MTD ${mtd}`,
        );
        assert.ok(driverPayoutCents >= 0, `${label}: negative payout at fare ${fare}, MTD ${mtd}`);
        // The rides table enforces this range as a CHECK constraint.
        assert.ok(
          commissionRateBps >= 0 && commissionRateBps <= BPS_DENOMINATOR,
          `${label}: rate ${commissionRateBps} outside the column's CHECK range`,
        );
      }
    }
  }
});

test("a driver deeper into the month never pays a higher effective rate", () => {
  // Descending bands mean the marginal rate falls as volume rises. It must never rise.
  for (const [label, tiers] of SHAPES) {
    for (const fare of [1, 100, 5_000] as const) {
      let previousRate = Number.POSITIVE_INFINITY;
      for (const mtd of POSITIONS) {
        const { commissionRateBps } = commissionForRide({
          fareCents: cents(fare),
          mtdGrossCents: cents(mtd),
          tiers,
        });
        assert.ok(
          commissionRateBps <= previousRate,
          `${label}: rate rose to ${commissionRateBps} at MTD ${mtd} for fare ${fare}`,
        );
        previousRate = commissionRateBps;
      }
    }
  }
});

test("a larger fare never yields a smaller payout", () => {
  for (const [label, tiers] of SHAPES) {
    for (const mtd of POSITIONS) {
      let previousPayout = -1;
      for (const fare of FARES) {
        const { driverPayoutCents } = commissionForRide({
          fareCents: cents(fare),
          mtdGrossCents: cents(mtd),
          tiers,
        });
        assert.ok(
          driverPayoutCents >= previousPayout,
          `${label}: payout fell to ${driverPayoutCents} at fare ${fare}, MTD ${mtd}`,
        );
        previousPayout = driverPayoutCents;
      }
    }
  }
});

test("a single-band set is exactly applyBps — the degenerate case", () => {
  const flat = bandsOf();
  const rate = flat[0]?.rateBps ?? 0;
  for (const fare of FARES) {
    for (const mtd of POSITIONS) {
      const { commissionCents } = commissionForRide({
        fareCents: cents(fare),
        mtdGrossCents: cents(mtd),
        tiers: flat,
      });
      assert.equal(
        commissionCents,
        applyBps(cents(fare), bps(rate)),
        `flat set disagreed with applyBps at fare ${fare}`,
      );
    }
  }
});

test("a ride wholly inside one band is charged that band's rate", () => {
  const tiers = bandsOf(5_000, 20_000);
  const middle = tiers[1];
  assert.ok(middle !== undefined);
  // Sits entirely inside the middle band, touching neither edge.
  const result = commissionForRide({
    fareCents: cents(100),
    mtdGrossCents: cents(10_000),
    tiers,
  });
  assert.equal(result.commissionCents, applyBps(cents(100), bps(middle.rateBps)));
  assert.equal(result.commissionRateBps, middle.rateBps);
});

test("a boundary is crossed at the boundary, not rounded to a whole band", () => {
  const tiers = bandsOf(5_000);
  const lower = tiers[0];
  const upper = tiers[1];
  assert.ok(lower !== undefined && upper !== undefined);

  // Straddle the cut point evenly: half at each rate.
  const half = 100;
  const straddling = commissionForRide({
    fareCents: cents(half * 2),
    mtdGrossCents: cents(5_000 - half),
    tiers,
  });
  const expected =
    applyBps(cents(half), bps(lower.rateBps)) + applyBps(cents(half), bps(upper.rateBps));
  assert.equal(straddling.commissionCents, expected, "the ride was not split at the boundary");

  // Wholesale rating at either band's rate would give a different answer — prove it.
  assert.notEqual(straddling.commissionCents, applyBps(cents(half * 2), bps(lower.rateBps)));
  assert.notEqual(straddling.commissionCents, applyBps(cents(half * 2), bps(upper.rateBps)));
});

test("landing exactly on a boundary stays in the lower band", () => {
  const tiers = bandsOf(5_000);
  const lower = tiers[0];
  assert.ok(lower !== undefined);
  // Ends precisely at the cut point: every cent is still below it.
  const result = commissionForRide({
    fareCents: cents(1_000),
    mtdGrossCents: cents(4_000),
    tiers,
  });
  assert.equal(result.commissionCents, applyBps(cents(1_000), bps(lower.rateBps)));
});

test("starting exactly on a boundary is entirely in the upper band", () => {
  const tiers = bandsOf(5_000);
  const upper = tiers[1];
  assert.ok(upper !== undefined);
  const result = commissionForRide({
    fareCents: cents(1_000),
    mtdGrossCents: cents(5_000),
    tiers,
  });
  assert.equal(result.commissionCents, applyBps(cents(1_000), bps(upper.rateBps)));
});

test("splitting a ride in two lands within a cent of taking it whole", () => {
  // Per-ride rounding means this is 'within a cent', not 'identical' — see the note in
  // commission.ts. Pinned here so the tolerance is a stated fact rather than a surprise.
  for (const [label, tiers] of SHAPES) {
    for (const mtd of POSITIONS) {
      for (const fare of [2, 99, 1_000, 5_001] as const) {
        const firstHalf = Math.floor(fare / 2);
        const secondHalf = fare - firstHalf;

        const whole = commissionForRide({
          fareCents: cents(fare),
          mtdGrossCents: cents(mtd),
          tiers,
        }).commissionCents;

        const a = commissionForRide({
          fareCents: cents(firstHalf),
          mtdGrossCents: cents(mtd),
          tiers,
        }).commissionCents;
        const b = commissionForRide({
          fareCents: cents(secondHalf),
          mtdGrossCents: cents(mtd + firstHalf),
          tiers,
        }).commissionCents;

        assert.ok(
          Math.abs(whole - (a + b)) <= 1,
          `${label}: splitting fare ${fare} at MTD ${mtd} drifted by more than a cent`,
        );
      }
    }
  }
});

test("a zero fare is defined, not a division by zero", () => {
  const result = commissionForRide({
    fareCents: cents(0),
    mtdGrossCents: cents(12_345),
    tiers: bandsOf(5_000, 20_000),
  });
  assert.deepEqual(
    { ...result },
    { commissionCents: 0, driverPayoutCents: 0, commissionRateBps: 0 },
  );
});

test("rejects negative or fractional inputs rather than guessing", () => {
  const tiers = bandsOf(5_000);
  assert.throws(
    () => commissionForRide({ fareCents: cents(-1), mtdGrossCents: cents(0), tiers }),
    /fareCents must be a non-negative integer/,
  );
  assert.throws(
    () => commissionForRide({ fareCents: cents(1), mtdGrossCents: cents(-1), tiers }),
    /mtdGrossCents must be a non-negative integer/,
  );
});

test("a malformed tier set fails loudly even for a zero fare", () => {
  assert.throws(
    () => commissionForRide({ fareCents: cents(0), mtdGrossCents: cents(0), tiers: [] }),
    /set is empty/,
    "a bad tier table must surface on the first ride, not the first band crossing",
  );
});
