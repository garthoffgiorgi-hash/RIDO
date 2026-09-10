import type { MetadataRoute } from "next";

/**
 * App Router's convention file — Next builds `/robots.txt` from this at request time. No
 * `public/` directory exists in this repo yet; this is the first thing to want one.
 *
 * Disallows everything that isn't a marketing page: `/login`, `/signup`, `/account`, `/request`,
 * `/drive` are all auth-gated and have nothing for a crawler to index; `/api/`, `/auth/`, `/dev/`
 * are never content. `NEXT_PUBLIC_SITE_URL` falls back to localhost so this renders in dev without
 * the var set — see `docs/architecture/deployment.md`.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/about", "/drivers", "/privacy", "/terms"],
      disallow: ["/login", "/signup", "/account", "/request", "/drive", "/api", "/auth", "/dev"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
