import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { type FareRateCard, quoteFare } from "@rido/pricing";

import { buildDirectionsUrl, DRIVING_PROFILE, parseDirectionsBody, redactToken } from "./route.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(HERE, "fixtures", name), "utf8"));

const TOKEN = "pk.test-token-not-a-real-one";

/** UCSD, roughly. Longitude is negative and far outside latitude's range — which is the point. */
const UCSD = { lng: -117.237, lat: 32.8801 };
const LA_JOLLA = { lng: -117.2712, lat: 32.8474 };

describe("buildDirectionsUrl", () => {
  it("puts longitude before latitude in the path", () => {
    const url = buildDirectionsUrl({ pickup: UCSD, dropoff: LA_JOLLA, accessToken: TOKEN });
    assert.ok(
      url.includes("/-117.237,32.8801;-117.2712,32.8474?"),
      `coordinates in the wrong order or format: ${redactToken(url)}`,
    );
  });

  it("routes with live traffic, not the traffic-blind profile", () => {
    const url = buildDirectionsUrl({ pickup: UCSD, dropoff: LA_JOLLA, accessToken: TOKEN });
    assert.ok(url.includes(`/${DRIVING_PROFILE}/`));
    assert.equal(DRIVING_PROFILE, "mapbox/driving-traffic");
  });

  it("asks for a drawable geometry and nothing it doesn't need", () => {
    const url = buildDirectionsUrl({ pickup: UCSD, dropoff: LA_JOLLA, accessToken: TOKEN });
    const params = new URL(url).searchParams;
    assert.equal(params.get("geometries"), "geojson");
    assert.equal(params.get("overview"), "full");
    assert.equal(params.get("steps"), "false");
    assert.equal(params.get("alternatives"), "false");
  });

  // The whole reason assertOnEarth exists. A San Diego pair passed lat-first has a "longitude" of
  // 32.88 (valid!) and a "latitude" of -117.237 (impossible) — so the latitude check is what
  // catches it. Without this, Mapbox would answer with a plausible route somewhere else entirely.
  it("throws when latitude and longitude are swapped", () => {
    const swapped = { lng: UCSD.lat, lat: UCSD.lng };
    assert.throws(
      () => buildDirectionsUrl({ pickup: swapped, dropoff: LA_JOLLA, accessToken: TOKEN }),
      /pickup\.lat must be a latitude within ±90/,
    );
  });

  it("throws on an out-of-range longitude", () => {
    assert.throws(
      () =>
        buildDirectionsUrl({
          pickup: { lng: 181, lat: 32.88 },
          dropoff: LA_JOLLA,
          accessToken: TOKEN,
        }),
      /pickup\.lng must be a longitude within ±180/,
    );
  });

  it("throws on a non-finite coordinate", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () =>
          buildDirectionsUrl({
            pickup: { lng: bad, lat: 32.88 },
            dropoff: LA_JOLLA,
            accessToken: TOKEN,
          }),
        /must be a longitude/,
      );
    }
  });

  it("checks the dropoff too, not just the pickup", () => {
    assert.throws(
      () =>
        buildDirectionsUrl({
          pickup: UCSD,
          dropoff: { lng: -117.27, lat: 91 },
          accessToken: TOKEN,
        }),
      /dropoff\.lat/,
    );
  });

  it("requires a token rather than sending an unauthenticated request", () => {
    assert.throws(
      () => buildDirectionsUrl({ pickup: UCSD, dropoff: LA_JOLLA, accessToken: "" }),
      /accessToken is required/,
    );
  });

  it("rounds coordinates to 6 decimals, so noise past ~11cm can't change the URL", () => {
    const a = buildDirectionsUrl({
      pickup: { lng: -117.23700001, lat: 32.88010004 },
      dropoff: LA_JOLLA,
      accessToken: TOKEN,
    });
    const b = buildDirectionsUrl({ pickup: UCSD, dropoff: LA_JOLLA, accessToken: TOKEN });
    assert.equal(a, b);
  });
});

describe("redactToken", () => {
  it("removes the token from a Directions URL", () => {
    const url = buildDirectionsUrl({ pickup: UCSD, dropoff: LA_JOLLA, accessToken: TOKEN });
    const safe = redactToken(url);
    assert.ok(!safe.includes(TOKEN), "token survived redaction");
    assert.ok(safe.includes("access_token=REDACTED"));
  });

  it("leaves a URL with no token alone", () => {
    const url = "https://api.mapbox.com/directions/v5/mapbox/driving-traffic/0,0;1,1";
    assert.equal(redactToken(url), url);
  });
});

