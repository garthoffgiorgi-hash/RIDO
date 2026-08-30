import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { canStartTrip, type StartableRide } from "./start.ts";

const OWN_DRIVER_ID = "driver-1";
const ownRide: StartableRide = { status: "accepted", driverId: OWN_DRIVER_ID };

describe("canStartTrip", () => {
  it("allows the owning active driver to start an accepted ride", () => {
    const decision = canStartTrip(ownRide, OWN_DRIVER_ID, "active");
    assert.deepEqual(decision, { allowed: true });
  });

  it("refuses a caller who isn't the driver on the ride", () => {
    const decision = canStartTrip(ownRide, "some-other-driver", "active");
    assert.deepEqual(decision, {
      allowed: false,
      refusal: "not_the_driver",
      message: "You are not the driver on this ride.",
    });
  });

  it("refuses not_the_driver before checking driver status, even when the caller is also inactive", () => {
    const decision = canStartTrip(ownRide, "some-other-driver", "suspended");
    assert.equal(decision.allowed, false);
    assert.equal(!decision.allowed && decision.refusal, "not_the_driver");
  });

  it("refuses an inactive driver even on their own ride", () => {
    const decision = canStartTrip(ownRide, OWN_DRIVER_ID, "pending");
    assert.deepEqual(decision, {
      allowed: false,
      refusal: "driver_not_active",
      message: "Your driver account is 'pending'. Only an active account can start a trip.",
    });
  });

  it("refuses not_the_driver when the ride has no driver at all (still 'requested')", () => {
    const unassignedRide: StartableRide = { status: "requested", driverId: null };
    const decision = canStartTrip(unassignedRide, OWN_DRIVER_ID, "active");
    assert.deepEqual(decision, {
      allowed: false,
      refusal: "not_the_driver",
      message: "You are not the driver on this ride.",
    });
  });

  it("refuses driver_not_active before checking ride state, even when the ride isn't startable", () => {
    const inProgressRide: StartableRide = { status: "in_progress", driverId: OWN_DRIVER_ID };
    const decision = canStartTrip(inProgressRide, OWN_DRIVER_ID, "suspended");
    assert.equal(decision.allowed, false);
    assert.equal(!decision.allowed && decision.refusal, "driver_not_active");
  });

  it("refuses ride_not_startable when the ride isn't 'accepted'", () => {
    const inProgressRide: StartableRide = { status: "in_progress", driverId: OWN_DRIVER_ID };
    const decision = canStartTrip(inProgressRide, OWN_DRIVER_ID, "active");
    assert.deepEqual(decision, {
      allowed: false,
      refusal: "ride_not_startable",
      message: "This ride is 'in_progress' and cannot be started.",
    });
  });
});
