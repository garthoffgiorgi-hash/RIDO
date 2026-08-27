import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildForwardSearchUrl, buildReverseUrl, parsePlaces } from "./places.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(HERE, "fixtures", name), "utf8"));

const TOKEN = "pk.test-token-not-a-real-one";
const UCSD = { lng: -117.237, lat: 32.8801 };

describe("buildForwardSearchUrl", () => {
  it("sends the query, scoped to the first market", () => {
    const params = new URL(buildForwardSearchUrl({ query: "Geisel Library", accessToken: TOKEN }))
      .searchParams;
    assert.equal(params.get("q"), "Geisel Library");
    assert.equal(params.get("country"), "us");
    assert.equal(params.get("limit"), "5");
  });

  it("biases toward a point when one is given, longitude first", () => {
    const params = new URL(
      buildForwardSearchUrl({ query: "coffee", accessToken: TOKEN, near: UCSD }),
    ).searchParams;
    assert.equal(params.get("proximity"), "-117.237,32.8801");
  });

  it("omits proximity when there's nothing to bias toward", () => {
    const params = new URL(buildForwardSearchUrl({ query: "coffee", accessToken: TOKEN }))
      .searchParams;
    assert.equal(params.get("proximity"), null);
  });

  // Storing a result is a separately-billed product and a terms question, so it has to be asked
  // for explicitly — never defaulted on. See docs/architecture/maps.md.
  it("only asks for a storable result when told to", () => {
    const off = new URL(buildForwardSearchUrl({ query: "x", accessToken: TOKEN })).searchParams;
    assert.equal(off.get("permanent"), null);

    const on = new URL(buildForwardSearchUrl({ query: "x", accessToken: TOKEN, permanent: true }))
      .searchParams;
    assert.equal(on.get("permanent"), "true");
  });

  it("respects an explicit limit", () => {
    const params = new URL(buildForwardSearchUrl({ query: "x", accessToken: TOKEN, limit: 3 }))
      .searchParams;
    assert.equal(params.get("limit"), "3");
  });

  it("refuses an empty query or a missing token", () => {
    assert.throws(
      () => buildForwardSearchUrl({ query: "   ", accessToken: TOKEN }),
      /query is required/,
    );
    assert.throws(
      () => buildForwardSearchUrl({ query: "x", accessToken: "" }),
      /accessToken is required/,
    );
  });
});

describe("buildReverseUrl", () => {
  it("sends longitude and latitude as named parameters", () => {
    const params = new URL(buildReverseUrl({ at: UCSD, accessToken: TOKEN })).searchParams;
    assert.equal(params.get("longitude"), "-117.237");
    assert.equal(params.get("latitude"), "32.8801");
  });

  it("requires a token", () => {
    assert.throws(() => buildReverseUrl({ at: UCSD, accessToken: "" }), /accessToken is required/);
  });
});

describe("parsePlaces", () => {
  it("reads a Search Box FeatureCollection into Places", () => {
    const result = parsePlaces(fixture("search-forward.json"));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.data.length, 3);
    const geisel = result.data[0];
    assert.ok(geisel);
    assert.equal(geisel.name, "Geisel Library");
    assert.match(geisel.address ?? "", /9500 Gilman Dr/);
    assert.deepEqual(geisel.coordinates, { lng: -117.2374, lat: 32.8811 });
  });

  /**
   * The ADR-0006 boundary, asserted rather than described. A component depending on `relevance`
   * or `feature_type` would quietly bind this app to Mapbox's ranking model — so a `Place` has
   * exactly four fields and no vendor field survives the parse.
   */
  it("drops every vendor field", () => {
    const result = parsePlaces(fixture("search-forward.json"));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    for (const place of result.data) {
      assert.deepEqual(Object.keys(place).sort(), ["address", "coordinates", "id", "name"]);
    }
  });

  it("keeps a place that has no address", () => {
    const result = parsePlaces(fixture("search-forward.json"));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const laJolla = result.data.find((p) => p.name === "La Jolla");
    assert.ok(laJolla);
    assert.equal(laJolla.address, null);
    assert.deepEqual(laJolla.coordinates, { lng: -117.2713, lat: 32.8474 });
  });

  // "Found nothing" is an answer, not a breakage — a caller renders it differently from an error.
  it("reports an empty result as success with no places", () => {
    const result = parsePlaces({ type: "FeatureCollection", features: [] });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.data, []);
  });

  it("skips a feature with no usable name or id rather than failing the batch", () => {
    const result = parsePlaces({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {} },
        {
          type: "Feature",
          id: "keeper",
          geometry: { type: "Point", coordinates: [-117.2, 32.8] },
          properties: { name: "Somewhere Real" },
        },
      ],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0]?.name, "Somewhere Real");
  });

  it("fails on a body that isn't a FeatureCollection", () => {
    for (const body of [null, undefined, "", 42, [], { nope: true }]) {
      assert.equal(parsePlaces(body).ok, false, `should have rejected ${JSON.stringify(body)}`);
    }
  });
});
