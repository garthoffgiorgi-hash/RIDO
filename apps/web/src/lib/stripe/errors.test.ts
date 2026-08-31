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
