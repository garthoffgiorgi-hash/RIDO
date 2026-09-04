import "server-only";

import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/server";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase/server";
import { failed, type RidersResult } from "./result.ts";

/**
 * Who a rider is, the thing RIDO had never asked for until ADR-0022. Split from
 * `src/lib/auth/`, matching `src/lib/drivers/`'s own separation from it: whether a signed-in user
 * IS a rider isn't an auth question, it's a profile one.
 */

/**
 * `rider_profiles` (20260904120000) postdates the generated types — the same class of gap
 * `src/lib/rides/server.ts` documents for the same migration set. Delete this the same way once
 * `npm run types:generate` runs against it. Cast at the call site only, never a whole client.
 */
type UntypedTables = {
  // biome-ignore lint/suspicious/noExplicitAny: the generated types predate rider_profiles
  from: (table: string) => any;
};

export interface RiderProfile {
  readonly rider_id: string;
  readonly display_name: string | null;
  readonly phone: string | null;
  readonly avatar_url: string | null;
  readonly rating_count: number;
  readonly rating_sum: number;
  readonly created_at: string;
  readonly updated_at: string;
}

const PROFILE_COLUMNS =
  "rider_id, display_name, phone, avatar_url, rating_count, rating_sum, created_at, updated_at";

/**
 * The signed-in user's own `rider_profiles` row, or `null` if one has never been created.
 *
 * Reads through the RLS-scoped client, not the service role: `rider_profiles_select_own` already
 * permits a user to read their own row. Unlike `getOwnDriverProfile()`, a `null` here is ordinary —
 * a rider who has never booked or visited `/account` since ADR-0022 shipped has no row yet, and
 * that is not an error.
 */
export async function getOwnRiderProfile(user: User): Promise<RiderProfile | null> {
  const supabase = (await createServerClient()) as unknown as UntypedTables;
  const { data, error } = await supabase
    .from("rider_profiles")
    .select(PROFILE_COLUMNS)
    .eq("rider_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`getOwnRiderProfile: could not load rider profile — ${error.message}`);
  }
  return data as RiderProfile | null;
}

/**
 * Gets or creates the signed-in rider's profile, seeding `display_name` from the sign-up form's
 * `options.data.display_name` (`src/lib/auth/browser.ts`) the first time this runs for them.
 *
 * **Never overwrites an existing row.** A rider who has since renamed themselves via
 * `setDisplayName()` must not have that name silently reverted to whatever they typed at sign-up
 * six months ago — the same "check, then create, never clobber" shape `startCardSetup()`
 * (`src/lib/payments/server.ts`) already uses for `rider_payment_profiles`.
 *
 * Called from `requestRide()` at booking time (so every rider a driver might carry has a row by
 * the time that driver looks) and from `/account` on load (so a rider who never books still gets
 * one the first time they visit).
 */
export async function ensureRiderProfile(user: User): Promise<RidersResult<RiderProfile>> {
  const service = createServiceRoleClient() as unknown as UntypedTables;

  const { data: existing } = await service
    .from("rider_profiles")
    .select(PROFILE_COLUMNS)
    .eq("rider_id", user.id)
    .maybeSingle();

  if (existing) return { ok: true, data: existing as RiderProfile };

  const metadataName = user.user_metadata?.display_name;
  const displayName =
    typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : null;

  const { data: created, error } = await service
    .from("rider_profiles")
    .insert({ rider_id: user.id, display_name: displayName })
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (error) {
    // A race with a concurrent ensure (two tabs loading /account at once) hits the primary key —
    // re-read rather than surfacing a conflict the caller never asked about.
    if (error.code === "23505") {
      const { data: retried } = await service
        .from("rider_profiles")
        .select(PROFILE_COLUMNS)
        .eq("rider_id", user.id)
        .maybeSingle();
      if (retried) return { ok: true, data: retried as RiderProfile };
    }
    return failed("We couldn't set up your rider profile. Try again in a moment.");
  }
  if (!created) {
    return failed("We couldn't set up your rider profile. Try again in a moment.");
  }

  return { ok: true, data: created as RiderProfile };
}

/**
 * Renames the signed-in rider. Ensures a row exists first — `rider_profiles_update_own`'s
 * `USING`/`WITH CHECK` only scope *which* row an update may touch, not guarantee one exists to
 * touch, so a rider with no row yet would otherwise see this UPDATE affect zero rows.
 *
 * **The `.select()` is load-bearing**, matching `setAcceptingRides()`'s own comment on this exact
 * trap: an UPDATE RLS refuses comes back `204 No Content` through PostgREST — indistinguishable
 * from success without reading a row back.
 */
export async function setDisplayName(name: string): Promise<RidersResult<null>> {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) {
    return failed("Enter a name.");
  }

  const ensured = await ensureRiderProfile(user);
  if (!ensured.ok) return ensured;

  const supabase = (await createServerClient()) as unknown as UntypedTables;
  const { data, error } = await supabase
    .from("rider_profiles")
    .update({ display_name: trimmed })
    .eq("rider_id", user.id)
    .select("rider_id");

  if (error) {
    return failed("We couldn't save your name. Try again in a moment.");
  }
  if (!data || data.length === 0) {
    return failed("We couldn't save your name. Try again in a moment.");
  }

  return { ok: true, data: null };
}
