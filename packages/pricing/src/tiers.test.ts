/**
 * Rate-independent. Every fixture here is invented for the test — the numbers are arbitrary and
 * carry no business meaning, so repricing never touches this file.
 *
 * The point of several of these is to prove the code has no opinion about how many bands exist
 * or what they charge: adding, removing or repricing a band is a row change in commission_tiers,
 * not a code change. See docs/business/changing-rates.md.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { BPS_DENOMINATOR } from "./money.ts";
import { type CommissionTier, normalizeTiers } from "./tiers.ts";

/**
 * A well-formed set built from its internal cut points: N boundaries produce N+1 bands, with
 * descending arbitrary rates. `bandsOf()` is one unbounded band; `bandsOf(7, 19)` is three.
 */
function bandsOf(...boundaries: readonly number[]): CommissionTier[] {
  const bands: CommissionTier[] = [];
  let lower = 0;
  boundaries.forEach((boundary, i) => {
    bands.push({
      tierOrder: i + 1,
      lowerBoundCents: lower,
      upperBoundCents: boundary,
      rateBps: 900 - i * 100,
    });
    lower = boundary;
  });
  bands.push({
    tierOrder: boundaries.length + 1,
    lowerBoundCents: lower,
    upperBoundCents: null,
    rateBps: 900 - boundaries.length * 100,
  });
  return bands;
}

test("accepts a single unbounded band", () => {
  const normalized = normalizeTiers(bandsOf());
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.upperBoundCents, null);
});

test("accepts two, three and five band sets alike", () => {
  for (const boundaries of [[7], [7, 19], [3, 7, 19, 44]]) {
    const normalized = normalizeTiers(bandsOf(...boundaries));
    assert.equal(
      normalized.length,
      boundaries.length + 1,
      `${boundaries.length + 1}-band set should normalize`,
    );
  }
});

test("sorts by lower bound regardless of input order or tierOrder", () => {
  const scrambled: CommissionTier[] = [
    { tierOrder: 3, lowerBoundCents: 19, upperBoundCents: null, rateBps: 700 },
    { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: 7, rateBps: 900 },
    { tierOrder: 2, lowerBoundCents: 7, upperBoundCents: 19, rateBps: 800 },
  ];
  const normalized = normalizeTiers(scrambled);
  assert.deepEqual(
    normalized.map((t) => t.lowerBoundCents),
    [0, 7, 19],
  );
});

test("rejects an empty set", () => {
  assert.throws(() => normalizeTiers([]), /set is empty/);
});

test("rejects a set that does not start at zero", () => {
  const notFromZero: CommissionTier[] = [
    { tierOrder: 1, lowerBoundCents: 1, upperBoundCents: null, rateBps: 900 },
  ];
  assert.throws(() => normalizeTiers(notFromZero), /must start at 0/);
});

test("rejects a gap between bands", () => {
  const gapped: CommissionTier[] = [
    { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: 7, rateBps: 900 },
    { tierOrder: 2, lowerBoundCents: 8, upperBoundCents: null, rateBps: 800 },
  ];
  assert.throws(() => normalizeTiers(gapped), /gap between/);
});

test("rejects overlapping bands", () => {
  const overlapping: CommissionTier[] = [
    { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: 9, rateBps: 900 },
    { tierOrder: 2, lowerBoundCents: 7, upperBoundCents: null, rateBps: 800 },
  ];
  assert.throws(() => normalizeTiers(overlapping), /overlap between/);
});

test("rejects a set with no unbounded band", () => {
  const capped: CommissionTier[] = [
    { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: 7, rateBps: 900 },
  ];
  assert.throws(() => normalizeTiers(capped), /must be unbounded/);
});

test("rejects an unbounded band that is not the top one", () => {
  const twoUnbounded: CommissionTier[] = [
    { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: null, rateBps: 900 },
    { tierOrder: 2, lowerBoundCents: 7, upperBoundCents: null, rateBps: 800 },
  ];
  assert.throws(() => normalizeTiers(twoUnbounded), /only the top band may be unbounded/);
});

test("rejects a rate outside the representable range", () => {
  const tooHigh: CommissionTier[] = [
    { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: null, rateBps: BPS_DENOMINATOR + 1 },
  ];
  assert.throws(() => normalizeTiers(tooHigh), /rateBps must be an integer in/);

  const negative: CommissionTier[] = [
    { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: null, rateBps: -1 },
  ];
  assert.throws(() => normalizeTiers(negative), /rateBps must be an integer in/);
});

test("accepts the boundary rates: nothing and everything", () => {
  for (const rateBps of [0, BPS_DENOMINATOR]) {
    const band: CommissionTier[] = [
      { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: null, rateBps },
    ];
    assert.doesNotThrow(() => normalizeTiers(band), `rateBps ${rateBps} should be legal`);
  }
});

test("rejects malformed bounds", () => {
  const inverted: CommissionTier[] = [
    { tierOrder: 1, lowerBoundCents: 7, upperBoundCents: 3, rateBps: 900 },
  ];
  assert.throws(() => normalizeTiers(inverted), /upperBoundCents must exceed lowerBoundCents/);

  const fractional: CommissionTier[] = [
    { tierOrder: 1, lowerBoundCents: 0.5, upperBoundCents: null, rateBps: 900 },
  ];
  assert.throws(() => normalizeTiers(fractional), /lowerBoundCents must be a non-negative integer/);

  const zeroWidth: CommissionTier[] = [
    { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: 0, rateBps: 900 },
    { tierOrder: 2, lowerBoundCents: 0, upperBoundCents: null, rateBps: 800 },
  ];
  assert.throws(() => normalizeTiers(zeroWidth), /upperBoundCents must exceed lowerBoundCents/);
});

test("does not mutate the caller's array", () => {
  const original = [...bandsOf(7, 19)].reverse();
  const snapshot = original.map((t) => t.tierOrder);
  normalizeTiers(original);
  assert.deepEqual(
    original.map((t) => t.tierOrder),
    snapshot,
    "normalizeTiers sorted the caller's array in place",
  );
});
