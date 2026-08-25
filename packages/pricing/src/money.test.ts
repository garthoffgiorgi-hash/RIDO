/**
 * Rate-independent. Nothing here mentions a commission rate or a tier boundary, so repricing
 * never touches this file.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { BPS_DENOMINATOR, applyBps, bps, cents, roundHalfUpDiv } from "./money.ts";

test("cents rejects non-integers", () => {
  assert.throws(() => cents(1.5), /must be an integer/);
  assert.throws(() => cents(Number.NaN), /must be an integer/);
  assert.doesNotThrow(() => cents(0));
  assert.doesNotThrow(() => cents(-1), "negative cents are representable; callers police sign");
});

test("bps rejects non-integers", () => {
  assert.throws(() => bps(0.5), /must be an integer/);
  assert.doesNotThrow(() => bps(0));
});

test("roundHalfUpDiv rounds a tie upward, not to even and not toward zero", () => {
  // 5/10 is exactly 0.5 — the case Math.round and banker's rounding disagree on.
  assert.equal(roundHalfUpDiv(5, 10), 1);
  assert.equal(roundHalfUpDiv(15, 10), 2);
  assert.equal(roundHalfUpDiv(25, 10), 3, "half-up, not half-to-even");
});

test("roundHalfUpDiv rounds either side of a tie correctly", () => {
  assert.equal(roundHalfUpDiv(4, 10), 0);
  assert.equal(roundHalfUpDiv(6, 10), 1);
  assert.equal(roundHalfUpDiv(0, 10), 0);
  assert.equal(roundHalfUpDiv(10, 10), 1);
});

test("roundHalfUpDiv stays exact at magnitudes where float division drifts", () => {
  // A quotient this large is where `Math.floor(n / d)` can land on the wrong side of an integer.
  const denominator = BPS_DENOMINATOR;
  const exact = 987_654_321;
  assert.equal(roundHalfUpDiv(exact * denominator, denominator), exact);
  assert.equal(roundHalfUpDiv(exact * denominator + denominator / 2, denominator), exact + 1);
  assert.equal(roundHalfUpDiv(exact * denominator + denominator / 2 - 1, denominator), exact);
});

test("roundHalfUpDiv refuses inputs it cannot compute exactly", () => {
  assert.throws(() => roundHalfUpDiv(-1, 10), /non-negative safe integer/);
  assert.throws(() => roundHalfUpDiv(1.5, 10), /non-negative safe integer/);
  assert.throws(() => roundHalfUpDiv(Number.MAX_SAFE_INTEGER + 2, 10), /non-negative safe integer/);
  assert.throws(() => roundHalfUpDiv(10, 0), /positive safe integer/);
  assert.throws(() => roundHalfUpDiv(10, -5), /positive safe integer/);
});

test("applyBps at the extremes of the rate range", () => {
  const amount = cents(12_345);
  assert.equal(applyBps(amount, bps(0)), 0, "a zero rate takes nothing");
  assert.equal(applyBps(amount, bps(BPS_DENOMINATOR)), 12_345, "a full rate takes everything");
});

test("applyBps rounds half-up to the cent", () => {
  // 1 cent at half the full rate is exactly 0.5 cents.
  assert.equal(applyBps(cents(1), bps(BPS_DENOMINATOR / 2)), 1);
  // 1 cent at just under half rounds down to nothing.
  assert.equal(applyBps(cents(1), bps(BPS_DENOMINATOR / 2 - 1)), 0);
});

test("applyBps validates its inputs", () => {
  assert.throws(() => applyBps(cents(-1), bps(1)), /non-negative integer/);
  assert.throws(() => applyBps(cents(1), bps(-1)), /in \[0, /);
  assert.throws(() => applyBps(cents(1), bps(BPS_DENOMINATOR + 1)), /in \[0, /);
});

test("applyBps refuses an amount too large to compute exactly", () => {
  assert.throws(() => applyBps(cents(Number.MAX_SAFE_INTEGER), bps(BPS_DENOMINATOR)), /overflows/);
});

test("applyBps never returns more than the amount", () => {
  for (let amount = 0; amount < 500; amount += 7) {
    for (let rate = 0; rate <= BPS_DENOMINATOR; rate += 137) {
      const taken = applyBps(cents(amount), bps(rate));
      assert.ok(taken >= 0 && taken <= amount, `${taken} outside [0, ${amount}]`);
    }
  }
});
