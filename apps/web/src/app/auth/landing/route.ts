import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { landingPath } from "@/lib/auth/landing";
import { validNext } from "@/lib/auth/next-param";
import { getOwnDriverProfile } from "@/lib/drivers/server";
import { hasActiveDriverRide, hasActiveRiderRide } from "@/lib/rides/server";

/**
 * Where a sign-in actually lands (ADR-0023). A `NextResponse.redirect()` Route Handler, not a
 * Server Component calling `redirect()` — a page-level redirect sits behind the root
 * `loading.tsx` and streams as a 200 plus a client-side navigation, which is the exact failure
 * `proxy.ts` already exists to avoid for the anonymous bounce. This is that same fix applied to
 * the authenticated side.
 *
 * `no-store` on every response here: a cached landing redirect is a permanent misroute for
 * whoever the cache serves it to next.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const user = await getCurrentUser();

  if (!user) {
    // A defensive path, not a real one: every actual caller — the two `window.location.replace()`
    // call sites and /auth/confirm's redirect — only ever reaches this route already
    // authenticated, cookies written before the navigation fires. This branch exists for a
    // stale bookmark or a hand-typed URL, so it doesn't try to preserve whatever `next` this
    // request itself carried — that's forwardable now (it's no longer self-referential-rejected),
    // but the complexity isn't worth it for a path that shouldn't fire in practice. Simpler and
    // sufficient: come straight back here once signed in, where the ride check resolves the real
    // destination fresh.
    const login = new URL("/login", origin);
    login.searchParams.set("next", "/auth/landing");
    return NextResponse.redirect(login, { headers: { "Cache-Control": "no-store" } });
  }

  const driver = await getOwnDriverProfile(user);
  const [hasDriverRide, hasRiderRide] = await Promise.all([
    driver ? hasActiveDriverRide(driver) : Promise.resolve(false),
    hasActiveRiderRide(user),
  ]);

  const destination = landingPath({
    explicitNext: validNext(searchParams.get("next")),
    hasDriverRide,
    hasRiderRide,
  });

  return NextResponse.redirect(new URL(destination, origin), {
    headers: { "Cache-Control": "no-store" },
  });
}
