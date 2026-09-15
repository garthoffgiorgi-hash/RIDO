import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { coordinateColumns, NO_STORED_COORDINATES, parseStoreCoordinates } from "./coordinates.ts";

describe("parseStoreCoordinates — the fail-safe default", () => {
  it("enables only on the exact literal 'true'", () => {
    assert.equal(parseStoreCoordinates("true"), true);
  });

  // Every one of these would start billing a card if the parse were loose. Same table
  // `live.test.ts` runs against RIDES_LIVE, for the same reason.
  it("stays disabled for every near-miss", () => {
    for (const raw of [undefined, "", "false", "0", "TRUE", "True", " true", "true ", "1", "yes"]) {
      assert.equal(parseStoreCoordinates(raw), false, `expected ${JSON.stringify(raw)} to be off`);
    }
  });
});

const here = { lng: -117.2378, lat: 32.8811 };
const there = { lng: -117.1611, lat: 32.7157 };

describe("coordinateColumns", () => {
  it("writes both ends when both geocodes succeeded", () => {
    const columns = coordinateColumns({ ok: true, data: here }, { ok: true, data: there });
    assert.deepEqual(columns, {
      pickup_lat: 32.8811,
      pickup_lng: -117.2378,
      dropoff_lat: 32.7157,
      dropoff_lng: -117.1611,
    });
  });

  // The whole point of the module: a failed geocode must not write a guess.
  it("writes null for a failed end rather than a fabricated coordinate", () => {
    const columns = coordinateColumns(
      { ok: false, message: "That address resolved somewhere unexpected." },
      { ok: true, data: there },
    );
    assert.equal(columns.pickup_lat, null);
    assert.equal(columns.pickup_lng, null);
    assert.equal(columns.dropoff_lat, 32.7157);
  });

  // A dropped-pin pickup has no address to geocode, but the dropoff usually still does — half a
  // map beats none, so the two ends never share a fate.
  it("keeps the two ends independent", () => {
    const columns = coordinateColumns(null, { ok: true, data: there });
    assert.equal(columns.pickup_lat, null);
    assert.equal(columns.dropoff_lng, -117.1611);
  });

  it("writes all four null when neither end was attempted", () => {
    assert.deepEqual(coordinateColumns(null, null), NO_STORED_COORDINATES);
  });

  it("never throws, whatever it is handed", () => {
    assert.doesNotThrow(() => coordinateColumns(null, { ok: false, message: "timed out" }));
  });

  // lat and lng are trivially swappable and the failure is silent — a driver sent to the Indian
  // Ocean. The Coordinates type is lng-first; these columns are lat-first. Pinned deliberately.
  it("maps lng to _lng and lat to _lat, not positionally", () => {
    const columns = coordinateColumns({ ok: true, data: here }, null);
    assert.equal(columns.pickup_lng, here.lng);
    assert.equal(columns.pickup_lat, here.lat);
    assert.notEqual(columns.pickup_lat, here.lng);
  });
});
