import { RiderTopBar } from "@/components/domain/RiderTopBar";
import { requireUser } from "@/lib/auth/server";
import { getActiveRide, getRecentlyCompletedRide } from "@/lib/rides/server";
import { RequestPanel } from "./RequestPanel";

/**
 * The rider request flow — map-first, bottom sheet, fare up front
 * (`brand/design-system.md` section 6). `requireUser()` is the security boundary, same as
 * `/account` and `/drive`; `proxy.ts`'s `PROTECTED_PREFIXES` is the clean-redirect convenience.
 *
 * `getActiveRide()` runs here rather than inside the client panel so a page reload lands back on
 * a live request instead of a blank "where to?" form — the same reasoning `/account` reads
 * `getOwnDriverProfile()` server-side rather than fetching it after mount.
 *
 * `getRecentlyCompletedRide()` only runs when there's no active ride — a rider already mid-request
 * has nothing to show a stale "trip complete" summary over, and the read would be wasted.
 */
export default async function RequestPage() {
  const user = await requireUser();
  const activeRide = await getActiveRide(user);
  const recentlyCompleted = activeRide ? null : await getRecentlyCompletedRide(user);

  return (
    <>
      <RiderTopBar />
      <RequestPanel initialActiveRide={activeRide} initialRecentlyCompleted={recentlyCompleted} />
    </>
  );
}
