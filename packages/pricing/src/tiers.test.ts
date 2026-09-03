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
import { commissionForRide } from "./commission.ts";
import { BPS_DENOMINATOR, cents } from "./money.ts";
import { type CommissionTier, normalizeTiers, tierPositionFor } from "./tiers.ts";

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

test("tierPositionFor: MTD zero starts in the first band", () => {
  const position = tierPositionFor(cents(0), bandsOf(7, 19));
  assert.equal(position.kind, "climbing");
  if (position.kind === "climbing") {
    assert.equal(position.currentTier.tierOrder, 1);
    assert.equal(position.centsIntoCurrentBand, 0);
    assert.equal(position.currentBandWidthCents, 7);
    assert.equal(position.centsToNextTier, 7);
  }
});

test("tierPositionFor: a position exactly on a boundary belongs to the band above it", () => {
  // Half-open [lower, upper): 7 is the first band's exclusive upper bound and the second band's
  // inclusive lower bound. This is the case commissionForRide's own walk depends on — the next
  // cent of fare at this position is charged the SECOND band's rate, so the position must read
  // as "in" that band, not "just finished" the first one.
  const position = tierPositionFor(cents(7), bandsOf(7, 19));
  assert.equal(position.kind, "climbing");
  if (position.kind === "climbing") {
    assert.equal(position.currentTier.tierOrder, 2);
    assert.equal(position.centsIntoCurrentBand, 0);
  }
});

test("tierPositionFor: one cent below a boundary is still the lower band", () => {
  const position = tierPositionFor(cents(6), bandsOf(7, 19));
  assert.equal(position.kind, "climbing");
  if (position.kind === "climbing") {
    assert.equal(position.currentTier.tierOrder, 1);
    assert.equal(position.centsToNextTier, 1);
  }
});

test("tierPositionFor: deep inside the unbounded top band reports kind 'top'", () => {
  const position = tierPositionFor(cents(1_000_000), bandsOf(7, 19));
  assert.equal(position.kind, "top");
  if (position.kind === "top") {
    assert.equal(position.currentTier.tierOrder, 3);
    assert.equal(position.centsIntoCurrentBand, 1_000_000 - 19);
  }
});

test("tierPositionFor: a single-band (all-unbounded) tier set is always 'top'", () => {
  for (const mtd of [0, 1, 500_000]) {
    const position = tierPositionFor(cents(mtd), bandsOf());
    assert.equal(position.kind, "top", `MTD ${mtd} should read as top for a single-band set`);
  }
});

test("tierPositionFor: centsIntoCurrentBand + centsToNextTier === currentBandWidthCents", () => {
  const tiers = bandsOf(3, 7, 19, 44);
  for (let mtd = 0; mtd < 44; mtd += 1) {
    const position = tierPositionFor(cents(mtd), tiers);
    if (position.kind !== "climbing") continue;
    assert.equal(
      position.centsIntoCurrentBand + position.centsToNextTier,
      position.currentBandWidthCents,
      `mismatch at mtd=${mtd}`,
    );
  }
});

test("tierPositionFor rejects the same malformed tier sets normalizeTiers does", () => {
  assert.throws(() => tierPositionFor(cents(0), []), /set is empty/);
});

test("tierPositionFor rejects a negative or non-integer position", () => {
  assert.throws(() => tierPositionFor(-1 as never, bandsOf(7)), /non-negative integer/);
  assert.throws(() => tierPositionFor(0.5 as never, bandsOf(7)), /non-negative integer/);
});

test("tierPositionFor agrees with commissionForRide about which band a ride bills against", () => {
  // The property that actually matters: the band tierPositionFor reports as "current" must be the
  // band commissionForRide actually charges from at that exact MTD position. If these two ever
  // disagree, the progress card would show a driver one tier while their ride bills another.
  //
  // The probe fare is deliberately a MULTIPLE OF BPS_DENOMINATOR (10_000): that is what makes the
  // comparison exact rather than approximate. A ride's blended commissionRateBps is itself a
  // rounded figure (roundHalfUpDiv applied twice — once to get commissionCents, once to re-express
  // it as a rate), so an arbitrary probe size only approximates the band's own rate. When fareCents
  // is a multiple of BPS_DENOMINATOR and the ride stays fully within one band, both roundings land
  // on an exact multiple with zero remainder, so the recovered rate equals the band's rate bit for
  // bit — no tolerance needed, matching how every other test in this package asserts exactness.
  //
  // Wide, arbitrary bands (not the seeded 100000/300000) so a $100 probe fits inside each one.
  const tiers = bandsOf(53_000, 141_000);
  const probeFareCents = 10_000;
  // Each position is comfortably inside its band — probeFareCents doesn't cross the next boundary
  // — except the last two, deliberately inside the unbounded top band where crossing is moot.
  const positions = [0, 20_000, 53_000, 60_000, 141_000, 200_000];

  for (const mtd of positions) {
    const position = tierPositionFor(cents(mtd), tiers);
    const probe = commissionForRide({
      fareCents: cents(probeFareCents),
      mtdGrossCents: cents(mtd),
      tiers,
    });
    assert.equal(
      probe.commissionRateBps,
      position.currentTier.rateBps,
      `mtd=${mtd}: tierPositionFor says tier ${position.currentTier.tierOrder} (${position.currentTier.rateBps}bps), commissionForRide's $100 probe charged ${probe.commissionRateBps}bps`,
    );
  }
});
