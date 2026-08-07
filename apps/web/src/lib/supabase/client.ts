/**
 * Browser-side Supabase client. Anon key only — subject to RLS, safe to ship to a browser.
 * Never import the service-role client (./server.ts) here or anywhere reachable from a client
 * component.
 */

/** Client-side singleton, subject to RLS. Use in Client Components. */
export function createBrowserClient() {
  throw new Error("not implemented");
}
