import type { MetadataRoute } from "next";

/**
 * App Router's convention file — Next builds `/sitemap.xml` from this. Only the four real
 * marketing pages: everything else is auth-gated, has nothing to index, and is already excluded
 * in `./robots.ts`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return ["", "/about", "/drivers", "/privacy", "/terms"].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
  }));
}
