import Link from "next/link";
import { Wordmark } from "./Wordmark";

/**
 * The thin in-product bar the rider blueprint asks for — "minimal chrome, white or ivory"
 * (`brand/design-system.md:79`) — distinct from `MarketingNav`, which is marketing-specific (three
 * nav links, a CTA switched by pathname) and explicitly wrong over a full-bleed map.
 *
 * Floats above the map rather than claiming a fixed height of layout space, and sits above the
 * sheet's dim backdrop (`z-50`, matching `Sheet`'s panel) — the map is meant to read as
 * backgrounded while a sheet shows over it (`design-system.md:80`), but this bar is navigation
 * chrome, not part of that background, and stays legible regardless.
 */
export function RiderTopBar() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between bg-ivory/90 px-5 py-3 backdrop-blur-sm">
      <Wordmark size={22} />
      <Link href="/account" className="text-[13px] font-medium text-slate hover:text-ink">
        Account
      </Link>
    </div>
  );
}
