import { AppTopBar } from "@/components/domain/AppTopBar";

/**
 * Shared chrome for driver-facing routes — currently just `/drive`. `/drive` renders a normal
 * scrollable, centered card column (unlike `(rider)`'s full-bleed map), so this bar is static and
 * reserves real layout space rather than floating fixed over content.
 *
 * Closes a real gap: before this, a signed-in driver on `/drive` had no way to reach `/account`
 * and no way to log out except editing the URL — its only link was inside the non-driver empty
 * state. `AppTopBar` is the same component `RiderTopBar` now wraps.
 */
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ivory">
      <AppTopBar links={[{ href: "/account", label: "Account" }]} showLogOut />
      {children}
    </div>
  );
}
