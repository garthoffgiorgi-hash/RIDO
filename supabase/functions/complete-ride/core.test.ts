/**
 * Tests for complete-ride's pure half.
 *
 * Runs identically under Node (`node --experimental-strip-types --test`) and Deno
 * (`deno test`), the same cross-runtime guarantee packages/pricing carries: the Edge Function
 * runs on Deno, and a rule that only holds on one runtime isn't a rule.
 *
 * Two things are under test, and only one of them is arithmetic:
 *
 *   authorizeCompletion — who may complete a ride. This enforces root CLAUDE.md invariant 6 on
 *                         the app side, and it is the ONLY ownership check in the path: every
 *                         write to `rides` goes through the service role, which bypasses RLS.
 *                         (ADR-0007 puts anything enforcing a compliance invariant in the
 *                         must-test tier.)
 *   rateCompletion      — that the pricing package is called with the right arguments and its
 *                         answer is passed through unaltered. The bracketing math itself is
 *                         packages/pricing's to prove, and is not re-tested here.
 *
 * Tier fixtures are SYNTHETIC — invented for these tests, deliberately not the seeded rates.
 * The seeded values are pinned in exactly one place (packages/pricing/src/commission.seed.test.ts)
 * so that a repricing breaks that file and nothing else; a copy here would make this file a
 * second thing to update, which is the drift that split was designed to prevent.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { CommissionTier } from "@rido/pricing";
import { authorizeCompletion, type Caller, rateCompletion, type RideRow } from "./core.ts";

/** Two synthetic bands: 25% up to $500/mo, then 10%. Nothing to do with RIDO's real rates. */
const TIERS: readonly CommissionTier[] = [
  { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: 50_000, rateBps: 2500 },
  { tierOrder: 2, lowerBoundCents: 50_000, upperBoundCents: null, rateBps: 1000 },
];

const DRIVER = "11111111-1111-1111-1111-111111111111";
const OTHER_DRIVER = "22222222-2222-2222-2222-222222222222";

const ride = (over: Partial<RideRow> = {}): RideRow => ({
  id: "99999999-9999-9999-9999-999999999999",
  driverId: DRIVER,
  status: "in_progress",
  fareCents: 10_000,
  ...over,
});

const activeDriver: Caller = { kind: "driver", driverId: DRIVER, driverStatus: "active" };
const serviceRole: Caller = { kind: "service_role" };

describe("authorizeCompletion", () => {
  it("lets an active driver complete their own accepted ride", () => {
    assert.deepEqual(authorizeCompletion(ride({ status: "accepted" }), activeDriver), {
      allowed: true,
    });
  });

  it("lets an active driver complete their own in-progress ride", () => {
    assert.deepEqual(authorizeCompletion(ride({ status: "in_progress" }), activeDriver), {
      allowed: true,
    });
  });

  it("refuses a driver who is not the driver on the ride", () => {
    const decision = authorizeCompletion(ride({ driverId: OTHER_DRIVER }), activeDriver);
    assert.equal(decision.allowed, false);
    assert.equal(decision.allowed === false && decision.refusal, "not_the_driver");
  });

  // The compliance gate. drivers_activation_gate already makes status='active' unreachable
  // without both checks passed, so requiring 'active' here inherits that rule rather than
  // restating its terms — which is why 'pending' and 'suspended' are refused identically.
  for (const driverStatus of ["pending", "suspended"]) {
    it(`refuses a '${driverStatus}' driver`, () => {
      const caller: Caller = { kind: "driver", driverId: DRIVER, driverStatus };
      const decision = authorizeCompletion(ride(), caller);
      assert.equal(decision.allowed, false);
      assert.equal(decision.allowed === false && decision.refusal, "driver_not_active");
    });
  }

  for (const status of ["requested", "completed", "canceled"]) {
    it(`refuses to complete a '${status}' ride`, () => {
      const decision = authorizeCompletion(ride({ status }), activeDriver);
      assert.equal(decision.allowed, false);
      assert.equal(decision.allowed === false && decision.refusal, "ride_not_completable");
    });
  }

  it("checks identity before ride state, so a non-owner learns nothing about the ride", () => {
    // Both things are wrong: not their ride, and not completable anyway. The refusal must be the
    // one that doesn't depend on data this caller isn't entitled to read.
    const decision = authorizeCompletion(
      ride({ driverId: OTHER_DRIVER, status: "canceled" }),
      activeDriver,
    );
    assert.equal(decision.allowed === false && decision.refusal, "not_the_driver");
  });

  it("lets the service role complete any driver's ride", () => {
    assert.deepEqual(authorizeCompletion(ride({ driverId: OTHER_DRIVER }), serviceRole), {
      allowed: true,
    });
  });

  it("still refuses the service role on a ride that is not completable", () => {
    const decision = authorizeCompletion(ride({ status: "canceled" }), serviceRole);
    assert.equal(decision.allowed, false);
    assert.equal(decision.allowed === false && decision.refusal, "ride_not_completable");
  });
});

describe("rateCompletion", () => {
  const rate = (fareCents: number, mtdGrossCents: number) =>
    rateCompletion({
      ride: ride({ fareCents }),
      mtdGrossCents,
      yearMonth: "2026-08",
      tiers: TIERS,
    });

  it("rates a ride inside the first band", () => {
    const result = rate(10_000, 0);
    assert.equal(result.commissionCents, 2_500);
    assert.equal(result.driverPayoutCents, 7_500);
    assert.equal(result.commissionRateBps, 2500);
  });

  it("rates a ride inside the second band", () => {
    const result = rate(10_000, 80_000);
    assert.equal(result.commissionCents, 1_000);
    assert.equal(result.driverPayoutCents, 9_000);
  });

  it("splits a ride that straddles the band boundary", () => {
    // $460 into the month, a $100 ride: $40 at 25% ($10) + $60 at 10% ($6) = $16.
    const result = rate(10_000, 46_000);
    assert.equal(result.commissionCents, 1_600);
    assert.equal(result.driverPayoutCents, 8_400);
    // Blended rate, not either band's rate — the number a driver would be shown.
    assert.equal(result.commissionRateBps, 1600);
  });

  it("carries the month-to-date position and bucket through untouched", () => {
    // These two are what the compare-and-swap re-checks under lock. If this function altered
    // either, the check would be against a figure nothing was rated with.
    const result = rate(10_000, 46_000);
    assert.equal(result.mtdGrossCents, 46_000);
    assert.equal(result.yearMonth, "2026-08");
    assert.equal(result.fareCents, 10_000);
    assert.equal(result.rideId, ride().id);
  });

  it("returns zeros for a zero fare rather than dividing by it", () => {
    const result = rate(0, 46_000);
    assert.equal(result.commissionCents, 0);
    assert.equal(result.driverPayoutCents, 0);
    assert.equal(result.commissionRateBps, 0);
  });

  it("commission and payout sum to the fare exactly", () => {
    // The invariant is asserted where it is computed and enforced where it is stored; this
    // checks the pass-through didn't lose a cent between them.
    for (const mtd of [0, 45_999, 46_000, 50_000, 123_456]) {
      for (const fare of [1, 99, 10_000, 33_333]) {
        const result = rate(fare, mtd);
        assert.equal(result.commissionCents + result.driverPayoutCents, fare);
      }
    }
  });

  it("rejects a negative fare rather than rating it", () => {
    assert.throws(() => rate(-1, 0));
  });

  it("rejects a non-integer fare rather than rounding it", () => {
    assert.throws(() => rate(10_000.5, 0));
  });
});
