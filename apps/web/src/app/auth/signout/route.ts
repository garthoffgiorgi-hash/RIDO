import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Signs the current user out and clears the session cookie.
 *
 * POST only, deliberately: a GET sign-out can be triggered by any third party embedding
 * `<img src="…/auth/signout">`, logging people out without them asking.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  await supabase.auth.signOut();

  // 303 forces the browser to follow with GET rather than re-POSTing to the destination.
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
