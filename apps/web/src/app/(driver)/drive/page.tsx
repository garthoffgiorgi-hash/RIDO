import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/auth/server";
import { getOwnDriverProfile } from "@/lib/drivers/server";
import { isActiveDriver } from "@/lib/drivers/status";
import { listOpenRequests } from "@/lib/rides/server";
import { OpenRequestsPanel } from "./OpenRequestsPanel";

/**
 * Driver dashboard. The compliance-status card is the original scaffolding, mirroring
 * `(rider)/request`'s placeholder — it exists to prove the plumbing (auth gate, driver-profile
 * read) works end to end. The open-request list below it is real: an active driver's dispatch
 * board, ADR-0013. Online/offline toggle and MTD tier-progress visualization are still roadmap
 * Phase 3 — availability means little while drivers pull from a list rather than dispatch
 * pushing to them.
 *
 * Reachable by anyone signed in, driver or not: someone without a `drivers` row sees an honest
 * "you haven't applied" state rather than being redirected away, since there's no self-serve
 * apply flow to send them to yet — `/drivers`' own CTA still goes through the same `/signup`
 * every rider uses.
 */
export default async function DrivePage() {
  const user = await requireUser();
  const driver = await getOwnDriverProfile(user);
  const active = isActiveDriver(driver);

  const openRequests = active && driver ? await listOpenRequests(driver) : null;

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

        {openRequests &&
          (openRequests.ok ? (
            <OpenRequestsPanel initialRequests={openRequests.data} />
          ) : (
            <p className="text-[13px] text-danger">{openRequests.message}</p>
          ))}
      </div>
    </main>
  );
}
