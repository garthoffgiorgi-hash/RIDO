# ADR-0003 — Six-month fee waiver, traction-gated turn-on

**Status:** Accepted
**Date:** 2026-08-05 (backfilled from prior strategy work)

## Context

The flat fee is what punishes low volume during cold start: a driver pays $50 whether they earn
$200 or $2,000 that month. That's a fixed downside to *trying* RIDO, at exactly the moment there
is no liquidity to justify it. The commission has no such problem — it's self-calibrating, so a
driver doing few rides pays a cut of few rides.

A no-fee *and* no-commission pilot was considered and rejected: six months of pure burn with zero
offset against fixed costs (above all the $1M policy) that RIDO carries from day one.

## Decision

**Waive the $50 flat fee for the first 6 months. Keep the graduated commission running.**

The fee turn-on is **gated on a traction signal, not a date.** If ride density hasn't reached the
threshold by month six, extend the waiver rather than charge.

## Consequences

- **The fee is a per-driver, per-market state — never a calendar comparison in code.** Any
  implementation that computes `if (now > launchDate + 6 months)` is wrong and must be rejected
  in review. `subscriptions.fee_active` and `flat_fee_cents` carry the state.
- The pilot removes driver *acquisition* friction. It does **not** help *retention* — that
  depends entirely on liquidity. Don't read "free" as "cold-start solved."
- Revenue during the pilot is commission-only, which makes the insurance quote (open question #1)
  the load-bearing input to whether six months is survivable.
- Marketing claims about what a driver keeps differ between pilot and steady state (no fee vs
  $50/mo). Whichever is published must say which regime it describes — see
  `../business/monetization.md`.
