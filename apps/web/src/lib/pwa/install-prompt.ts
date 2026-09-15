import type { Platform } from "@/lib/platform.ts";

/**
 * The install-banner decision (ADR-0027). Pure — takes what the browser already told the caller,
 * decides nothing about how to read it, so it's testable without a DOM.
 *
 * `Platform`/`detectPlatform` moved to `src/lib/platform.ts` once driver navigation needed the
 * identical iOS-vs-Android distinction for a different reason — the two platforms need genuinely
 * different UI here too: iOS exposes no API to trigger "Add to Home Screen" programmatically, so
 * it only ever gets instructions; Android can fire a real `beforeinstallprompt` for a one-tap
 * button.
 */
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
