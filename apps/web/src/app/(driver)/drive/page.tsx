import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/auth/server";
import { getOwnDriverProfile } from "@/lib/drivers/server";
import { isActiveDriver } from "@/lib/drivers/status";
import {
  getPayoutSummary,
  refreshConnectState,
  settlePendingPayoutsForDriver,
} from "@/lib/payouts/server";
import { getDriverActiveRide, listOpenRequests } from "@/lib/rides/server";
import { AvailabilityToggle } from "./AvailabilityToggle";
import { CurrentRidePanel } from "./CurrentRidePanel";
import { OpenRequestsPanel } from "./OpenRequestsPanel";
import { PayoutCard } from "./PayoutCard";

/**
 * Driver dashboard. The compliance-status card is the original scaffolding, mirroring
 * `(rider)/request`'s placeholder — it exists to prove the plumbing (auth gate, driver-profile
 * read) works end to end. Below it: the driver's own live ride if they have one
 * (`CurrentRidePanel`, ADR-0014), or the open-request dispatch board if they don't
 * (`OpenRequestsPanel`, ADR-0013) — `rides_one_active_per_driver` guarantees these are mutually
 * exclusive, so `listOpenRequests` doesn't even run when a current ride exists — and the payout
 * card (`PayoutCard`, ADR-0015), which is where a driver connects a bank and sees what they've
 * been paid. `AvailabilityToggle` (ADR-0019) sits above both panels rather than inside either,
 * since a driver holding a live ride must still be able to go offline. MTD tier-progress
 * visualization is still roadmap Phase 3.
 *
 * Reachable by anyone signed in, driver or not: someone without a `drivers` row sees an honest
 * "you haven't applied" state rather than being redirected away, since there's no self-serve
 * apply flow to send them to yet — `/drivers`' own CTA still goes through the same `/signup`
 * every rider uses.
 */
export default async function DrivePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const user = await requireUser();
  const driver = await getOwnDriverProfile(user);
  const active = isActiveDriver(driver);

  // Stripe redirects here with ?onboarding=return once the driver finishes its hosted form. The
  // account.updated webhook and this redirect race, and either can arrive first — so re-read
  // Stripe directly on the return leg rather than rendering a stale `false` at the exact moment
  // the driver is looking for confirmation that it worked. Any ride completed before onboarding
  // finished left its payout `pending` with nothing to revisit it later — this is the one moment
  // that debt can be pulled forward rather than left waiting on the driver's next ride.
  const { onboarding } = await searchParams;
  if (onboarding === "return" && driver) {
    await refreshConnectState(driver);
    await settlePendingPayoutsForDriver(driver);
  }

  // Re-read after any refresh above, so the card renders the state we just synced. Everything
  // below reads `freshDriver`, not `driver` — on the onboarding-return leg `driver` is the
  // pre-refresh row, and having half the page render one and half the other is a fork waiting to
  // show someone stale state.
  const freshDriver = onboarding === "return" ? await getOwnDriverProfile(user) : driver;

  const currentRide = active && freshDriver ? await getDriverActiveRide(freshDriver) : null;
  const hasNoActiveRide = currentRide?.ok && currentRide.data === null;
  const openRequests = hasNoActiveRide && freshDriver ? await listOpenRequests(freshDriver) : null;
  const payouts = active && freshDriver ? await getPayoutSummary(freshDriver) : null;

  return (
    <main className="flex min-h-screen items-center bg-ivory p-6">
      <div className="w-full max-w-sm space-y-4">
        <Card>
          {driver ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h1 className="font-sora text-2xl font-bold text-midnight">Driver status</h1>
                <Badge tone={active ? "accent" : "neutral"}>{driver.status}</Badge>
              </div>
              <dl className="space-y-2 text-sm text-slate">
                <div className="flex justify-between">
                  <dt>Background check</dt>
                  <dd className="font-semibold text-ink">{driver.background_check_status}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Vehicle inspection</dt>
                  <dd className="font-semibold text-ink">{driver.vehicle_inspection_status}</dd>
                </div>
              </dl>
              {!active && (
                <p className="mt-4 text-sm text-slate">
                  Both need to read "passed" before you can go online.
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="mb-1 font-sora text-2xl font-bold text-midnight">
                You haven&apos;t applied to drive yet
              </h1>
              <p className="mb-6 text-sm text-slate">
                Start with the driver requirements and sign up.
              </p>
              <Button href="/drivers" fullWidth>
                See requirements
              </Button>
            </>
          )}
        </Card>

        {/* Above both panels on purpose: a driver mid-ride has no board, and going offline to
            signal "this is my last one" has to stay reachable (ADR-0019). */}
        {active && freshDriver && (
          <AvailabilityToggle acceptingRides={freshDriver.accepting_rides} />
        )}

        {currentRide && !currentRide.ok && (
          <p className="text-[13px] text-danger">{currentRide.message}</p>
        )}

        {currentRide?.ok && currentRide.data && <CurrentRidePanel ride={currentRide.data} />}

        {openRequests &&
          (openRequests.ok ? (
            <OpenRequestsPanel
              initialRequests={openRequests.data}
              acceptingRides={freshDriver?.accepting_rides ?? false}
            />
          ) : (
            <p className="text-[13px] text-danger">{openRequests.message}</p>
          ))}

        {payouts &&
          (payouts.ok ? (
            <PayoutCard summary={payouts.data} />
          ) : (
            <p className="text-[13px] text-danger">{payouts.message}</p>
          ))}
      </div>
    </main>
  );
}
