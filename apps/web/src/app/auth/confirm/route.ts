import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { completeEmailLink } from "@/lib/auth/server";

/**
 * Where every emailed auth link lands. Supabase's own templates must be pointed here — their
 * default destination is Supabase's hosted page, which never establishes a session in this app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  const result = await completeEmailLink(tokenHash, type);
  if (!result.ok) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  return NextResponse.redirect(`${origin}${safeNext(searchParams.get("next"))}`);
}

/**
 * `next` is attacker-controllable — it arrives in a URL anyone can craft and send. Only
 * same-origin relative paths are honoured, so a verified session can't be bounced off-site.
 * A leading `//` is rejected because browsers read it as protocol-relative and absolute.
 */
function safeNext(requested: string | null): string {
  if (!requested) return "/account";
  return requested.startsWith("/") && !requested.startsWith("//") ? requested : "/account";
}
