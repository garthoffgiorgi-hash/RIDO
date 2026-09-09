import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { type ChargeIntentFacts, chargeUpdateFromEvent } from "./webhook-event.ts";

/** A captured intent's shape: Stripe reports the amount and no error. */
const captured: ChargeIntentFacts = { amountReceived: 2450, failureMessage: null };
/** A declined intent's shape: nothing received, and a reason worth recording. */
const declined: ChargeIntentFacts = {
  amountReceived: 0,
  failureMessage: "Your card was declined.",
};

describe("chargeUpdateFromEvent — the four events this ledger tracks", () => {
  it("maps amount_capturable_updated to authorized", () => {
    const update = chargeUpdateFromEvent("payment_intent.amount_capturable_updated", captured);
    assert.equal(update?.status, "authorized");
  });

  it("maps succeeded to captured", () => {
    const update = chargeUpdateFromEvent("payment_intent.succeeded", captured);
    assert.equal(update?.status, "captured");
  });

  it("maps canceled to voided", () => {
    const update = chargeUpdateFromEvent("payment_intent.canceled", captured);
    assert.equal(update?.status, "voided");
  });

  it("maps payment_failed to failed", () => {
    const update = chargeUpdateFromEvent("payment_intent.payment_failed", declined);
    assert.equal(update?.status, "failed");
  });
});

describe("chargeUpdateFromEvent — capturedCents", () => {
  // The property worth protecting: a row claiming money moved when it didn't is worse than a row
  // missing an amount. Only a capture may carry one.
  it("records the amount on a capture", () => {
    const update = chargeUpdateFromEvent("payment_intent.succeeded", captured);
    assert.equal(update?.capturedCents, 2450);
  });

  it("is null on authorized — a hold is not money taken", () => {
    const update = chargeUpdateFromEvent("payment_intent.amount_capturable_updated", captured);
    assert.equal(update?.capturedCents, null);
  });

  it("is null on voided, even when the intent still reports an amount", () => {
    const update = chargeUpdateFromEvent("payment_intent.canceled", captured);
    assert.equal(update?.capturedCents, null);
  });

  it("is null on failed", () => {
    const update = chargeUpdateFromEvent("payment_intent.payment_failed", captured);
    assert.equal(update?.capturedCents, null);
  });

  it("passes a null amount through on a capture rather than inventing a zero", () => {
    const update = chargeUpdateFromEvent("payment_intent.succeeded", {
      amountReceived: null,
      failureMessage: null,
    });
    assert.equal(update?.capturedCents, null);
  });
});

describe("chargeUpdateFromEvent — failureReason", () => {
  it("carries Stripe's own message through", () => {
    const update = chargeUpdateFromEvent("payment_intent.payment_failed", declined);
    assert.equal(update?.failureReason, "Your card was declined.");
  });

  it("is null when the intent carries no error", () => {
    const update = chargeUpdateFromEvent("payment_intent.succeeded", captured);
    assert.equal(update?.failureReason, null);
  });
});

describe("chargeUpdateFromEvent — events this ledger does not track", () => {
  it("returns null for account.updated, which is the payouts side's business", () => {
    assert.equal(chargeUpdateFromEvent("account.updated", captured), null);
  });

  it("returns null for an unrecognised event rather than guessing a status", () => {
    assert.equal(chargeUpdateFromEvent("payment_intent.created", captured), null);
    assert.equal(chargeUpdateFromEvent("charge.refunded", captured), null);
    assert.equal(chargeUpdateFromEvent("", captured), null);
  });
});
