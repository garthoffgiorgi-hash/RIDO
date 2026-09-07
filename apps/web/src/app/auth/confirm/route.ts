import { type NextRequest, NextResponse } from "next/server";
import { completeEmailLink, type EmailLinkType } from "@/lib/auth/server";
import { safeNext } from "@/lib/auth/next-param";

/**
 * Where every emailed auth link lands. Supabase's own templates must be pointed here — their
 * default destination is Supabase's hosted page, which never establishes a session in this app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailLinkType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  const result = await completeEmailLink(tokenHash, type);
  if (!result.ok) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  return NextResponse.redirect(`${origin}${safeNext(searchParams.get("next"))}`);
}
