/**
 * Rate-independent. Deliberately never asserts a specific fee amount — the amount lives on the
 * subscriptions row, and changing it must not break these.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { cents } from "./money.ts";
import { type SubscriptionState, monthlyFlatFee } from "./subscription.ts";

/** An arbitrary non-zero amount. Its value is irrelevant — only that it round-trips. */
const SOME_AMOUNT = cents(1_234);

test("an inactive fee bills nothing, whatever the row says the amount is", () => {
  const state: SubscriptionState = {
    plan: "standard",
    feeActive: false,
    flatFeeCents: SOME_AMOUNT,
  };
  assert.equal(monthlyFlatFee(state), 0);
});

test("an active fee bills exactly what the row says", () => {
  const state: SubscriptionState = {
    plan: "standard",
    feeActive: true,
    flatFeeCents: SOME_AMOUNT,
  };
  assert.equal(monthlyFlatFee(state), SOME_AMOUNT);
});

test("a pilot driver is never billed", () => {
  const state: SubscriptionState = {
    plan: "pilot",
    feeActive: false,
    flatFeeCents: cents(0),
  };
  assert.equal(monthlyFlatFee(state), 0);
});

test("a pilot row with the fee switched on is refused, not charged", () => {
  // The contradiction is data corruption. Billing a pilot driver is precisely what the root
  // CLAUDE.md guardrail forbids, so this fails loudly rather than degrading either direction.
  const contradictory: SubscriptionState = {
    plan: "pilot",
    feeActive: true,
    flatFeeCents: SOME_AMOUNT,
  };
  assert.throws(() => monthlyFlatFee(contradictory), /Contradictory subscription state/);
});

test("a pilot row with the fee on is refused even when the amount is zero", () => {
  // Zero would be harmless to charge, but the row is still wrong and should be fixed.
  const contradictory: SubscriptionState = {
    plan: "pilot",
    feeActive: true,
    flatFeeCents: cents(0),
  };
  assert.throws(() => monthlyFlatFee(contradictory), /Contradictory subscription state/);
});

test("an active fee of zero is legal", () => {
  const state: SubscriptionState = {
    plan: "standard",
    feeActive: true,
    flatFeeCents: cents(0),
  };
  assert.equal(monthlyFlatFee(state), 0);
});

test("rejects a malformed amount", () => {
  const negative: SubscriptionState = {
    plan: "standard",
    feeActive: true,
    flatFeeCents: cents(-1),
  };
  assert.throws(() => monthlyFlatFee(negative), /non-negative integer/);
});

test("the result never depends on the current date", () => {
  // Guards ADR-0003's hard rule: the pilot/steady distinction is state, never a calendar
  // comparison. Same input, same answer, regardless of when it is asked.
  const state: SubscriptionState = {
    plan: "standard",
    feeActive: true,
    flatFeeCents: SOME_AMOUNT,
  };
  const first = monthlyFlatFee(state);
  const later = monthlyFlatFee(state);
  assert.equal(first, later);
  assert.equal(first, SOME_AMOUNT);
});
