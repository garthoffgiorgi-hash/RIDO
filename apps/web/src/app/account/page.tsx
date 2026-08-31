import { Wordmark } from "@/components/domain/Wordmark";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/auth/server";
import { getOwnDriverProfile } from "@/lib/drivers/server";
import { isActiveDriver } from "@/lib/drivers/status";
import { getPaymentProfile } from "@/lib/payments/server";
import { PaymentCard } from "./PaymentCard";

/**
 * Signed-in landing page. One surface, role-aware: everyone gets a way to book a ride, and
 * anyone with a `drivers` row (via `getOwnDriverProfile` — no `role` column exists; a driver
 * identity IS the row) also sees their driver status and a way into `/drive`. A person can be
 * both at once, so this page shows whichever is true rather than forcing a choice — it doubles
 * as the chooser.
 *
 * Post-login redirect still lands everyone here rather than splitting by role at the proxy
 * layer: neither `/request` nor `/drive` has real functionality yet, so there's nowhere more
 * specific to send anyone. That split is worth revisiting once one of them does.
 *
 * Also still proves the session is readable from a Server Component — if this renders an email,
 * the whole cookie chain (proxy refresh -> server client -> RLS-scoped query) is working.
 */
export default async function AccountPage() {
  const user = await requireUser();
  const driver = await getOwnDriverProfile(user);
  const paymentProfile = await getPaymentProfile(user);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory p-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="mb-2 flex justify-center">
          <Wordmark size={28} />
        </div>

        <Card>
          <h1 className="mb-1 font-sora text-2xl font-bold text-midnight">You&apos;re logged in</h1>
          <p className="mb-6 text-sm text-slate">
            Signed in as <span className="font-semibold text-ink">{user.email ?? user.phone}</span>.
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

        <Card>
          <h2 className="mb-3 font-sora text-lg font-bold text-midnight">Rider</h2>
          <p className="mb-4 text-sm text-slate">Request a ride whenever you need one.</p>
          <Button href="/request" fullWidth>
            Book a ride
          </Button>
        </Card>

        <PaymentCard profile={paymentProfile} />

        {driver ? (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-sora text-lg font-bold text-midnight">Driver</h2>
              <Badge tone={isActiveDriver(driver) ? "accent" : "neutral"}>{driver.status}</Badge>
            </div>
            {isActiveDriver(driver) ? (
              <p className="mb-4 text-sm text-slate">You&apos;re cleared to drive.</p>
            ) : (
              <p className="mb-4 text-sm text-slate">
                Background check: {driver.background_check_status}. Vehicle inspection:{" "}
                {driver.vehicle_inspection_status}.
              </p>
            )}
            <Button href="/drive" fullWidth variant="secondary">
              Go to driver dashboard
            </Button>
          </Card>
        ) : (
          <Card>
            <h2 className="mb-1 font-sora text-lg font-bold text-midnight">Want to drive?</h2>
            <p className="mb-4 text-sm text-slate">Keep more of what you earn, on your terms.</p>
            <Button href="/drivers" fullWidth variant="secondary">
              Learn about driving
            </Button>
          </Card>
        )}
      </div>
    </main>
  );
}
