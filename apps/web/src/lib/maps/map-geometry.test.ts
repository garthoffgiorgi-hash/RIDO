import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { boundsForCoordinates, boundsForGeometry } from "./map-geometry.ts";
import type { RouteGeometry } from "./types.ts";

const GEISEL = { lng: -117.2378, lat: 32.8811 };
const LA_JOLLA = { lng: -117.271, lat: 32.8328 };

describe("boundsForCoordinates", () => {
  it("throws on an empty list — there is no smallest box containing nothing", () => {
    assert.throws(() => boundsForCoordinates([]));
  });

  it("returns a degenerate point's own coordinates as both corners, widened", () => {
    const { sw, ne } = boundsForCoordinates([GEISEL]);
    assert.ok(sw.lng < GEISEL.lng && ne.lng > GEISEL.lng);
    assert.ok(sw.lat < GEISEL.lat && ne.lat > GEISEL.lat);
  });

  it("widens a box that is degenerate in only one axis (a due-north/south or due-east/west pair)", () => {
    const north = { lng: GEISEL.lng, lat: GEISEL.lat + 0.01 };
    const { sw, ne } = boundsForCoordinates([GEISEL, north]);
    // Latitude genuinely spans the two points — no widening needed there.
    assert.equal(sw.lat, GEISEL.lat);
    assert.equal(ne.lat, north.lat);
    // Longitude is identical for both, so it must have been widened rather than left at zero span.
    assert.ok(sw.lng < GEISEL.lng && ne.lng > GEISEL.lng);
  });

  it("wraps two distinct points exactly, sw as the min corner and ne as the max", () => {
    const { sw, ne } = boundsForCoordinates([GEISEL, LA_JOLLA]);
    assert.equal(sw.lng, Math.min(GEISEL.lng, LA_JOLLA.lng));
    assert.equal(ne.lng, Math.max(GEISEL.lng, LA_JOLLA.lng));
    assert.equal(sw.lat, Math.min(GEISEL.lat, LA_JOLLA.lat));
    assert.equal(ne.lat, Math.max(GEISEL.lat, LA_JOLLA.lat));
  });

  it("is order-independent — the same two points in either order give the same box", () => {
    const forward = boundsForCoordinates([GEISEL, LA_JOLLA]);
    const backward = boundsForCoordinates([LA_JOLLA, GEISEL]);
    assert.deepEqual(forward, backward);
  });

  it("expands to fit a third point outside the first two's box", () => {
    const farNorth = { lng: -117.25, lat: 33.0 };
    const { ne } = boundsForCoordinates([GEISEL, LA_JOLLA, farNorth]);
    assert.equal(ne.lat, farNorth.lat);
  });
});

describe("boundsForGeometry", () => {
  it("fits a line that bows outside the straight box between its own endpoints", () => {
    // A route that starts and ends at the same longitude but detours east in the middle — the
    // bounding box of the endpoints alone would miss the detour entirely.
    const geometry: RouteGeometry = {
      type: "LineString",
      coordinates: [
        [-117.24, 32.88],
        [-117.2, 32.86], // the detour east
        [-117.24, 32.84],
      ],
    };
    const { ne } = boundsForGeometry(geometry);
    assert.equal(ne.lng, -117.2);
  });

  it("keeps lng/lat in the right order — a GeoJSON [lng, lat] pair is not read as [lat, lng]", () => {
    const geometry: RouteGeometry = {
      type: "LineString",
      coordinates: [
        [-117.2378, 32.8811],
        [-117.271, 32.8328],
      ],
    };
    const { sw, ne } = boundsForGeometry(geometry);
    // Longitudes here are all far more negative than the latitudes are positive; if the reader
    // swapped the pair, lng would come back in the 32s and this would fail.
    assert.ok(ne.lng < -100 && sw.lng < -100);
    assert.ok(ne.lat > 0 && ne.lat < 90 && sw.lat > 0 && sw.lat < 90);
  });
});
