import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { installPromptVariant, type InstallPromptState } from "./install-prompt.ts";

const baseState: InstallPromptState = {
  platform: "other",
  isStandalone: false,
  hasInstallEvent: false,
  dismissed: false,
};

describe("installPromptVariant", () => {
  it("shows nothing once already installed, even on iOS with nothing else dismissed", () => {
    const decision = installPromptVariant({ ...baseState, platform: "ios", isStandalone: true });
    assert.equal(decision, "none");
  });

  it("shows nothing once dismissed, even with a live Android install event ready", () => {
    const decision = installPromptVariant({
      ...baseState,
      platform: "android",
      hasInstallEvent: true,
      dismissed: true,
    });
    assert.equal(decision, "none");
  });

  it("shows the iOS instructions regardless of whether an install event happens to exist", () => {
    assert.equal(installPromptVariant({ ...baseState, platform: "ios" }), "ios-instructions");
    assert.equal(
      installPromptVariant({ ...baseState, platform: "ios", hasInstallEvent: true }),
      "ios-instructions",
    );
  });

  it("shows the real Android button once an install event has been captured", () => {
    const decision = installPromptVariant({
      ...baseState,
      platform: "android",
      hasInstallEvent: true,
    });
    assert.equal(decision, "android-install");
  });

  it("shows nothing on Android before an install event arrives (or on a browser that never fires one)", () => {
    const decision = installPromptVariant({ ...baseState, platform: "android" });
    assert.equal(decision, "none");
  });

  // Desktop Chrome fires beforeinstallprompt too — this is the case most likely to get the
  // platform check backwards, since it's tempting to gate only on hasInstallEvent.
  it("shows nothing on a non-mobile platform even with a captured install event", () => {
    const decision = installPromptVariant({
      ...baseState,
      platform: "other",
      hasInstallEvent: true,
    });
    assert.equal(decision, "none");
  });
});
