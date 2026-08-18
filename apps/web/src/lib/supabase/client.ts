import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

/**
 * Browser-side Supabase client. Anon key only — subject to RLS, safe to ship to a browser.
 * Never import the service-role client (./server.ts) here or anywhere reachable from a client
 * component.
 */

/** Client-side singleton, subject to RLS. Use in Client Components. */
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (process.env.NODE_ENV !== "production") warnIfMisconfigured(url, anonKey);

  return createSupabaseBrowserClient<Database>(url, anonKey);
}

/**
 * A malformed project URL doesn't fail as a config error — it fails as `Failed to fetch` at the
 * first auth call, which reads like a network problem and sends you looking in the wrong place.
 * Warns rather than throws: throwing here would leave a submit handler hung mid-request.
 */
function warnIfMisconfigured(url: string, anonKey: string) {
  const problems: string[] = [];

  if (!url) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL is empty or missing.");
  } else if (!/^https:\/\/[^/\s]+\.supabase\.(co|in)\/?$/.test(url.trim())) {
    problems.push(
      `NEXT_PUBLIC_SUPABASE_URL doesn't look like a project URL: ${JSON.stringify(url)}. ` +
        "Expected https://<project-ref>.supabase.co (Settings -> API -> Project URL).",
    );
  } else if (url !== url.trim()) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL has leading or trailing whitespace.");
  }

  if (!anonKey) {
    problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is empty or missing.");
  }

  if (problems.length) {
    console.error(`[supabase] Check apps/web/.env.local:\n  - ${problems.join("\n  - ")}`);
  }
}
