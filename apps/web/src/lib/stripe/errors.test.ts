import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { stripeErrorMessage } from "./errors.ts";

/** `errors.ts` logs to console.warn outside production — silence it for the test. */
function quietly<T>(fn: () => T): T {
  const original = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = original;
  }
}

const result = (input: Parameters<typeof stripeErrorMessage>[0]) =>
  quietly(() => stripeErrorMessage(input));

describe("stripeErrorMessage — balance_insufficient, the expected production failure", () => {
  it("never tells a driver their earnings are gone", () => {
    const r = result({ type: "StripeInvalidRequestError", code: "balance_insufficient" });
    assert.match(r.message, /recorded|queued/i);
    assert.doesNotMatch(r.message, /insufficient funds/i);
  });

  it("is retryable — the same call succeeds once the balance is funded", () => {
    assert.equal(
      result({ type: "StripeInvalidRequestError", code: "balance_insufficient" }).retryable,
      true,
    );
  });

  it("takes precedence over its own error type, which is a generic invalid-request", () => {
    // Both share type StripeInvalidRequestError; only the code separates "we have no money" from
    // "you sent a malformed request", and they need opposite messages.
    const balance = result({ type: "StripeInvalidRequestError", code: "balance_insufficient" });
    const malformed = result({ type: "StripeInvalidRequestError", code: "parameter_unknown" });
    assert.notEqual(balance.message, malformed.message);
    assert.notEqual(balance.retryable, malformed.retryable);
  });
});

describe("stripeErrorMessage — the driver's account", () => {
  it("points an unonboarded driver at connecting their bank", () => {
    const r = result({ type: "StripeInvalidRequestError", code: "account_invalid" });
    assert.match(r.message, /connect your bank/i);
    assert.equal(r.retryable, false);
  });
});

describe("stripeErrorMessage — the rider's card (ADR-0017)", () => {
  // The only family in this file a RIDER reads. The tests are as much about voice as behaviour:
  // a rider must never be shown RIDO's plumbing, and must always be told what to do next.
  const DECLINES = [
    "card_declined",
    "insufficient_funds",
    "expired_card",
    "incorrect_cvc",
    "authentication_required",
  ];

  it("tells a rider what to do, without mentioning payouts or RIDO's internals", () => {
    for (const code of DECLINES) {
      const r = result({ type: "StripeCardError", code });
      assert.match(
        r.message,
        /try|add|check/i,
        `${code} should tell the rider an action, got: ${r.message}`,
      );
      assert.doesNotMatch(r.message, /payout|balance|stripe|RIDO/i, `${code} leaked internals`);
    }
  });

  it("marks every decline NOT retryable — a declined card declines again", () => {
    // `retryable` means "the same call would succeed unchanged". Retrying a decline just collects
    // identical failures; recovery is a different card, which is a different call.
    for (const code of DECLINES) {
      assert.equal(
        result({ type: "StripeCardError", code }).retryable,
        false,
        `${code} must not be retryable`,
      );
    }
  });

  it("distinguishes insufficient funds from a flat decline", () => {
    // Same remedy, different diagnosis — and a rider who knows which one it was can act faster.
    const declined = result({ type: "StripeCardError", code: "card_declined" }).message;
    const broke = result({ type: "StripeCardError", code: "insufficient_funds" }).message;
    assert.notEqual(declined, broke);
    assert.match(broke, /enough available/i);
  });

  it("treats a 3DS challenge as a question, not a refusal", () => {
    const r = result({ type: "StripeCardError", code: "authentication_required" });
    assert.match(r.message, /confirm/i);
    assert.doesNotMatch(r.message, /declined/i);
  });
});

describe("stripeErrorMessage — our configuration, not the driver's problem", () => {
  it("names the env var on an auth error rather than blaming the user", () => {
    const r = result({ type: "StripeAuthenticationError" });
    assert.match(r.message, /STRIPE_SECRET_KEY/);
    assert.equal(r.retryable, false);
  });

  it("owns an invalid request rather than implying the driver did something", () => {
    const r = result({ type: "StripeInvalidRequestError", code: "parameter_unknown" });
    assert.match(r.message, /ours to fix/i);
    assert.equal(r.retryable, false);
  });
});

describe("stripeErrorMessage — transport", () => {
  it("treats a connection error as retryable", () => {
    assert.equal(result({ type: "StripeConnectionError" }).retryable, true);
  });

  it("treats a rate limit as retryable", () => {
    assert.equal(result({ type: "StripeRateLimitError" }).retryable, true);
  });

  it("recognises a timeout from the raw message when there is no type", () => {
    const r = result({ raw: "ETIMEDOUT: the operation timed out" });
    assert.equal(r.retryable, true);
    assert.match(r.message, /too long/i);
  });
});

describe("stripeErrorMessage — the unknown case", () => {
  it("defaults to retryable, because stranding a payout is worse than a wasted retry", () => {
    assert.equal(result({ type: "SomethingStripeInventedLastWeek" }).retryable, true);
  });

  it("still returns a non-empty message with nothing to go on", () => {
    const r = result({});
    assert.ok(r.message.length > 0);
  });
});
