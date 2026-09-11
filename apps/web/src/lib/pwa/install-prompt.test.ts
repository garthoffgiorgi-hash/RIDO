import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { detectPlatform, installPromptVariant, type InstallPromptState } from "./install-prompt.ts";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const OLD_IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 12_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

describe("detectPlatform", () => {
  it("reads a literal iPhone user agent as ios", () => {
    assert.equal(
      detectPlatform({ userAgent: IPHONE_UA, platform: "iPhone", maxTouchPoints: 5 }),
      "ios",
    );
  });

  it("reads a pre-iOS-13 iPad, which still says 'iPad' in its own UA, as ios", () => {
    assert.equal(
      detectPlatform({ userAgent: OLD_IPAD_UA, platform: "iPad", maxTouchPoints: 5 }),
      "ios",
    );
  });

  it("reads an Android Chrome user agent as android", () => {
    assert.equal(
      detectPlatform({ userAgent: ANDROID_UA, platform: "Linux armv8l", maxTouchPoints: 5 }),
      "android",
    );
  });

  it("reads desktop Chrome as other", () => {
    assert.equal(
      detectPlatform({ userAgent: DESKTOP_CHROME_UA, platform: "MacIntel", maxTouchPoints: 0 }),
      "other",
    );
  });

  // iPadOS 13+ spoofs desktop Safari's own UA verbatim — no "iPad" anywhere in it. A touch-capable
  // "MacIntel" is what tells the two apart.
  it("reads a modern iPad spoofing desktop Safari as ios, via the touch-point heuristic", () => {
    assert.equal(
      detectPlatform({ userAgent: DESKTOP_CHROME_UA, platform: "MacIntel", maxTouchPoints: 5 }),
      "ios",
    );
  });

  it("does not mistake a real Mac (0 touch points) for a spoofed iPad", () => {
    assert.equal(
      detectPlatform({ userAgent: DESKTOP_CHROME_UA, platform: "MacIntel", maxTouchPoints: 0 }),
      "other",
    );
  });
});

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
