import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { normalizeWaitlistEmail, parseWaitlistInterest } from "./validate.ts";

describe("normalizeWaitlistEmail", () => {
  it("trims and lowercases a valid address", () => {
    assert.equal(normalizeWaitlistEmail("  Rider@Example.COM  "), "rider@example.com");
  });

  it("accepts a plain valid address unchanged", () => {
    assert.equal(normalizeWaitlistEmail("rider@example.com"), "rider@example.com");
  });

  it("rejects empty input", () => {
    assert.equal(normalizeWaitlistEmail(""), null);
    assert.equal(normalizeWaitlistEmail("   "), null);
  });

  it("rejects a string with no @", () => {
    assert.equal(normalizeWaitlistEmail("not-an-email"), null);
  });

  it("rejects a string with no domain dot", () => {
    assert.equal(normalizeWaitlistEmail("rider@example"), null);
  });

  it("rejects embedded whitespace", () => {
    assert.equal(normalizeWaitlistEmail("rider @example.com"), null);
  });

  it("rejects an address past RFC 5321's 254-character limit", () => {
    const tooLong = `${"a".repeat(250)}@x.co`;
    assert.equal(normalizeWaitlistEmail(tooLong), null);
  });
});

describe("parseWaitlistInterest", () => {
  it("accepts each of the three real values", () => {
    assert.equal(parseWaitlistInterest("rider"), "rider");
    assert.equal(parseWaitlistInterest("driver"), "driver");
    assert.equal(parseWaitlistInterest("both"), "both");
  });

  it("rejects anything outside the three literals, including a near-miss", () => {
    assert.equal(parseWaitlistInterest("riders"), null);
    assert.equal(parseWaitlistInterest("passenger"), null);
    assert.equal(parseWaitlistInterest(""), null);
  });
});
