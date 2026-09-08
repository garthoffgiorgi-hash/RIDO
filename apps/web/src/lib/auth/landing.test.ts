import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { landingPath } from "./landing.ts";

const NONE = { explicitNext: null, hasDriverRide: false, hasRiderRide: false };

describe("landingPath", () => {
  it("lands on /account when nothing is happening", () => {
    assert.equal(landingPath(NONE), "/account");
  });

  it("lands on /drive when the driver side has a live ride", () => {
    assert.equal(landingPath({ ...NONE, hasDriverRide: true }), "/drive");
  });

  it("lands on /request when the rider side has a live ride", () => {
    assert.equal(landingPath({ ...NONE, hasRiderRide: true }), "/request");
  });

  it("prefers the driver side when both are live at once", () => {
    assert.equal(landingPath({ ...NONE, hasDriverRide: true, hasRiderRide: true }), "/drive");
  });

  it("an explicit next overrides an idle account", () => {
    assert.equal(landingPath({ ...NONE, explicitNext: "/some/page" }), "/some/page");
  });

  it("an explicit next overrides even both rides being live", () => {
    assert.equal(
      landingPath({ explicitNext: "/some/page", hasDriverRide: true, hasRiderRide: true }),
      "/some/page",
    );
  });

  it("a null explicitNext (never a rejected string) is what falls through to the ride check", () => {
    // landingPath trusts its caller to have already turned an invalid `next` into null via
    // validNext() — it does not re-validate a string. This is the contract that test proves:
    // an object that never contains a rejected raw value still exercises the fall-through path.
    assert.equal(
      landingPath({ explicitNext: null, hasDriverRide: true, hasRiderRide: false }),
      "/drive",
    );
  });
});
