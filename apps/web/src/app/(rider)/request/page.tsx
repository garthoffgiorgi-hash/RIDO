import { RiderTopBar } from "@/components/domain/RiderTopBar";
import { requireUser } from "@/lib/auth/server";
import { getActiveRide } from "@/lib/rides/server";
import { RequestPanel } from "./RequestPanel";

/**
 * The rider request flow — map-first, bottom sheet, fare up front
 * (`brand/design-system.md` section 6). `requireUser()` is the security boundary, same as
 * `/account` and `/drive`; `proxy.ts`'s `PROTECTED_PREFIXES` is the clean-redirect convenience.
 *
 * `getActiveRide()` runs here rather than inside the client panel so a page reload lands back on
 * a live request instead of a blank "where to?" form — the same reasoning `/account` reads
 * `getOwnDriverProfile()` server-side rather than fetching it after mount.
 */
export default async function RequestPage() {
  const user = await requireUser();
  const activeRide = await getActiveRide(user);

  return (
    <>
      <RiderTopBar />
      <RequestPanel initialActiveRide={activeRide} />
    </>
  );
}
