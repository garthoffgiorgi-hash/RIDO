/**
 * Which device a visitor is on, from signals the browser already exposes. Pure — no DOM, no
 * `navigator` reference — so it's testable without a browser and reusable anywhere device
 * behavior genuinely differs, not just where it was first needed.
 *
 * Originally lived in `src/lib/pwa/install-prompt.ts`, because the install banner needed it
 * first — iOS exposes no API to trigger "Add to Home Screen" programmatically, so it only ever
 * gets instructions, while Android can fire a real `beforeinstallprompt`. Moved here once driver
 * navigation needed the identical distinction for a different reason (which maps app a deep link
 * should open) — device detection isn't a PWA concern, and a second copy would have been the
 * first place the two silently drifted.
 *
 * iPadOS 13+ reports as desktop Safari with no "iPad" anywhere in the user agent —
 * `maxTouchPoints` on a `MacIntel` platform string is the standard way to still catch it (a real
 * Mac with a mouse reports 0).
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
