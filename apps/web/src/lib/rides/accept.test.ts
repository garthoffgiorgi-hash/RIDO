import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { canAcceptRide, type OpenRide } from "./accept.ts";

const openRide: OpenRide = { status: "requested", driverId: null };

describe("canAcceptRide", () => {
  it("allows an active driver to accept an open, unassigned ride", () => {
    const decision = canAcceptRide(openRide, "active");
    assert.deepEqual(decision, { allowed: true });
  });

  it("refuses a driver whose account isn't active", () => {
    const decision = canAcceptRide(openRide, "pending");
    assert.deepEqual(decision, {
      allowed: false,
      refusal: "driver_not_active",
      message: "Your driver account is 'pending'. Only an active account can accept rides.",
    });
  });

  it("refuses driver_not_active before checking ride state, even when the ride is also taken", () => {
    const takenRide: OpenRide = { status: "accepted", driverId: "some-other-driver" };
    const decision = canAcceptRide(takenRide, "suspended");
    assert.equal(decision.allowed, false);
    assert.equal(!decision.allowed && decision.refusal, "driver_not_active");
  });

  it("refuses ride_taken when another driver already holds the ride", () => {
    const takenRide: OpenRide = { status: "accepted", driverId: "some-other-driver" };
    const decision = canAcceptRide(takenRide, "active");
    assert.deepEqual(decision, {
      allowed: false,
      refusal: "ride_taken",
      message: "Another driver already accepted this ride.",
    });
  });

  it("refuses ride_not_open when the ride is unassigned but no longer requested", () => {
    const canceledRide: OpenRide = { status: "canceled", driverId: null };
    const decision = canAcceptRide(canceledRide, "active");
    assert.deepEqual(decision, {
      allowed: false,
      refusal: "ride_not_open",
      message: "This ride is 'canceled' and can no longer be accepted.",
    });
  });

  it("checks ride_taken before ride_not_open when a ride is both assigned and not requested", () => {
    const inProgressRide: OpenRide = { status: "in_progress", driverId: "some-other-driver" };
    const decision = canAcceptRide(inProgressRide, "active");
    assert.equal(decision.allowed, false);
    assert.equal(!decision.allowed && decision.refusal, "ride_taken");
  });
});
