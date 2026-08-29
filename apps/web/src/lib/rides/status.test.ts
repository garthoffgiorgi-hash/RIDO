import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { ACTIVE_STATUSES, canRiderCancel, isActiveStatus, type RideStatus } from "./status.ts";

const ALL: readonly RideStatus[] = [
  "requested",
  "accepted",
  "in_progress",
  "completed",
  "canceled",
];

describe("isActiveStatus", () => {
  it("agrees with rides_one_active_per_rider's WHERE clause exactly", () => {
    // The index in 20260829120000_enable_ride_requests.sql is the actual enforcement; this
    // asserts the two never drift by listing every status and checking each one by hand rather
    // than deriving the expectation from ACTIVE_STATUSES itself.
    for (const status of ALL) {
      const expected = status === "requested" || status === "accepted" || status === "in_progress";
      assert.equal(isActiveStatus(status), expected, `status=${status}`);
    }
  });

  it("ACTIVE_STATUSES contains exactly the active ones, no more, no fewer", () => {
    assert.deepEqual([...ACTIVE_STATUSES].sort(), ["accepted", "in_progress", "requested"].sort());
  });
});

describe("canRiderCancel", () => {
  it("permits cancellation only while requested — nothing here can produce a later state yet", () => {
    for (const status of ALL) {
      assert.equal(canRiderCancel(status), status === "requested", `status=${status}`);
    }
  });
});
