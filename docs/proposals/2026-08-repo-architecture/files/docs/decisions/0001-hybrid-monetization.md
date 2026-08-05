# ADR-0001 — Hybrid monetization: flat fee + graduated commission

**Status:** Accepted
**Date:** 2026-08-05 (backfilled from prior strategy work)

## Context

A pure flat subscription is the cleanest driver-favorable model and the one Empower proved out —
drivers keep 100% of fares. But under a flat fee, RIDO's revenue tracks **driver headcount, not
GMV**: a driver doing 50 rides and one doing 500 pay identically. California's fixed compliance
costs — above all the $1M commercial liability policy — arrive from day one and do not scale down
at low density. A flat sub cannot carry them until driver density is high, and density is exactly
what a cold-start marketplace doesn't have.

## Decision

**$50/month flat fee plus a graduated commission on monthly fare volume.**

Commission bands are configuration, not code: 20% on $0–1,000, 12% on $1,000–3,000, 8% above
$3,000 of a driver's monthly fares. Rates live in the `commission_tiers` table.

## Consequences

- RIDO revenue scales with GMV, so it can fund fixed costs before density arrives.
- Blended take at $3,600 GMV/driver-month is ~13.6% — still less than half an incumbent's
  effective 30–50%. The wedge survives the hybrid.
- The fairness promise becomes a constraint on the code: the commission logic is the most
  load-bearing thing in the repo, and must be exactly right.
- Two revenue mechanisms means two failure modes and two Stripe integrations (subscription +
  Connect) rather than one.
- Supersedes the pure-subscription direction. See `../business/monetization.md` for the worked
  numbers and `../business/market-viability.md` for the evidence behind the take-rate figures.
