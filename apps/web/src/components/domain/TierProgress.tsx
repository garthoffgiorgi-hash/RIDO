import { BPS_DENOMINATOR, type CommissionTier, type TierPosition } from "@rido/pricing";
import { Card } from "@/components/ui/Card";
import { formatCents } from "@/components/ui/Fare";
import type { DriverTierProgress } from "@/lib/commission/server";

/**
 * Month-to-date earnings, and where a driver sits in the graduated commission bands — the name
 * and home `apps/web/CLAUDE.md:33` reserves ("later `TierProgress`"), and the surface
 * `brand/design-system.md:127` specifies: *"month-to-date earnings with the tier progress (show
 * the graduated bands filling — turn the commission model into a motivator)."*
 *
 * A Server Component, deliberately: every value here is already computed by
 * `getDriverTierProgress()` (`@/lib/commission/server.ts`), which is the only place that reads
 * `driver_monthly_stats` and calls `tierPositionFor()` (`@rido/pricing`). This component only
 * formats — the same posture `RideCard` and `PayoutCard` hold, and the literal requirement in
 * `.claude/rules/money.md`: "a number shown to a driver comes from a snapshot or from
 * `@rido/pricing` — not from arithmetic in a component." `BPS_DENOMINATOR - rateBps` is the one
 * exception, the same one `RideCard` makes, and for the same reason: `@rido/pricing` exports the
 * denominator specifically so "the driver keeps the rest" is never `10_000` typed in a component.
 *
 * **Two rates, never conflated.** `docs/business/monetization.md` warns explicitly against
 * presenting the month's *blended* keep rate as a *per-ride* guarantee. This card keeps them in
 * separate sentences with separate framing: "you kept ... overall" for the month so far, "you
 * keep ... of each new fare" for what happens next — the second is what `position.currentTier`
 * actually is.
 *
 * **The meter is `aria-hidden`.** Every fact it draws is already stated in the sentences around
 * it, so a screen reader loses nothing. A segmented meter has no single value `aria-valuenow`
 * could honestly describe — bolting one on would announce a number that doesn't match what's
 * drawn. There is no other ARIA precedent in this repo to follow either way; this is a deliberate
 * call, not an oversight.
 */
export function TierProgress({ progress }: { progress: DriverTierProgress }) {
  const { position, ridesCount, grossFareCents, payoutCents, blendedKeepRateBps } = progress;
  const empty = ridesCount === 0;

  return (
    <Card size="sm" className="space-y-3">
      <p className="eyebrow">This month</p>

      {empty ? (
        <p className="text-[14px] text-ink">No completed rides yet.</p>
      ) : (
        <div className="space-y-1">
          <p className="tabular font-sora text-numeral font-bold text-ink">
            {formatCents(grossFareCents)}
          </p>
          <p className="tabular text-[13px] text-slate">
            in fares · {ridesCount} {ridesCount === 1 ? "ride" : "rides"}
          </p>
          <p className="tabular text-[13px] text-slate">
            You kept {formatCents(payoutCents)} of that
            {blendedKeepRateBps !== null ? ` — ${formatBpsAsPct(blendedKeepRateBps)} overall` : ""}.
          </p>
        </div>
      )}

      <TierMeter tiers={progress.tiers} position={position} />

      <p className="text-[13px] text-slate">{describePosition(position, empty)}</p>
    </Card>
  );
}

/** One shared percent formatter — `RideCard`'s inline version, generalized to take a raw rate. */
function formatBpsAsPct(rateBps: number): string {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(
    rateBps / BPS_DENOMINATOR,
  );
}

const keepPct = (rateBps: number) => formatBpsAsPct(BPS_DENOMINATOR - rateBps);

/**
 * The one explanatory sentence — honest about a real thing that is true and in the driver's
 * favour, never urgency ("only $340 to go!"). `brand/brand-guide.md`: warmth points inward, don't
 * be cute about driver pay, never moralize. The wedge motivates on its own; it doesn't need help.
 */
function describePosition(position: TierPosition, empty: boolean): string {
  if (position.kind === "top") {
    return empty
      ? `You keep ${keepPct(position.currentTier.rateBps)} of every fare this month — there's just one rate.`
      : `You're in our lowest commission band. You keep ${keepPct(position.currentTier.rateBps)} of every new fare this month.`;
  }

  if (empty) {
    return `Your first ${formatCents(position.currentBandWidthCents)} in fares is at ${formatBpsAsPct(position.currentTier.rateBps)} commission — you keep ${keepPct(position.currentTier.rateBps)}. It drops from there.`;
  }

  return `Right now you keep ${keepPct(position.currentTier.rateBps)} of each new fare. Past ${formatCents(position.nextTier.lowerBoundCents)} this month, you keep ${keepPct(position.nextTier.rateBps)}.`;
}

/**
 * The graduated bands, filling — one segment per tier, widths proportional to each band's real
 * width. The unbounded top band has no proportional width by definition, so it gets a fixed share
 * (the average of the finite bands') and is drawn without a hard right edge implied, so it never
 * reads as a finite segment a driver could complete.
 */
function TierMeter({
  tiers,
  position,
}: {
  tiers: readonly CommissionTier[];
  position: TierPosition;
}) {
  const sorted = [...tiers].sort((a, b) => a.lowerBoundCents - b.lowerBoundCents);
  const widths = sorted.map((tier) =>
    tier.upperBoundCents === null ? null : tier.upperBoundCents - tier.lowerBoundCents,
  );
  const finiteWidths = widths.filter((w): w is number => w !== null);
  const averageFiniteWidth =
    finiteWidths.length > 0 ? finiteWidths.reduce((a, b) => a + b, 0) / finiteWidths.length : 1;

  return (
    <div className="flex gap-1" aria-hidden="true">
      {sorted.map((tier, i) => {
        const isCurrent = tier.lowerBoundCents === position.currentTier.lowerBoundCents;
        const isPast = tier.lowerBoundCents < position.currentTier.lowerBoundCents;
        const fillFraction = isPast
          ? 1
          : isCurrent
            ? position.kind === "top"
              ? 1
              : position.centsIntoCurrentBand / position.currentBandWidthCents
            : 0;

        return (
          <div
            key={tier.tierOrder}
            className={`relative h-3 overflow-hidden rounded-pill border bg-ivory ${
              isCurrent ? "border-signal" : "border-mist"
            }`}
            style={{ flexGrow: widths[i] ?? averageFiniteWidth, flexBasis: 0 }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-pill bg-signal"
              style={{ width: `${fillFraction * 100}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
