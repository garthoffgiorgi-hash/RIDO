import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildPermanentForwardUrl, parseGeocodingFeatures } from "./geocode.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(HERE, "fixtures", name), "utf8"));

const TOKEN = "sk.test-token-not-a-real-one";
const UCSD = { lng: -117.237, lat: 32.8801 };
const GILMAN = "9500 Gilman Drive, La Jolla, California 92093, United States";

describe("buildPermanentForwardUrl", () => {
  /**
   * The reason this module exists. `permanent=true` is not an argument and has no way to be
   * omitted — a module that exists only for the storable case must not be able to forget the flag
   * (ADR-0011). If this ever fails, we are spending money on a request whose result we may not
   * keep, which is the worst of both outcomes.
   */
  it("always asks for permanent rights — there is no way to turn it off", () => {
    const params = new URL(buildPermanentForwardUrl({ query: GILMAN, accessToken: TOKEN }))
      .searchParams;
    assert.equal(params.get("permanent"), "true");
  });

  it("hits Geocoding v6, not Search Box — they are different products with different terms", () => {
    const url = buildPermanentForwardUrl({ query: GILMAN, accessToken: TOKEN });
    assert.match(url, /\/search\/geocode\/v6\/forward\?/);
    assert.ok(!url.includes("searchbox"), "must not fall through to the Search Box origin");
  });

  it("sends the address scoped to the first market, and asks for exactly one result", () => {
    const params = new URL(buildPermanentForwardUrl({ query: GILMAN, accessToken: TOKEN }))
      .searchParams;
    assert.equal(params.get("q"), GILMAN);
    assert.equal(params.get("country"), "us");
    // Each extra result is a billed request we would discard — there is nothing to disambiguate
    // against here, because the rider already chose the place.
    assert.equal(params.get("limit"), "1");
  });

  it("biases toward the display coordinate when given one, longitude first", () => {
    const params = new URL(
      buildPermanentForwardUrl({ query: GILMAN, accessToken: TOKEN, near: UCSD }),
    ).searchParams;
    assert.equal(params.get("proximity"), "-117.237,32.8801");
  });

  it("refuses an empty query or a missing token", () => {
    assert.throws(
      () => buildPermanentForwardUrl({ query: "   ", accessToken: TOKEN }),
      /query is required/,
    );
    assert.throws(
      () => buildPermanentForwardUrl({ query: GILMAN, accessToken: "" }),
      /accessToken is required/,
    );
  });
});

describe("parseGeocodingFeatures", () => {
  it("reads a v6 FeatureCollection into Places", () => {
    const result = parseGeocodingFeatures(fixture("geocoding-v6-forward.json"));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.data.length, 1);
    const place = result.data[0];
    assert.ok(place);
    assert.equal(place.name, "9500 Gilman Drive");
    assert.equal(place.address, GILMAN);
    assert.deepEqual(place.coordinates, { lng: -117.2361, lat: 32.8801 });
  });

  /** Same ADR-0006 boundary `parsePlaces` holds: a Place from either API looks identical. */
  it("drops every vendor field — match_code, context, feature_type, accuracy", () => {
    const result = parseGeocodingFeatures(fixture("geocoding-v6-forward.json"));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    for (const place of result.data) {
      assert.deepEqual(Object.keys(place).sort(), ["address", "coordinates", "id", "name"]);
    }
  });

  /**
   * Stricter than `parsePlaces`, deliberately. Search Box may legitimately return a region with no
   * coordinates and a caller checks for them; this module's whole output IS a storable coordinate,
   * so a feature without one is not a partial answer.
   */
  it("skips a feature with no coordinates rather than returning a null one", () => {
    const result = parseGeocodingFeatures({
      type: "FeatureCollection",
      features: [
        { type: "Feature", id: "no-geom", properties: { name: "Nowhere" } },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-117.2, 32.8] },
          properties: { mapbox_id: "keeper", name: "Somewhere Real" },
        },
      ],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0]?.name, "Somewhere Real");
  });

  it("falls back to the full address when v6 returns no separate name", () => {
    const result = parseGeocodingFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-117.2361, 32.8801] },
          properties: { mapbox_id: "addr", full_address: GILMAN },
        },
      ],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data[0]?.name, GILMAN);
    // Not repeated back as both fields — the same rule parsePlaces applies.
    assert.equal(result.data[0]?.address, null);
  });

  it("reports no match as success with no places — the caller decides if that's fatal", () => {
    const result = parseGeocodingFeatures({ type: "FeatureCollection", features: [] });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.data, []);
  });

  it("fails on a body that isn't a FeatureCollection", () => {
    for (const body of [null, undefined, "", 42, [], { nope: true }]) {
      assert.equal(
        parseGeocodingFeatures(body).ok,
        false,
        `should have rejected ${JSON.stringify(body)}`,
      );
    }
  });
});
