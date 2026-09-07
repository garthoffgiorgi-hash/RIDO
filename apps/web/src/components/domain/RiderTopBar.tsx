import { AppTopBar } from "./AppTopBar";

/**
 * The thin in-product bar the rider blueprint asks for — "minimal chrome, white or ivory"
 * (`brand/design-system.md:79`) — distinct from `MarketingNav`, which is marketing-specific (three
 * nav links, a CTA switched by pathname) and explicitly wrong over a full-bleed map.
 *
 * Floats above the map rather than claiming a fixed height of layout space, and sits above the
 * sheet's dim backdrop (`z-50`, matching `Sheet`'s panel) — the map is meant to read as
 * backgrounded while a sheet shows over it (`design-system.md:80`), but this bar is navigation
 * chrome, not part of that background, and stays legible regardless. A thin wrapper over
 * `AppTopBar` — same fixed/blur treatment and the same single Account link as before it existed.
 */
export function RiderTopBar() {
  return <AppTopBar links={[{ href: "/account", label: "Account" }]} fixed />;
}
