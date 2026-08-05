import "server-only";

/**
 * Server-side Supabase clients. This module is the ONLY place the service-role key may be read.
 *
 * The `server-only` import above makes it a build error for a client component to reach this
 * file — that is the enforcement, not a convention. Browser-safe access goes through
 * ./client.ts with the anon key and RLS.
 */

/** Request-scoped client carrying the caller's session. Subject to RLS. Use this by default. */
export function createServerClient() {
  throw new Error("not implemented");
}

/**
 * Service-role client. Bypasses RLS entirely — it is the one caller allowed to write commission
 * columns. Reach for it only when an operation genuinely cannot run as the user, and never in
 * anything reachable from a route a browser can call without authorization.
 */
export function createServiceRoleClient() {
  throw new Error("not implemented");
}
