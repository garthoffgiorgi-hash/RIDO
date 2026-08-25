/**
 * Illustrative copy for the marketing pages — the things that are genuinely examples.
 *
 * **Commission figures are NOT here.** They live in `marketing/figures.ts`, where they are
 * computed from the seeded tiers by the same `@rido/pricing` code that charges real drivers. That
 * split is the point: a number that describes our pricing must be derived, and a number that is
 * illustrative must be obviously illustrative. Anything below is the second kind — a citation or
 * a piece of copy, never a recomputation (root CLAUDE.md invariant #3).
 *
 * Canonical source for the cited figures: docs/business/. If a number here drifts from those
 * files, they win — fix this one.
 */

export const launchCity = "San Diego";

/** ADR-0003: pilot waives the flat fee for this many months; commission still runs. */
export const pilotMonths = 6;

/**
 * Incumbents' *effective* take — distinct from the flat 30% comparison baseline used in the
 * worked example, which monetization.md picks as a deliberately conservative comparison. Source:
 * docs/business/overview.md and market-viability.md — "nominally ~25%, but effectively ~35–50%"
 * since 2022 upfront pricing decoupled rider price from driver pay.
 *
 * A cited range about someone else's pricing, so it stays a literal. Split into parts rather than
 * one string: the home page needs only the upper bound, and it used to recover it by splitting on
 * the en-dash — one keystroke away from breaking silently.
 */
export const incumbentEffectiveTake = {
  low: "35%",
  high: "50%",
  range: "35–50%",
} as const;

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
