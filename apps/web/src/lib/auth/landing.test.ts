import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { landingPath, rideSignalsOrNone } from "./landing.ts";

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

describe("rideSignalsOrNone", () => {
  it("passes a successful read straight through", async () => {
    const signals = await rideSignalsOrNone(async () => ({
      hasDriverRide: true,
      hasRiderRide: false,
    }));
    assert.deepEqual(signals, { hasDriverRide: true, hasRiderRide: false });
  });

  // The guard this whole function exists for. Its caller is a Route Handler, which app/error.tsx
  // does not cover, so an unguarded throw here is a raw 500 on every sign-in. If someone removes
  // the try/catch, this test is what rejects it.
  it("does not throw when the ride check fails — it degrades", async () => {
    const signals = await rideSignalsOrNone(async () => {
      throw new Error("hasActiveRiderRide: could not check for an active ride — network down");
    });
    assert.deepEqual(signals, { hasDriverRide: false, hasRiderRide: false });
  });

  it("degrades to /account, and an explicit next still wins over the degrade", () => {
    const degraded = { hasDriverRide: false, hasRiderRide: false };
    assert.equal(landingPath({ explicitNext: null, ...degraded }), "/account");
    assert.equal(landingPath({ explicitNext: "/drive", ...degraded }), "/drive");
  });

  it("degrades on a rejected promise, not only a synchronous throw", async () => {
    const signals = await rideSignalsOrNone(() => Promise.reject(new Error("connection reset")));
    assert.deepEqual(signals, { hasDriverRide: false, hasRiderRide: false });
  });
});
