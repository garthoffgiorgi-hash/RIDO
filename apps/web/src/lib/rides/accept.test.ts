import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { type AcceptingDriver, canAcceptRide, type OpenRide } from "./accept.ts";

const openRide: OpenRide = { status: "requested", driverId: null };
const online: AcceptingDriver = { status: "active", acceptingRides: true };
const offline: AcceptingDriver = { status: "active", acceptingRides: false };

describe("canAcceptRide", () => {
  it("allows an active, online driver to accept an open, unassigned ride", () => {
    const decision = canAcceptRide(openRide, online);
    assert.deepEqual(decision, { allowed: true });
  });

  it("refuses a driver whose account isn't active", () => {
    const decision = canAcceptRide(openRide, { status: "pending", acceptingRides: true });
    assert.deepEqual(decision, {
      allowed: false,
      refusal: "driver_not_active",
      message: "Your driver account is 'pending'. Only an active account can accept rides.",
    });
  });

  it("refuses driver_not_active before checking ride state, even when the ride is also taken", () => {
    const takenRide: OpenRide = { status: "accepted", driverId: "some-other-driver" };
    const decision = canAcceptRide(takenRide, { status: "suspended", acceptingRides: true });
    assert.equal(decision.allowed, false);
    assert.equal(!decision.allowed && decision.refusal, "driver_not_active");
  });

  it("refuses an offline driver, in their own words rather than the ride's", () => {
    const decision = canAcceptRide(openRide, offline);
    assert.deepEqual(decision, {
      allowed: false,
      refusal: "driver_not_accepting",
      message: "You're offline. Go online to accept rides.",
    });
  });

  // Properties of the caller before properties of the subject: "you're offline" is true of every
  // request on the board, so it's the useful answer even when this particular ride is also gone.
  it("refuses driver_not_accepting before ride state, even when the ride is also taken", () => {
    const takenRide: OpenRide = { status: "accepted", driverId: "some-other-driver" };
    const decision = canAcceptRide(takenRide, offline);
    assert.equal(decision.allowed, false);
    assert.equal(!decision.allowed && decision.refusal, "driver_not_accepting");
  });

  // Compliance still outranks availability: an unvetted driver going online changes nothing, and
  // being told "you're offline" would send them to fix the wrong problem.
  it("refuses driver_not_active before driver_not_accepting when a driver is both", () => {
    const decision = canAcceptRide(openRide, { status: "pending", acceptingRides: false });
    assert.equal(decision.allowed, false);
    assert.equal(!decision.allowed && decision.refusal, "driver_not_active");
  });

  it("refuses ride_taken when another driver already holds the ride", () => {
    const takenRide: OpenRide = { status: "accepted", driverId: "some-other-driver" };
    const decision = canAcceptRide(takenRide, online);
    assert.deepEqual(decision, {
      allowed: false,
      refusal: "ride_taken",
      message: "Another driver already accepted this ride.",
    });
  });

  it("refuses ride_not_open when the ride is unassigned but no longer requested", () => {
    const canceledRide: OpenRide = { status: "canceled", driverId: null };
    const decision = canAcceptRide(canceledRide, online);
    assert.deepEqual(decision, {
      allowed: false,
      refusal: "ride_not_open",
      message: "This ride is 'canceled' and can no longer be accepted.",
    });
  });

  it("checks ride_taken before ride_not_open when a ride is both assigned and not requested", () => {
    const inProgressRide: OpenRide = { status: "in_progress", driverId: "some-other-driver" };
    const decision = canAcceptRide(inProgressRide, online);
    assert.equal(decision.allowed, false);
    assert.equal(!decision.allowed && decision.refusal, "ride_taken");
  });
});
