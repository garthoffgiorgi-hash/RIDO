/**
 * The install-banner decision (ADR-0027). Pure — takes what the browser already told the caller,
 * decides nothing about how to read it, so it's testable without a DOM.
 *
 * `detectPlatform` exists because the two platforms need genuinely different UI: iOS exposes no
 * API to trigger "Add to Home Screen" programmatically, so it only ever gets instructions;
 * Android can fire a real `beforeinstallprompt` for a one-tap button. iPadOS 13+ reports as
 * desktop Safari with no "iPad" anywhere in the user agent — `maxTouchPoints` on a `MacIntel`
 * platform string is the standard way to still catch it (a real Mac with a mouse reports 0).
 */
export type Platform = "ios" | "android" | "other";

export interface PlatformSignals {
  readonly userAgent: string;
  readonly platform: string; // navigator.platform, e.g. "MacIntel", "Linux armv8l"
  readonly maxTouchPoints: number; // navigator.maxTouchPoints
}

export function detectPlatform(signals: PlatformSignals): Platform {
  const isIOSUserAgent = /iPhone|iPad|iPod/.test(signals.userAgent);
  const isSpoofedIPad = signals.platform === "MacIntel" && signals.maxTouchPoints > 1;
  if (isIOSUserAgent || isSpoofedIPad) return "ios";
  if (/Android/.test(signals.userAgent)) return "android";
  return "other";
}

export type InstallPromptVariant = "none" | "ios-instructions" | "android-install";

export interface InstallPromptState {
  readonly platform: Platform;
  readonly isStandalone: boolean;
  readonly hasInstallEvent: boolean;
  readonly dismissed: boolean;
}

/**
 * Which variant of the banner to show, if any. Standalone (already installed) and an explicit
 * past dismissal both win outright, over every other signal. `android` with no captured install
 * event covers both "the event hasn't arrived yet" and browsers that never fire it at all
 * (Firefox for Android) — either way, there is nothing to offer a real button for yet.
 */
export function installPromptVariant(state: InstallPromptState): InstallPromptVariant {
  if (state.isStandalone || state.dismissed) return "none";
  if (state.platform === "ios") return "ios-instructions";
  if (state.platform === "android" && state.hasInstallEvent) return "android-install";
  return "none"; // covers desktop Chrome, which also fires beforeinstallprompt but isn't mobile
}
