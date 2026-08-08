import "server-only";

import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";

/**
 * Server-side Supabase clients. This module is the ONLY place the service-role key may be read.
 *
 * The `server-only` import above makes it a build error for a client component to reach this
 * file — that is the enforcement, not a convention. Browser-safe access goes through
 * ./client.ts with the anon key and RLS.
 */

/** Request-scoped client carrying the caller's session. Subject to RLS. Use this by default. */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, which can't write cookies — middleware.ts
            // refreshes and persists the session instead. Safe to ignore here.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS entirely — it is the one caller allowed to write commission
 * columns. Reach for it only when an operation genuinely cannot run as the user, and never in
 * anything reachable from a route a browser can call without authorization.
 */
export function createServiceRoleClient() {
  return createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
