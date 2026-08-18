import "server-only";

import type { EmailOtpType } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { authErrorMessage } from "./errors";
import { type AuthResult, failed, succeeded } from "./result";

/**
 * Server-side auth operations: reading the session, completing an email link, signing out.
 *
 * `server-only` above means a client component importing this file is a build error, not a
 * review catch. The browser half is ./browser.ts.
 */

/** The signed-in user, or `null`. Reads the session cookie — safe in any Server Component. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * The signed-in user, or a redirect to `/login`. Use this to gate a route — it never returns
 * `null`, so callers don't branch on a case that should have been a redirect.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Exchanges the `token_hash` from an emailed link for a session. Every email-link flow — sign-up
 * confirmation and sign-in link alike — completes here.
 */
export async function completeEmailLink(
  tokenHash: string,
  type: EmailOtpType,
): Promise<AuthResult> {
  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  return error ? failed(authErrorMessage(error.message)) : succeeded;
}

export async function signOut(): Promise<void> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
}
