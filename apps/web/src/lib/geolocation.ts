import type { Coordinates } from "@/lib/maps/types.ts";

/**
 * The driver's own one-shot position fix — the first thing in this codebase to touch
 * `navigator.geolocation`. One fix per ride view, not continuous tracking (confirmed with the
 * user while planning driver navigation): a driver opens `/drive` on an active ride, this runs
 * once, and the marker it produces holds still for the rest of that visit. Continuous tracking
 * would need camera rework in `map.ts`'s `fitToRoute()`, which currently re-fits on every prop
 * change — harmless here precisely because it only ever fires once.
 *
 * Split the way `src/lib/maps/errors.ts` is: a pure `code -> RIDO voice` translator, tested
 * without a browser, and a thin wrapper that is the only thing that actually calls the browser
 * API. Permission denial is an ordinary state here, not a thrown error — a driver who says no
 * still has a working Navigate button, just no map.
 */

/**
 * `GeolocationPositionError.code` is `1 | 2 | 3` at runtime (`PERMISSION_DENIED` /
 * `POSITION_UNAVAILABLE` / `TIMEOUT`), but `lib.dom.d.ts` types the field as a plain `number` —
 * this takes the whole numeric range rather than a literal union, because the type can't promise
 * more than the browser does. Any other value falls through to the generic message.
 */
export function geolocationErrorMessage(code: number): string {
  switch (code) {
    case 1: // PERMISSION_DENIED
      return "Location access is off. Turn it on for this site to see yourself on the map.";
    case 2: // POSITION_UNAVAILABLE
      return "We couldn't work out where you are right now.";
    case 3: // TIMEOUT
      return "Finding your location took too long. Try again.";
    default:
      return "We couldn't get your location.";
  }
}

export type GeolocationResult =
  | { readonly ok: true; readonly data: Coordinates }
  | { readonly ok: false; readonly message: string };

/**
 * Well past a GPS fix's normal time and well inside what a driver will wait before giving up on
 * ever seeing the dot — same reasoning as `maps/server.ts`'s `TIMEOUT_MS` for a Directions call.
 */
const TIMEOUT_MS = 8_000;

/**
 * Resolves with the device's current position, or a failure already in RIDO's voice. Never
 * throws and never rejects — a caller awaits this like any other result-returning call in this
 * codebase.
 *
 * `navigator.geolocation` being entirely absent (a very old browser, or a non-secure context
 * that never exposes it) is reported the same way as a permission denial: the caller can't tell
 * the two apart, and doesn't need to — either way there's no fix to draw, and the rest of the
 * panel must keep working without one.
 */
export function getCurrentPosition(): Promise<GeolocationResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ok: false, message: "This browser can't share your location." });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          data: { lat: position.coords.latitude, lng: position.coords.longitude },
        });
      },
      (error) => {
        resolve({ ok: false, message: geolocationErrorMessage(error.code) });
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 },
    );
  });
}
