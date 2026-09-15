import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { geolocationErrorMessage, getCurrentPosition } from "./geolocation.ts";

describe("geolocationErrorMessage", () => {
  it("names permission denial and how to fix it", () => {
    assert.match(geolocationErrorMessage(1), /location access is off/i);
  });

  it("says when a fix just isn't available", () => {
    assert.match(geolocationErrorMessage(2), /couldn't work out where you are/i);
  });

  it("says when it took too long", () => {
    assert.match(geolocationErrorMessage(3), /took too long/i);
  });

  it("falls back to a generic message for any other code", () => {
    assert.match(geolocationErrorMessage(99), /couldn't get your location/i);
  });
});

describe("getCurrentPosition", () => {
  // node:test runs with no `navigator.geolocation` — the same shape a non-secure context or an
  // old browser presents. This is the "never throws" property the whole module exists for.
  it("never throws, and resolves a failure when geolocation isn't available", async () => {
    const result = await getCurrentPosition();
    assert.equal(result.ok, false);
  });
});
