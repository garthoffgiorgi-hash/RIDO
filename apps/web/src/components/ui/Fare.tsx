/**
 * The hero fare — `--text-numeral` (24px, Sora, tabular), the role `globals.css:49` defines and
 * nothing used before this. `FareChip` is 13px and reads as a pill, not a headline; this is the
 * "fare + ETA shown in tabular numerals up front" the rider blueprint asks for
 * (`brand/design-system.md` section 6).
 *
 * Takes cents, formats once here, at the edge — components receive cents and never format money
 * themselves (`apps/web/CLAUDE.md`).
 */
export function Fare({ cents, className }: { cents: number; className?: string }) {
  return (
    <p className={`tabular font-sora text-numeral font-bold text-ink ${className ?? ""}`}>
      {formatCents(cents)}
    </p>
  );
}

/** One formatter for every fare shown to a rider — `/dev/maps` had its own private copy; this replaces it. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
