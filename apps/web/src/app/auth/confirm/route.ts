import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Exchanges the `token_hash` from a Supabase auth email for a session cookie.
 *
 * Required for every email-link flow — magic-link sign-in and signup confirmation both land
 * here. Without this route the link does nothing and the user stays silently logged out, which
 * is exactly the gap the auth audit found.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // `next` comes from the URL, so it is attacker-controllable. Only same-origin relative paths
  // are allowed — "//evil.com" is protocol-relative and would otherwise leave the site.
  const requestedNext = searchParams.get("next") ?? "/account";
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/account";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
