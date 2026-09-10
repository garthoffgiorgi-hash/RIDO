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

/**
 * The fare broken into what it is made of: the ride itself, then each pass-through RIDO collects
 * and remits (today only the SB 1376 fee — ADR-0024).
 *
 * **Renders nothing when there are no pass-throughs.** A list reading "Ride $12.40 / Total $12.40"
 * tells a rider nothing they can't already see, and the total above it is the headline. The point
 * of this component is that a rider charged more than the fare is told why, before they book.
 *
 * Takes line items as plain data rather than importing the pricing type: a component receives
 * cents and renders them (`apps/web/CLAUDE.md`), and this one does no arithmetic at all — the
 * amounts arrive already decided by `quoteFare()`.
 */
export function FareLineItems({
  fareCents,
  lineItems,
}: {
  fareCents: number;
  lineItems: readonly { code: string; label: string; amountCents: number }[];
}) {
  if (lineItems.length === 0) return null;

  return (
    <dl className="mt-3 flex flex-col gap-1 text-[13px] text-slate">
      <div className="flex items-baseline justify-between gap-4">
        <dt>Ride</dt>
        <dd className="tabular">{formatCents(fareCents)}</dd>
      </div>
      {lineItems.map((item) => (
        <div key={item.code} className="flex items-baseline justify-between gap-4">
          <dt>{item.label}</dt>
          <dd className="tabular">{formatCents(item.amountCents)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One formatter for every fare shown to a rider — `/dev/maps` had its own private copy; this replaces it. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
