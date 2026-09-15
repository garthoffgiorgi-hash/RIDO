import type { Coordinates } from "@/lib/maps/types.ts";
import type { Platform } from "@/lib/platform.ts";

/**
 * Hands a driver off to Apple or Google Maps for real turn-by-turn navigation — RIDO renders a
 * preview, never in-house turn-by-turn (neither Uber nor Lyft's drivers get one either).
 *
 * `https://` universal links, deliberately not a custom scheme (`maps://`, `comgooglemaps://`):
 * a universal link degrades to the provider's own website when the app isn't installed, so a tap
 * always does something. A custom scheme with no app to catch it is a dead tap.
 *
 * iOS gets Apple Maps because it's guaranteed present on every iPhone; everything else gets
 * Google Maps, whose web fallback works everywhere regardless of what's actually installed.
 */

export interface NavigationDestination {
  /** Preferred when present — exact, and never the routed estimate (ADR-0011's own rule for why
   *  a coordinate here is display/navigation-only, never priced from). */
  readonly coordinates: Coordinates | null;
  /** What every ride has today unless ADR-0029's flag was on and the geocode succeeded. */
  readonly address: string | null;
}

/**
 * `lat,lng` — the order every mapping *URL* wants, and the reverse of `Coordinates`' own
 * lng-first field order (`route.ts`'s "the classic bug" applies here too: get this backwards and
 * a San Diego destination becomes a plausible-looking point in the wrong hemisphere).
 */
function formatLatLng(point: Coordinates): string {
  return `${point.lat},${point.lng}`;
}

/** The `daddr`/`destination` query value: the coordinate when there is one, else the address. */
function destinationParam(destination: NavigationDestination): string | null {
  if (destination.coordinates) return formatLatLng(destination.coordinates);
  return destination.address;
}

/**
 * The URL to open, or `null` when there is nothing to navigate to at all — a ride with neither a
 * coordinate nor an address, which a caller should treat as "no Navigate button", not a broken
 * link.
 */
export function buildNavigationUrl(
  destination: NavigationDestination,
  platform: Platform,
): string | null {
  const param = destinationParam(destination);
  if (!param) return null;

  const encoded = encodeURIComponent(param);
  return platform === "ios"
    ? `https://maps.apple.com/?daddr=${encoded}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}
