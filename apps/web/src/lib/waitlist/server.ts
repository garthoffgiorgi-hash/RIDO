import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeWaitlistEmail, parseWaitlistInterest } from "./validate.ts";
import { failed, type WaitlistResult } from "./result.ts";

/**
 * Pre-launch lead capture (ADR-0028) — an email and a rider/driver/both interest, from a visitor
 * who has no account and never signs in to submit this. There is no `requireUser()` gate here
 * because there is no user to require: every other write in this codebase goes through the
 * service role on behalf of a signed-in caller it has already checked; this is the one write with
 * nobody to check, which is also why `waitlist_signups` carries no RLS policy or grant to `anon`
 * or `authenticated` at all (see the migration's own comment) — the service role, reached only
 * from this file's Server Action bridge, is the entire access path.
 *
 * TEMPORARY: `waitlist_signups` doesn't exist in `database.types.ts` yet — this migration hasn't
 * been pushed to the live project and the types haven't been regenerated against it (the same
 * two-step dance every migration in this repo goes through). Until then, `.from()` is cast past
 * the generated `Database` type rather than widened to `any` — narrower than the old
 * `UntypedTables` bridge PR #41 retired, since this is the only table it needs to reach. Retire
 * this cast in the same follow-up pass that retired the last one, once `npm run types:generate`
 * (or `supabase gen types` against the live project) picks up the new table.
 */
interface WaitlistTable {
  from(table: "waitlist_signups"): {
    insert(row: { email: string; interest: string }): Promise<{ error: { code?: string } | null }>;
  };
}

export async function joinWaitlist(
  rawEmail: string,
  rawInterest: string,
): Promise<WaitlistResult<null>> {
  const email = normalizeWaitlistEmail(rawEmail);
  if (!email) {
    return failed("Enter a valid email address.");
  }

  const interest = parseWaitlistInterest(rawInterest);
  if (!interest) {
    return failed("Choose rider, driver, or both.");
  }

  const service = createServiceRoleClient() as unknown as WaitlistTable;
  const { error } = await service.from("waitlist_signups").insert({ email, interest });

  if (error) {
    // 23505 = unique_violation on the email constraint — resubmitting is not a failure from the
    // visitor's side; they're already on the list, which is exactly what they asked for.
    if (error.code === "23505") {
      return { ok: true, data: null };
    }
    return failed("We couldn't add you to the waitlist. Try again in a moment.");
  }

  return { ok: true, data: null };
}
