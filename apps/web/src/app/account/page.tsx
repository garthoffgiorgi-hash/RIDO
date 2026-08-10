import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/components/domain/Wordmark";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Minimal signed-in surface. Two jobs: give sign-out a home, and prove the session is readable
 * from a Server Component — if this renders an email, the whole cookie chain (proxy refresh ->
 * server client -> RLS-scoped query) is working.
 *
 * The first route in the app that actually requires auth. Everything else is still public.
 */
export default async function AccountPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Wordmark size={28} />
        </div>

        <Card>
          <h1 className="mb-1 font-sora text-2xl font-bold text-midnight">You&apos;re logged in</h1>
          <p className="mb-6 text-sm text-slate">
            Signed in as <span className="font-semibold text-ink">{user.email}</span>.
          </p>

          {/* Plain form post, no client component needed — POST-only so a third-party <img> tag
              can't sign people out. */}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center rounded-input border border-mist bg-white px-5 text-[15px] font-bold text-ink transition-[transform,background-color] duration-150 ease-standard hover:bg-ivory active:scale-[0.98] focus-visible:ring-[3px] focus-visible:ring-signal/50 focus-visible:outline-none"
            >
              Log out
            </button>
          </form>
        </Card>
      </div>
    </main>
  );
}
