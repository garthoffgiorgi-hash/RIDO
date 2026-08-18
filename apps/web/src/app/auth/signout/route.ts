import { type NextRequest, NextResponse } from "next/server";
import { signOut } from "@/lib/auth/server";

/**
 * POST only, deliberately. A GET sign-out can be triggered by any third-party page embedding
 * `<img src="https://rido.../auth/signout">`, which logs people out at a stranger's whim.
 */
export async function POST(request: NextRequest) {
  await signOut();
  // 303 so the browser follows with GET rather than re-POSTing to the destination.
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
