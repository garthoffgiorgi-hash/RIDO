import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { completionErrorMessage } from "./completion-errors.ts";

/** `completion-errors.ts` logs to console.warn outside production — silence it for the test. */
function quietly<T>(fn: () => T): T {
  const original = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = original;
  }
}

const result = (input: Parameters<typeof completionErrorMessage>[0]) =>
  quietly(() => completionErrorMessage(input));

describe("completionErrorMessage — the two shapes of 409", () => {
  it("marks the retry-limit conflict as retryable", () => {
    const r = result({
      status: 409,
      raw: "Ride abc123 could not be completed after 3 attempts — this driver has other completions landing concurrently. Retry.",
    });
    assert.equal(r.retryable, true);
  });

  it("marks an ordinary not-completable refusal as NOT retryable", () => {
    const r = result({
      status: 409,
      raw: "Ride abc123 is 'canceled' and cannot be completed.",
    });
    assert.equal(r.retryable, false);
  });

  it("distinguishes the two purely by message content, not just the status code", () => {
    const conflict = result({
      status: 409,
      raw: "...after 3 attempts — landing concurrently. Retry.",
    });
    const refusal = result({ status: 409, raw: "Ride x is 'requested' and cannot be completed." });
    assert.notEqual(conflict.retryable, refusal.retryable);
  });

  it("is case-insensitive when detecting the retry-limit phrase", () => {
    const r = result({ status: 409, raw: "...AFTER 3 ATTEMPTS — LANDING CONCURRENTLY. Retry." });
    assert.equal(r.retryable, true);
  });
});

describe("completionErrorMessage — terminal refusals", () => {
  it("401 is not retryable", () => {
    assert.equal(result({ status: 401, raw: "Not signed in as a driver." }).retryable, false);
  });

  it("403 (not the driver) is not retryable", () => {
    assert.equal(
      result({ status: 403, raw: "You are not the driver on this ride." }).retryable,
      false,
    );
  });

  it("403 (driver not active) is not retryable", () => {
    assert.equal(
      result({
        status: 403,
        raw: "Your driver account is 'suspended'. Only an active account can complete rides.",
      }).retryable,
      false,
    );
  });

  it("404 is not retryable", () => {
    assert.equal(result({ status: 404, raw: "No ride abc123." }).retryable, false);
  });

  it("passes complete-ride's own message straight through for a terminal refusal", () => {
    const r = result({ status: 403, raw: "You are not the driver on this ride." });
    assert.equal(r.message, "You are not the driver on this ride.");
  });
});

describe("completionErrorMessage — transient failures", () => {
  it("5xx is retryable", () => {
    assert.equal(result({ status: 500, raw: "Could not complete the ride." }).retryable, true);
  });

  it("a network-level failure (no status) is retryable", () => {
    const r = result({ raw: "TypeError: Failed to fetch" });
    assert.equal(r.retryable, true);
  });

  it("a timeout (no status) is retryable and says so", () => {
    const r = result({ raw: "TimeoutError: The operation timed out." });
    assert.equal(r.retryable, true);
    assert.match(r.message, /too long/i);
  });
});

describe("completionErrorMessage — fallbacks", () => {
  it("falls back to a generic message when raw is missing", () => {
    const r = result({ status: 500 });
    assert.equal(typeof r.message, "string");
    assert.ok(r.message.length > 0);
  });
});
