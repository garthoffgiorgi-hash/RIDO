/**
 * Properties of the authorization hold that must hold for ANY buffer.
 *
 * Nothing in this file names the buffer RIDO actually configures. The values below are synthetic —
 * round numbers chosen so the arithmetic is checkable by hand — and the real one lives in exactly
 * one place, `supabase/seed/fare_rate_cards.sql`, the same way the four fare values do.
 *
 * If a test here fails after the buffer is retuned, the maths broke — not the configuration.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { holdAmountCents } from "./authorization.ts";
import { type Bps, BPS_DENOMINATOR, type Cents } from "./money.ts";

const hold = (riderTotalCents: number, bufferBps: number) =>
  holdAmountCents({
    riderTotalCents: riderTotalCents as Cents,
    bufferBps: bufferBps as Bps,
  });

describe("holdAmountCents", () => {
  it("holds exactly the rider total when no buffer is configured", () => {
    // The property that makes `default 0` safe on the column: an unconfigured market holds the
    // quote, not nothing and not something arbitrary.
    assert.equal(hold(1240, 0), 1240);
    assert.equal(hold(1, 0), 1);
    assert.equal(hold(0, 0), 0);
  });

  it("adds the buffer as a proportion of the rider total", () => {
    assert.equal(hold(1000, 1000), 1100); // +10%
    assert.equal(hold(1000, 2500), 1250); // +25%
    assert.equal(hold(2000, 5000), 3000); // +50%
    assert.equal(hold(1000, BPS_DENOMINATOR), 2000); // +100%, i.e. 2.00x
  });

  it("never returns less than the rider total, for any buffer", () => {
    // The invariant the whole function exists to guarantee. A hold below what the rider owes
    // could not be captured in full, which would silently under-charge a completed ride.
    for (const total of [0, 1, 7, 99, 680, 1240, 9999, 250_000]) {
      for (const buffer of [0, 1, 250, 1000, 1500, 3333, BPS_DENOMINATOR]) {
        assert.ok(
          hold(total, buffer) >= total,
          `hold(${total}, ${buffer}) = ${hold(total, buffer)} is below the rider total`,
        );
      }
    }
  });

  it("is monotonic in the buffer", () => {
    // A larger buffer can never produce a smaller hold. Cheap to state, and it is what would
    // catch a sign error or an inverted multiplier.
    let previous = -1;
    for (const buffer of [0, 100, 500, 1000, 1500, 2000, 5000, BPS_DENOMINATOR]) {
      const current = hold(1240, buffer);
      assert.ok(current >= previous, `hold fell from ${previous} to ${current} at ${buffer} bps`);
      previous = current;
    }
  });

  it("returns whole cents, always", () => {
    // A buffer that lands mid-cent is the common case, not the exotic one: 15% of $12.40 is
    // $1.86 exactly, but 15% of $12.41 is not. Rounding happens once, inside applyMultiplierBps,
    // with the same half-up rule commission uses — so a hold and a fare can never disagree about
    // what a cent is.
    for (let total = 0; total <= 300; total++) {
      const result = hold(total, 1500);
      assert.ok(Number.isInteger(result), `hold(${total}, 1500) = ${result} is not an integer`);
    }
  });

  it("rounds half-up, the same way every other amount in this package does", () => {
    // 333 x 1.005 = 334.665 -> 335. Naive truncation would give 334 and quietly hold a cent less
    // than intended on a large fraction of rides.
    assert.equal(hold(333, 50), 335);
    // 100 x 1.005 = 100.5, exactly on the boundary -> 101, not 100.
    assert.equal(hold(100, 50), 101);
  });

  it("refuses inputs that are not non-negative integers", () => {
    // Fractional cents are the failure this package exists to make impossible, so they throw
    // rather than rounding silently into an accounting record.
    assert.throws(() => hold(12.4, 1500), /non-negative integer/);
    assert.throws(() => hold(-100, 1500), /non-negative integer/);
    assert.throws(() => hold(1240, -1), /non-negative integer/);
    assert.throws(() => hold(1240, 15.5), /non-negative integer/);
  });
});
