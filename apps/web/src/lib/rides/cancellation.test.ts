/**
 * The cancellation rule, at every status and on both sides of the grace boundary.
 *
 * Nothing here names RIDO's actual fee or window — those are rows in `fare_rate_cards`. The values
 * below are synthetic, and `now` is supplied rather than read, which is the whole reason the
 * boundary can be tested to the second at all.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { cancellationOutcome } from "./cancellation.ts";
import type { RideStatus } from "./status.ts";

const ACCEPTED_AT = "2026-09-02T12:00:00.000Z";
const GRACE_SECONDS = 30;
const FEE_CENTS = 500;

/** `secondsAfterAccept` seconds past the moment the driver accepted. */
const at = (secondsAfterAccept: number) =>
  new Date(Date.parse(ACCEPTED_AT) + secondsAfterAccept * 1000);

const outcome = (
  status: RideStatus,
  secondsAfterAccept: number,
  overrides: { acceptedAt?: string | null; feeCents?: number } = {},
) =>
  cancellationOutcome({
    status,
    acceptedAt: overrides.acceptedAt === undefined ? ACCEPTED_AT : overrides.acceptedAt,
    now: at(secondsAfterAccept),
    graceSeconds: GRACE_SECONDS,
    feeCents: overrides.feeCents ?? FEE_CENTS,
  });

describe("cancellationOutcome", () => {
  it("is free before a driver has accepted, however long the rider waits", () => {
    // Nobody was dispatched, so there is nothing to compensate — and no clock to consult.
    assert.deepEqual(outcome("requested", 0, { acceptedAt: null }), { kind: "free" });
    assert.deepEqual(outcome("requested", 3600, { acceptedAt: null }), { kind: "free" });
  });

  it("is free inside the grace window", () => {
    assert.deepEqual(outcome("accepted", 0), { kind: "free" });
    assert.deepEqual(outcome("accepted", 15), { kind: "free" });
    assert.deepEqual(outcome("accepted", 29), { kind: "free" });
  });

  it("is free exactly ON the boundary, and charges only past it", () => {
    // The one second a rider could reasonably argue about. Inclusive at the boundary: if the
    // window is thirty seconds, the thirtieth second is still inside it. Charging AT the limit
    // would make the stated window a lie by one second.
    assert.deepEqual(outcome("accepted", 30), { kind: "free" });
    assert.deepEqual(outcome("accepted", 31), { kind: "fee", feeCents: FEE_CENTS });
  });

  it("charges well past the window", () => {
    assert.deepEqual(outcome("accepted", 120), { kind: "fee", feeCents: FEE_CENTS });
    assert.deepEqual(outcome("accepted", 3600), { kind: "fee", feeCents: FEE_CENTS });
  });

  it("charges an in-progress ride with no grace at all", () => {
    // The rider is in the car. There is no version of this where the driver's time wasn't spent,
    // so the window never applies — not even one second after the trip started.
    assert.deepEqual(outcome("in_progress", 0), { kind: "fee", feeCents: FEE_CENTS });
    assert.deepEqual(outcome("in_progress", 1), { kind: "fee", feeCents: FEE_CENTS });
  });

  it("forbids canceling a finished ride", () => {
    assert.deepEqual(outcome("completed", 60), { kind: "forbidden" });
    assert.deepEqual(outcome("canceled", 60), { kind: "forbidden" });
  });

  it("treats a market with no configured fee as free, not a fee of nothing", () => {
    // A rider should never see a confirmation dialog about being charged $0.00.
    assert.deepEqual(outcome("accepted", 300, { feeCents: 0 }), { kind: "free" });
    assert.deepEqual(outcome("in_progress", 300, { feeCents: 0 }), { kind: "free" });
  });

  it("falls back to free when accepted_at is missing or unparseable", () => {
    // An 'accepted' ride with no timestamp is a row inconsistent with itself. Resolving that
    // ambiguity in RIDO's favour would be charging someone on the strength of our own bad data.
    assert.deepEqual(outcome("accepted", 300, { acceptedAt: null }), { kind: "free" });
    assert.deepEqual(outcome("accepted", 300, { acceptedAt: "not a timestamp" }), { kind: "free" });
  });

  it("never returns a fee the caller did not configure", () => {
    // The fee is data. This file names 500 only as a fixture; the rule must pass through whatever
    // the rate card said, unmodified — no minimum, no rounding, no arithmetic.
    for (const fee of [1, 250, 500, 1234, 99_999]) {
      const result = outcome("in_progress", 60, { feeCents: fee });
      assert.deepEqual(result, { kind: "fee", feeCents: fee });
    }
  });
});
