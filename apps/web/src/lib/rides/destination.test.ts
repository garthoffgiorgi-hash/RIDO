import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { driverDestination } from "./destination.ts";

const pickup = { lng: -117.2378, lat: 32.8811 };
const dropoff = { lng: -117.161, lat: 32.7157 };

describe("driverDestination", () => {
  it("points at the pickup while accepted", () => {
    const destination = driverDestination({
      status: "accepted",
      pickupCoordinates: pickup,
      pickupAddress: "9500 Gilman Dr",
      dropoffCoordinates: dropoff,
      dropoffAddress: "Downtown San Diego",
    });
    assert.deepEqual(destination, { coordinates: pickup, address: "9500 Gilman Dr" });
  });

  it("points at the dropoff once in progress", () => {
    const destination = driverDestination({
      status: "in_progress",
      pickupCoordinates: pickup,
      pickupAddress: "9500 Gilman Dr",
      dropoffCoordinates: dropoff,
      dropoffAddress: "Downtown San Diego",
    });
    assert.deepEqual(destination, { coordinates: dropoff, address: "Downtown San Diego" });
  });

  it("passes through nulls rather than fabricating a value", () => {
    const destination = driverDestination({
      status: "accepted",
      pickupCoordinates: null,
      pickupAddress: null,
      dropoffCoordinates: dropoff,
      dropoffAddress: "Downtown San Diego",
    });
    assert.deepEqual(destination, { coordinates: null, address: null });
  });
});
