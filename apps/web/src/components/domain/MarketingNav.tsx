"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "./Wordmark";

const LINKS = [
  { href: "/", label: "For riders" },
  { href: "/drivers", label: "For drivers" },
  { href: "/about", label: "About" },
] as const;

/** Shared sticky nav for the three marketing pages — one active-link highlight per route. */
export function MarketingNav() {
  const pathname = usePathname();
  // The driver page's CTA points at sign-in (no driver application flow exists yet); every
  // other marketing page CTAs into the rider request flow.
  const isDriverPage = pathname === "/drivers";
  const ctaLabel = isDriverPage ? "Drive with rido" : "Get a rido";
  const ctaHref = isDriverPage ? "/login" : "/request";

  return (
    <nav className="sticky top-0 z-50 border-b border-mist bg-ivory">
      <div className="mx-auto flex h-[78px] max-w-[1120px] items-center justify-between px-6 sm:px-8">
        <Wordmark />
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={
                pathname === link.href
                  ? "text-sm font-semibold text-midnight no-underline"
                  : "text-sm font-medium text-ink no-underline hover:text-midnight"
              }
            >
              {link.label}
            </a>
          ))}
        </div>
        <Button href={ctaHref} size="sm">
          {ctaLabel}
        </Button>
      </div>
    </nav>
  );
}
