/**
 * Every commission figure the marketing pages publish, derived rather than typed.
 *
 * This used to be hand-maintained prose in `mock-data.ts` and in `(marketing)/drivers/page.tsx`
 * — the "~86%", the band table, and two separate spellings of "20% / 12% / 8%". Changing a rate
 * meant editing the database and then remembering five copy locations. `apps/web/CLAUDE.md` said
 * that figure was "interim until Phase 2 computes it from @rido/pricing directly"; this is that.
 *
 * The chain, end to end:
 *
 *   supabase/seed/commission_tiers.sql      the one home for RIDO's rates
 *     -> scripts/generate-published-tiers.mjs
 *       -> published-tiers.generated.ts     checked in, CI fails if it drifts from the seed
 *         -> commissionForRide()            the SAME function that charges real drivers
 *           -> the strings below
 *
 * So the website cannot quote a rate the database doesn't hold, and "~86%" is a result rather
 * than a claim. Change a rate, run `npm run generate:tiers`, and every percentage on every page
 * moves with it.
 *
 * All four importers are Server Components, so this evaluates at build time — the pages are
 * statically prerendered and none of this runs in a browser or on a request.
 *
 * NOT here: anything illustrative. Testimonials, requirements, contact details and the pilot
 * length stay in `mock-data.ts`, which is honest about being copy.
 */

import { BPS_DENOMINATOR, type CommissionTier, commissionForRide, cents } from "@rido/pricing";
import { PUBLISHED_TIERS } from "./published-tiers.generated.ts";

/**
 * The month size the published worked example is built on: $3,600 of fares, from
 * docs/business/monetization.md. A business assumption about a typical driver-month, not a rate —
 * the rates all arrive from the seed above.
 */
const WORKED_EXAMPLE_GMV_CENTS = 360_000;

/**
 * The incumbent comparison baseline, also from monetization.md: a flat 30%. This is a cited
 * figure about *someone else's* pricing, deliberately conservative — incumbents' effective take
 * is higher (see `incumbentEffectiveTake` in mock-data.ts). It is modelled as a single unbounded
 * band so the comparison runs through the same engine as our own number, rather than through a
 * second piece of arithmetic that could disagree with it.
 */
const INCUMBENT_FLAT_TIERS: readonly CommissionTier[] = [
  { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: null, rateBps: 3000 },
];

// ------------------------------------------------------------------------------- formatting

const usd = (fractionDigits: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

/** Whole dollars where the amount is whole, cents where it isn't. Marketing copy, not a receipt. */
function formatUsd(amountCents: number): string {
  return usd(amountCents % 100 === 0 ? 0 : 2).format(amountCents / 100);
}

function formatPct(rateBps: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits,
  }).format(rateBps / BPS_DENOMINATOR);
}

// ------------------------------------------------------------------------------- the bands

/**
 * The tier table, as display copy. Nothing here knows there are three bands — add a fourth to
 * the seed and this grows a row with the right prose.
 *
 * The only arithmetic is a band's width (`upper - lower`), which is a distance between two
 * boundaries rather than an amount of money owed to anyone.
 */
export const commissionTiers = PUBLISHED_TIERS.map((tier, index) => {
  const isFirst = index === 0;
  const isLast = index === PUBLISHED_TIERS.length - 1;
  const { lowerBoundCents, upperBoundCents, rateBps } = tier;

  const band =
    upperBoundCents === null
      ? `Above ${formatUsd(lowerBoundCents)} / mo`
      : `${formatUsd(lowerBoundCents)} – ${formatUsd(upperBoundCents)} / mo`;

  let description: string;
  if (isFirst && upperBoundCents !== null) {
    description = `Starting band, on your first ${formatUsd(upperBoundCents)} of fares each month.`;
  } else if (isLast) {
    description = `Top band, on every dollar past ${formatUsd(lowerBoundCents)}.`;
  } else {
    description = `Middle band, on the next ${formatUsd((upperBoundCents ?? 0) - lowerBoundCents)} of fares.`;
  }

  return { band, rate: formatPct(rateBps, 2), description };
});

/** "20% on your first $1,000 of fares each month, 12% on the next $2,000, then just 8% above $3,000." */
export const tierProseSentence = (() => {
  const clauses = PUBLISHED_TIERS.map((tier, index) => {
    const rate = formatPct(tier.rateBps, 2);
    const isFirst = index === 0;
    const isLast = index === PUBLISHED_TIERS.length - 1;
    if (isFirst && tier.upperBoundCents !== null) {
      return `${rate} on your first ${formatUsd(tier.upperBoundCents)} of fares each month`;
    }
    if (isLast) return `then just ${rate} above ${formatUsd(tier.lowerBoundCents)}`;
    return `${rate} on the next ${formatUsd((tier.upperBoundCents ?? 0) - tier.lowerBoundCents)}`;
  });
  return `${clauses.join(", ")}.`;
})();

/** The short version: "20%, then 12%, then just 8%." */
export const tierProseShort = (() => {
  const rates = PUBLISHED_TIERS.map((tier) => formatPct(tier.rateBps, 2));
  const last = rates[rates.length - 1];
  return `${rates.slice(0, -1).join(", then ")}, then just ${last}`;
})();

// ------------------------------------------------------------------------ the worked example

const rido = commissionForRide({
  fareCents: cents(WORKED_EXAMPLE_GMV_CENTS),
  mtdGrossCents: cents(0),
  tiers: PUBLISHED_TIERS,
});

const incumbent = commissionForRide({
  fareCents: cents(WORKED_EXAMPLE_GMV_CENTS),
  mtdGrossCents: cents(0),
  tiers: INCUMBENT_FLAT_TIERS,
});

// Rating a whole month as one "ride" from position zero is exactly what bracketing the month in
// one pass means — ADR-0002's "mathematically identical" property, used here deliberately.

const ridoKeepBps = BPS_DENOMINATOR - rido.commissionRateBps;
const incumbentKeepBps = BPS_DENOMINATOR - incumbent.commissionRateBps;

/**
 * The published driver-keeps figure. Derived from the worked example below, not asserted —
 * docs/business/monetization.md quotes the same number and is now downstream of this code
 * rather than the source of it.
 */
export const driverKeepsPct = `~${formatPct(ridoKeepBps, 0)}`;

/**
 * The worked example the drivers and about pages render.
 *
 * `ridoKeepPct` and `incumbentKeepPct` are deliberately bare (no tilde, no decimals): the
 * drivers page passes each one straight into a CSS `width`, so "~86%" would collapse the bar.
 * `driverKeepsPct` above is the prose form. Same number, two jobs.
 *
 * `monthlyAdvantage` differences the two *commissions* — how much less RIDO takes — rather than
 * the two payouts. Same figure either way, but it's the honest framing, and both sides came out
 * of commissionForRide rather than out of arithmetic here.
 */
export const commissionWorkedExample = {
  monthlyGmv: formatUsd(WORKED_EXAMPLE_GMV_CENTS),
  ridoCommission: formatUsd(rido.commissionCents),
  ridoDriverKeeps: formatUsd(rido.driverPayoutCents),
  ridoBlendedRate: formatPct(rido.commissionRateBps, 1),
  ridoKeepPct: formatPct(ridoKeepBps, 0),
  incumbentFlatRate: formatPct(incumbent.commissionRateBps, 2),
  incumbentDriverKeeps: formatUsd(incumbent.driverPayoutCents),
  incumbentKeepPct: formatPct(incumbentKeepBps, 0),
  monthlyAdvantage: formatUsd(incumbent.commissionCents - rido.commissionCents),
} as const;
