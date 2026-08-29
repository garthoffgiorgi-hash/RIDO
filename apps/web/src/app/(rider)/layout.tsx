/**
 * Shared chrome for rider-facing routes — currently just `/request`. Full-bleed and fixed, not
 * `min-h-screen` + normal document flow like `(marketing)`'s layout: the map-first surface
 * (`brand/design-system.md` section 6) needs `RideMap`'s `shape="bleed"` to size against the
 * viewport itself, which only works if nothing above it constrains height to content.
 */
export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 overflow-hidden bg-ivory">{children}</div>;
}
