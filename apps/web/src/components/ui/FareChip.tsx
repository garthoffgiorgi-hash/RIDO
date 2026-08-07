import type { ReactNode } from "react";

/** Pill chip for fares, ETAs, distances, percentages — tabular numerals, Signal tint. */
export function FareChip({ children }: { children: ReactNode }) {
  return (
    <span className="tabular inline-flex items-center rounded-pill bg-signal/8 px-3 py-1 text-[13px] font-semibold text-signal">
      {children}
    </span>
  );
}
