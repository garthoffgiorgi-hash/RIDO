import type { MetadataRoute } from "next";

/**
 * App Router's convention file — Next builds `/manifest.webmanifest` from this and auto-injects
 * `<link rel="manifest">`, the same mechanism `robots.ts`/`sitemap.ts` use for their own tags. No
 * manual link anywhere.
 *
 * `icons` points at `icon.png`/`apple-icon.png` (siblings of this file) rather than adding
 * duplicate assets under a new `public/` — both already serve at clean, unsuffixed paths since
 * they live directly under `src/app/`, not inside a route group.
 *
 * `background_color`/`theme_color` are the one place these brand hexes must be literal: this is
 * a data-returning function with no Tailwind class mechanism reaching it, so `globals.css`'s
 * `@theme` block (`--color-ivory`/`--color-midnight`) is the source of truth to keep them in sync
 * with — the same class of exception as `src/lib/maps/map.ts`'s `--color-midnight` read and
 * `layout.tsx`'s `viewport.themeColor`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "rido",
    short_name: "rido",
    description: "The fair way to move.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f5ef", // Ivory
    theme_color: "#0b2a5b", // Midnight
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
