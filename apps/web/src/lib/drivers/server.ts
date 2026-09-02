import "server-only";

import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/server";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import { type DriversResult, failed } from "./result.ts";
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
  // The cast covers `accepting_rides` only, which the generated types predate — see the note on
  // `DriverProfile`. `select("*")` already returns the column; TypeScript just can't see it yet.
  return data as DriverProfile | null;
}

/**
 * Turns this driver's availability on or off — the app's only write to `drivers`, and the only
 * write anywhere in `src/lib/` that goes through the **RLS-scoped client** rather than the service
 * role.
 *
 * That is the point, not an oversight. `accepting_rides` sits in the column-level UPDATE grant
 * `20260821120200_create_drivers.sql` created for facts a driver owns about themselves, so the
 * database itself guarantees a driver can only ever flip their own flag — even if this function is
 * later refactored and forgets to scope its `where`. ADR-0019 states the rule it follows: one
 * writer forever → column grant; possibly-many writers → service role.
 *
 * **The `.select()` is load-bearing.** An UPDATE that RLS refuses is not an error through
 * PostgREST — it comes back `204 No Content` with `data: null, error: null`, indistinguishable
 * from success. Without reading rows back, a refused write would report `ok` and the UI would flip
 * to Online while the database stayed Offline. `acceptRide()` guards the same shape the same way.
 */
export async function setAcceptingRides(accepting: boolean): Promise<DriversResult<boolean>> {
  const user = await requireUser();
  const supabase = await createServerClient();

  // Cast for the same one-column reason as above; the runtime payload is a plain boolean.
  const patch = { accepting_rides: accepting } as Database["public"]["Tables"]["drivers"]["Update"];

  const { data, error } = await supabase
    .from("drivers")
    .update(patch)
    .eq("auth_user_id", user.id)
    .select("id");

  if (error) {
    // 42501 is a missing column privilege — the grant is wrong, not the caller. Kept distinct
    // because it means a migration didn't land, and it should not read as a transient blip.
    if (error.code === "42501") {
      return failed("Availability isn't writable on this deployment. This one's ours to fix.");
    }
    return failed("We couldn't update your availability. Try again in a moment.");
  }

  if (!data || data.length === 0) {
    return failed("You don't have a driver profile yet.");
  }

  return { ok: true, data: accepting };
}
