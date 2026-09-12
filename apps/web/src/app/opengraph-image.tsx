import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * The default social-preview card for every page that doesn't override it (Next's file
 * convention auto-generates the og:image/twitter:image tags — no manual linking, same mechanism
 * as icon.png/apple-icon.png/manifest.ts). Embeds the app's real Sora font as a bundled asset
 * rather than fetching one at request time — a lesson from the Home Screen icon, whose first cut
 * silently rendered in a fallback system font because the render environment's network path to
 * Google Fonts wasn't reliable. Read via `node:fs`, which needs the Node runtime rather than the
 * default Edge one — `fetch(new URL(..., import.meta.url))` (the usual Edge-friendly pattern for
 * a bundled asset) isn't implemented for file:// URLs under Turbopack yet. Plain `.woff`, not the
 * `.woff2` `next/font/google` ships to real browsers — Satori (this renderer) can't parse WOFF2.
 */
export const runtime = "nodejs";
export const alt = "rido — the fair way to move";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const sora = await readFile(path.join(process.cwd(), "src/app/sora-800.woff"));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0b2a5b",
      }}
    >
      <div style={{ display: "flex", fontFamily: "Sora", fontWeight: 800, fontSize: 140 }}>
        <span style={{ color: "#ffffff" }}>r</span>
        <span style={{ color: "#2a5bff" }}>i</span>
        <span style={{ color: "#ffffff" }}>do</span>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontFamily: "Sora",
          fontWeight: 800,
          fontSize: 34,
          color: "#ffffff",
          opacity: 0.75,
        }}
      >
        The fair way to move.
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: "Sora", data: sora, style: "normal", weight: 800 }],
    },
  );
}
