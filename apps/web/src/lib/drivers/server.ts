import "server-only";

import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type { DriverProfile } from "./status.ts";

/**
 * The signed-in user's own `drivers` row, or `null` if they've never applied to drive.
 *
 * Takes the already-resolved `User` rather than reading the session itself — every call site
 * already has one from `requireUser()`, so this avoids a second round trip to re-derive it.
 *
 * Reads through the RLS-scoped client, not the service role: `drivers_select_own` already
 * permits a user to read their own row, so there is nothing here that needs bypassing RLS for.
 */
export async function getOwnDriverProfile(user: User): Promise<DriverProfile | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`getOwnDriverProfile: could not load driver row — ${error.message}`);
  }
  return data;
}
