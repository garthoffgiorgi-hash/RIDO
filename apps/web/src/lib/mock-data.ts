/**
 * The one home for every example number shown on the marketing pages. No backend exists yet
 * (root CLAUDE.md — "Ground truth"), so every fare, percentage, and commission figure below is
 * illustrative copy, not live data. Nothing here is computed — every figure is a direct citation
 * of a value already published in docs/, never a recomputation (root CLAUDE.md invariant #3 and
 * the "do not re-implement commission math" guardrail).
 *
 * Canonical source: docs/business/monetization.md. If a number here ever drifts from that file,
 * that file wins — fix this one.
 */

export const launchCity = "San Diego";

/** ADR-0003: pilot waives the flat fee for this many months; commission still runs. */
export const pilotMonths = 6;

export const commissionTiers = [
  {
    band: "$0 – $1,000 / mo",
    rate: "20%",
    description: "Starting band, on your first $1,000 of fares each month.",
  },
  {
    band: "$1,000 – $3,000 / mo",
    rate: "12%",
    description: "Middle band, on the next $2,000 of fares.",
  },
  {
    band: "Above $3,000 / mo",
    rate: "8%",
    description: "Top band, on every dollar past $3,000.",
  },
] as const;

/**
 * The published driver-keeps figure — docs/business/monetization.md, "Published driver-keeps
 * figure": ~86% (86.4% precisely), commission-only, basis is the $3,600 GMV/driver-mo worked
 * example below. Cite this figure; never recompute or retype a different one (apps/web/CLAUDE.md).
 */
export const driverKeepsPct = "~86%";

/**
 * The exact worked example from docs/business/monetization.md: "$3,600 GMV/driver-mo:
 * $1,000×20% + $2,000×12% + $600×8% = $488 (~13.6% blended). Driver keeps $3,112; an incumbent
 * at 30% would take $1,080" (so an incumbent driver keeps $3,600 − $1,080 = $2,520).
 * These are the only commission numbers used anywhere in the marketing pages — matched to the
 * dollar against the doc, never re-derived. Per the design handoff note
 * (brand/exports/2026-08-07-landing-pages-v1.md), the Driver page's original design computed
 * this live from arbitrary props in a component; that's dropped here in favor of this one fixed,
 * citable example, since the root CLAUDE.md guardrail forbids re-implementing commission math
 * (bracket arithmetic) anywhere outside packages/pricing, including in a component.
 */
export const commissionWorkedExample = {
  monthlyGmv: "$3,600",
  ridoCommission: "$488",
  ridoDriverKeeps: "$3,112",
  ridoBlendedRate: "13.6%",
  // Matches driverKeepsPct above: $3,112 / $3,600 = 86.4%.
  ridoKeepPct: "86%",
  incumbentFlatRate: "30%",
  incumbentDriverKeeps: "$2,520",
  incumbentKeepPct: "70%",
  monthlyAdvantage: "$592",
} as const;

/**
 * Incumbents' *effective* take (distinct from the 30% comparison baseline above, which
 * monetization.md itself uses as a conservative flat-rate comparison). Source: docs/business/
 * overview.md / docs/business/market-viability.md — "nominally ~25%, but effectively ~35–50%"
 * since 2022 upfront pricing decoupled rider price from driver pay.
 */
export const incumbentEffectiveTakeRange = "35–50%";

export const driverRequirements = [
  { icon: "id-card", label: "21+ with a valid license" },
  { icon: "car-front", label: "2010 or newer vehicle" },
  { icon: "shield-check", label: "Valid insurance on file" },
  { icon: "search-check", label: "Passed background check" },
  { icon: "file-check", label: "Clean driving record" },
] as const;

/**
 * Illustrative only — not verbatim reviews (brand/exports/2026-08-07-landing-pages-v1.md build
 * note). Keep that framing anywhere these render.
 */
export const driverTestimonials = [
  {
    quote: "I finally see the math on every ride. No guessing what I'll take home.",
    name: "Marcus T.",
    role: "Pilot driver, San Diego",
  },
  {
    quote: "Same hours, noticeably more in the bank at the end of the week.",
    name: "Priya S.",
    role: "Pilot driver, UCSD area",
  },
  {
    quote: "No forced hours, no penalties for logging off. It respects my time.",
    name: "Dana R.",
    role: "Pilot driver, San Diego",
  },
] as const;

export const contact = {
  general: "hello@rido.co",
  press: "press@rido.co",
  location: "San Diego, CA",
} as const;