describe("parseDirectionsBody", () => {
  // The assertion this whole file exists for. Mapbox returns floats; quoteFare throws on them.
  it("rounds Mapbox's floats to whole metres and seconds", () => {
    const parsed = parseDirectionsBody(fixture("directions-ok.json"));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    assert.equal(parsed.measurement.distanceMeters, 12346); // from 12345.678
    assert.equal(parsed.measurement.durationSeconds, 1235); //  from 1234.5
    assert.ok(Number.isInteger(parsed.measurement.distanceMeters));
    assert.ok(Number.isInteger(parsed.measurement.durationSeconds));
  });

  it("keeps the route geometry for drawing", () => {
    const parsed = parseDirectionsBody(fixture("directions-ok.json"));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    assert.equal(parsed.measurement.geometry?.type, "LineString");
    assert.equal(parsed.measurement.geometry?.coordinates.length, 4);
    assert.deepEqual(parsed.measurement.geometry?.coordinates[0], [-117.237, 32.8801]);
  });

  // Mapbox reports both of these with HTTP 200. Checking response.ok is not enough, and a body
  // that slips through reaches quoteFare as `undefined` from three files away.
  it("fails on NoRoute, which arrives as HTTP 200", () => {
    const parsed = parseDirectionsBody(fixture("directions-no-route.json"));
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.code, "NoRoute");
  });

  it("fails on NoSegment, which also arrives as HTTP 200", () => {
    const parsed = parseDirectionsBody(fixture("directions-no-segment.json"));
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.code, "NoSegment");
  });

  // "Ok" with nothing to price would otherwise quote the rider a minimum fare for a trip we
  // cannot actually route.
  it("fails when the code is Ok but there are no routes", () => {
    const parsed = parseDirectionsBody({ code: "Ok", routes: [] });
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.code, "NoRoute");
  });

  it("fails on a missing, negative, or non-numeric distance or duration", () => {
    const bodies = [
      { code: "Ok", routes: [{ duration: 600 }] },
      { code: "Ok", routes: [{ distance: 5000 }] },
      { code: "Ok", routes: [{ distance: -1, duration: 600 }] },
      { code: "Ok", routes: [{ distance: 5000, duration: -1 }] },
      { code: "Ok", routes: [{ distance: "5000", duration: 600 }] },
      { code: "Ok", routes: [{ distance: Number.NaN, duration: 600 }] },
      { code: "Ok", routes: [{ distance: 5000, duration: Number.POSITIVE_INFINITY }] },
    ];
    for (const body of bodies) {
      const parsed = parseDirectionsBody(body);
      assert.equal(parsed.ok, false, `should have rejected ${JSON.stringify(body)}`);
    }
  });

  it("fails on a body that isn't a Mapbox response at all", () => {
    for (const body of [null, undefined, "", 42, [], { nope: true }]) {
      const parsed = parseDirectionsBody(body);
      assert.equal(parsed.ok, false, `should have rejected ${JSON.stringify(body)}`);
    }
  });

  it("drops a malformed geometry rather than failing the whole measurement", () => {
    const parsed = parseDirectionsBody({
      code: "Ok",
      routes: [
        {
          distance: 5000,
          duration: 600,
          geometry: { type: "LineString", coordinates: [["a", "b"]] },
        },
      ],
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.measurement.geometry, null);
    assert.equal(parsed.measurement.distanceMeters, 5000);
  });
});

/**
 * The test that says the roadmap's blocker is gone: a Mapbox response, parsed here, priced by
 * `@rido/pricing` without throwing.
 *
 * The card is **synthetic** — invented for this test. Only `packages/pricing`'s seed test is
 * allowed to name real rates, so nothing here can drift from `supabase/seed/fare_rate_cards.sql`
 * or quietly become a second home for the real card.
 */
describe("a parsed measurement is priceable", () => {
  const syntheticCard: FareRateCard = {
    baseCents: 250,
    perMileCents: 111,
    perMinuteCents: 29,
    minimumFareCents: 640,
  };

  it("feeds quoteFare directly, with no conversion at the call site", () => {
    const parsed = parseDirectionsBody(fixture("directions-ok.json"));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const quote = quoteFare({ ...parsed.measurement, rateCard: syntheticCard });

    assert.ok(Number.isInteger(quote.fareCents));
    assert.ok(quote.fareCents >= syntheticCard.minimumFareCents);
    assert.equal(
      quote.breakdown.baseCents + quote.breakdown.distanceCents + quote.breakdown.timeCents,
      quote.fareCents,
    );
  });

  it("would throw if the rounding in parseDirectionsBody were removed", () => {
    // Guards the guard: proves quoteFare really does reject the raw float, so the assertion above
    // is load-bearing rather than incidental.
    assert.throws(
      () =>
        quoteFare({ distanceMeters: 12345.678, durationSeconds: 1235, rateCard: syntheticCard }),
      /must be a non-negative integer/,
    );
  });
});
