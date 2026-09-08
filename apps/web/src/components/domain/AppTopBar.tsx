import Link from "next/link";
import { Wordmark } from "./Wordmark";

export interface AppTopBarLink {
  href: string;
  label: string;
}

/**
 * The shared bar behind `RiderTopBar` and `(driver)/layout.tsx` — wordmark left, named links plus
 * an optional "Log out" (a plain POST form, same pattern as `/account`'s, so a third-party `<img>`
 * tag can't sign anyone out) right. `fixed` reproduces `RiderTopBar`'s original floating-over-a-map
 * treatment; static (the default) is a normal-flow bar that reserves its own layout space, which
 * is what a non-map surface like `/drive` needs instead.
 */
export function AppTopBar({
  links,
  showLogOut = false,
  fixed = false,
}: {
  links: AppTopBarLink[];
  showLogOut?: boolean;
  fixed?: boolean;
}) {
  return (
    <div
      className={`${
        fixed ? "fixed inset-x-0 top-0 z-50 bg-ivory/90 backdrop-blur-sm" : "relative z-50 bg-ivory"
      } flex items-center justify-between px-5 py-3`}
    >
      <Wordmark size={22} />
      <div className="flex items-center gap-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-[13px] font-medium text-slate hover:text-ink"
          >
            {link.label}
          </Link>
        ))}
        {showLogOut && (
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-[13px] font-medium text-slate hover:text-ink">
              Log out
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
