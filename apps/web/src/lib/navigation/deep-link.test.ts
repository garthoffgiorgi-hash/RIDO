import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { buildNavigationUrl } from "./deep-link.ts";

const sanDiego = { lng: -117.2378, lat: 32.8811 };

describe("buildNavigationUrl", () => {
  it("sends iOS to Apple Maps", () => {
    const url = buildNavigationUrl({ coordinates: sanDiego, address: null }, "ios");
    assert.match(url ?? "", /^https:\/\/maps\.apple\.com\/\?daddr=/);
  });

  it("sends Android to Google Maps", () => {
    const url = buildNavigationUrl({ coordinates: sanDiego, address: null }, "android");
    assert.match(url ?? "", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
  });

  it("sends everything else (desktop, etc.) to Google Maps too", () => {
    const url = buildNavigationUrl({ coordinates: sanDiego, address: null }, "other");
    assert.match(url ?? "", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
  });

  // The order every mapping URL wants is lat,lng — the reverse of Coordinates' own lng-first
  // field order. Get this backwards silently and a driver is sent across the world.
  it("writes the coordinate as lat,lng in the URL, not lng,lat", () => {
    const url = buildNavigationUrl({ coordinates: sanDiego, address: null }, "ios");
    const decoded = decodeURIComponent(url ?? "");
    assert.ok(decoded.includes(`daddr=${sanDiego.lat},${sanDiego.lng}`));
  });

  it("prefers the coordinate over the address when both are present", () => {
    const url = buildNavigationUrl(
      { coordinates: sanDiego, address: "9500 Gilman Dr, La Jolla, CA" },
      "ios",
    );
    const decoded = decodeURIComponent(url ?? "");
    assert.ok(decoded.includes(String(sanDiego.lat)));
    assert.ok(!decoded.includes("Gilman"));
  });

  // What makes navigation still work for a ride booked before ADR-0029's flag was ever on.
  it("falls back to the address when there is no coordinate", () => {
    const url = buildNavigationUrl(
      { coordinates: null, address: "9500 Gilman Dr, La Jolla, CA" },
      "android",
    );
    const decoded = decodeURIComponent(url ?? "");
    assert.ok(decoded.includes("9500 Gilman Dr"));
  });

  it("URL-encodes an address with spaces and commas", () => {
    const url = buildNavigationUrl(
      { coordinates: null, address: "9500 Gilman Dr, La Jolla, CA" },
      "android",
    );
    assert.ok(!(url ?? "").includes(" "));
    assert.ok((url ?? "").includes("%2C")); // an encoded comma
  });

  it("returns null when there is neither a coordinate nor an address", () => {
    assert.equal(buildNavigationUrl({ coordinates: null, address: null }, "ios"), null);
  });

  it("uses https universal links, never a custom scheme", () => {
    const url = buildNavigationUrl({ coordinates: sanDiego, address: null }, "ios") ?? "";
    assert.ok(url.startsWith("https://"));
  });
});
