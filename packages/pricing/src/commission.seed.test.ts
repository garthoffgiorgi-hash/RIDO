/**
 * ⚠️ THE ONLY FILE IN THIS PACKAGE THAT KNOWS TODAY'S PRICING.
 *
 * Everything else tests properties that hold for any valid tier set. This file pins the actual
 * numbers currently in supabase/seed/commission_tiers.sql and the worked examples published in
 * the docs.
 *
 * **If you change the rates, this file is SUPPOSED to fail.** That is the point — it is the
 * tripwire that stops a repricing from silently contradicting the marketing copy. When it fails
 * after a deliberate change: update SEED_TIERS below to match the seed, recompute the worked
 * examples, and follow docs/business/changing-rates.md for the docs that also quote them.
 *
 * If it fails when you did NOT change the rates, the math is broken. Look at the implementation,
 * not at this file.
 *
 * (Tier literals are legal here only because scripts/check-context.mjs exempts
 * `packages/pricing/**\/*.test.ts`. They must never appear in an implementation file.)
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { commissionForRide } from "./commission.ts";
import { cents } from "./money.ts";
import { type CommissionTier, normalizeTiers } from "./tiers.ts";

/** Mirrors supabase/seed/commission_tiers.sql exactly. Bounds in cents, rates in basis points. */
const SEED_TIERS: readonly CommissionTier[] = [
  { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: 100_000, rateBps: 2_000 },
  { tierOrder: 2, lowerBoundCents: 100_000, upperBoundCents: 300_000, rateBps: 1_200 },
  { tierOrder: 3, lowerBoundCents: 300_000, upperBoundCents: null, rateBps: 800 },
];

/** Convenience: dollars to cents, so the cases below read like the docs they mirror. */
const dollars = (amount: number) => cents(Math.round(amount * 100));

const forRide = (fare: number, mtd: number) =>
  commissionForRide({
    fareCents: dollars(fare),
    mtdGrossCents: dollars(mtd),
    tiers: SEED_TIERS,
  });

test("the seed fixture is structurally valid", () => {
  assert.doesNotThrow(() => normalizeTiers(SEED_TIERS));
});

test("the seed's rates descend — driving more must lower your rate", () => {
  const rates = SEED_TIERS.map((t) => t.rateBps);
  for (let i = 1; i < rates.length; i += 1) {
    const previous = rates[i - 1];
    const current = rates[i];
    assert.ok(previous !== undefined && current !== undefined);
    assert.ok(current < previous, `rate ${current} is not below the band before it (${previous})`);
  }
});

test("ADR-0002's headline example: $1,001 in a month costs $200.12", () => {
  // From docs/decisions/0002-bracketed-per-ride-commission.md, verbatim:
  // "at $1,001 the commission is $200.00 + $0.12 = $200.12, and there is no line to stand on."
  const { commissionCents } = forRide(1_001, 0);
  assert.equal(commissionCents, dollars(200.12));
});

test("the seed file's worked example: $3,600 in a month", () => {
  // From supabase/seed/commission_tiers.sql's own comment:
  //   $1,000 x 20% = $200.00 / $2,000 x 12% = $240.00 / $600 x 8% = $48.00
  //   commission $488.00 (13.56% blended), driver keeps $3,112.00
  const { commissionCents, driverPayoutCents, commissionRateBps } = forRide(3_600, 0);

  assert.equal(commissionCents, dollars(488), "commission");
  assert.equal(driverPayoutCents, dollars(3_112), "driver keeps");
  // 13.56% — the figure docs/business/monetization.md publishes as ~86% kept.
  assert.equal(commissionRateBps, 1_356, "blended rate in basis points");
});

test("the published driver-keeps figure really is ~86%", () => {
  // monetization.md: "Use ~86% (86.4% precisely), commission-only". Recomputed here rather than
  // restated, so the doc and the code cannot quietly diverge.
  const { driverPayoutCents } = forRide(3_600, 0);
  const keptPct = (driverPayoutCents / dollars(3_600)) * 100;
  assert.ok(
    Math.abs(keptPct - 86.4) < 0.05,
    `driver keeps ${keptPct.toFixed(2)}%, docs publish 86.4%`,
  );
});

test("a ride crossing one boundary is split at the line", () => {
  // 50c at 20% + 50c at 12% = 10c + 6c = 16c.
  const { commissionCents } = forRide(1, 999.5);
  assert.equal(commissionCents, 16);
});

test("a ride crossing both boundaries is split at both", () => {
  // $1,000 x 20% + $2,000 x 12% + $1,000 x 8% = $200 + $240 + $80 = $520.
  const { commissionCents, driverPayoutCents } = forRide(4_000, 0);
  assert.equal(commissionCents, dollars(520));
  assert.equal(driverPayoutCents, dollars(3_480));
});

test("the marginal rate at every boundary the roadmap names", () => {
  // A $1.00 fare at each edge, so the band in effect is legible in the answer.
  // Boundaries: $0, $999.99, $1,000.00, $1,000.01, $2,999.99, $3,000.00, $3,000.01.
  const cases: ReadonlyArray<readonly [number, number, string]> = [
    [0, 20, "first dollar of the month — top band"],
    [999.99, 12, "1c left at 20%, the rest at 12% (12.08c, rounds to 12)"],
    [1_000.0, 12, "exactly on the first line — entirely in the middle band"],
    [1_000.01, 12, "just past the first line"],
    [2_999.99, 8, "1c left at 12%, the rest at 8% (8.04c, rounds to 8)"],
    [3_000.0, 8, "exactly on the second line — entirely in the top band"],
    [3_000.01, 8, "just past the second line"],
  ];

  for (const [mtd, expectedCents, why] of cases) {
    const { commissionCents } = forRide(1, mtd);
    assert.equal(commissionCents, expectedCents, `MTD $${mtd}: ${why}`);
  }
});

test("a sub-cent commission rounds down — the driver keeps the whole fare", () => {
  // 1c at 20% + 1c at 12% is exactly 0.32c. Half-up rounding takes nothing at all.
  // Pinned so nobody later "fixes" this into rounding up.
  const { commissionCents, driverPayoutCents, commissionRateBps } = forRide(0.02, 999.99);
  assert.equal(commissionCents, 0);
  assert.equal(driverPayoutCents, 2);
  assert.equal(commissionRateBps, 0);
});

test("a month of rides costs the same as one ride for the month's total", () => {
  // The claim ADR-0002 rests on, checked against the seed: bracketing ride-by-ride against a
  // running MTD equals bracketing the whole month in one pass. Exact in unrounded arithmetic;
  // here, within a cent per ride crossing a boundary. See the note in commission.ts.
  const rideFares = [12.5, 40, 137.25, 500, 910.25, 2_000] as const;
  const monthTotal = rideFares.reduce((sum, fare) => sum + fare, 0);

  let mtd = 0;
  let accumulated = 0;
  for (const fare of rideFares) {
    accumulated += forRide(fare, mtd).commissionCents;
    mtd += fare;
  }

  const inOnePass = forRide(monthTotal, 0).commissionCents;
  assert.ok(
    Math.abs(accumulated - inOnePass) <= rideFares.length,
    `ride-by-ride ${accumulated} vs one pass ${inOnePass} — drifted more than a cent per ride`,
  );
});
