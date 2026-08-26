import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every request. Required alongside
 * src/lib/supabase/server.ts — Server Components can read cookies but not write them, so
 * without this, sessions would silently stop refreshing and users would get logged out.
 *
 * Named `proxy.ts` / `proxy()`, not `middleware.ts` / `middleware()` — Next.js 16 deprecated
 * the old name (still worked, just warns; renamed here rather than shipping a deprecated API).
 * Runs on the Node.js runtime, not edge — Next 16 doesn't let `proxy` choose a runtime, so
 * anything depending on edge-only behavior would need `middleware.ts` back, which we don't.
 *
 * Do not add code between createServerClient and supabase.auth.getUser() below — that call is
 * what actually performs the refresh, and reordering breaks it silently.
 */

/**
 * Routes an anonymous visitor is bounced off, as a real 307, before the route renders.
 *
 * **This list is not the security boundary** — `requireUser()` in the page is. A path missing
 * here still redirects, just one render later. The list exists because a page-level `redirect()`
 * sitting behind `loading.tsx` streams as a 200 plus a client-side navigation; catching it here
 * keeps protected routes a clean HTTP redirect.
 */
const PROTECTED_PREFIXES = ["/account", "/drive"] as const;

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected(request.nextUrl.pathname)) {
    const login = new URL("/login", request.url);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
