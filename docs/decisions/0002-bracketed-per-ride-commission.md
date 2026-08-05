# ADR-0002 — Commission is bracketed, computed per ride, and snapshotted

**Status:** Accepted
**Date:** 2026-08-05 (backfilled from prior technical work)

## Context

Graduated tiers (ADR-0001) can be applied two ways. **Cliff:** the driver's whole month is rated
at the single tier their total volume lands in. **Bracketed:** each band's rate applies only to
the fares inside it, like tax brackets.

Cliff is simpler to explain but breaks at the boundary. At $999 of monthly fares a driver keeps
$799.20 and RIDO earns $199.80. At $1,001, a cliff re-rates the *whole month* to 12%: the driver
keeps $880.88 and **RIDO's revenue falls to $120.12 — an $80 drop from $2 more GMV.** RIDO's
revenue becomes non-monotonic in volume, and every driver sitting near $1,000 has an $80 reason
to time rides around the line rather than take the next request.

> Note: earlier docs justified this by saying a cliff lets "more earnings yield less take-home."
> That's inverted — with *decreasing* rates the driver's take-home jumps up at the line. The
> party that loses money from more volume is RIDO. The decision is unchanged; the reasoning
> above is the correct one.

Bracketed then raises a second question: when do you compute it? Rating at month-end requires a
reconciliation job and means a driver can't be told what they keep at the moment they accept.

## Decision

**Bracketed (marginal), computed per ride at completion against the driver's month-to-date fare
volume, and snapshotted onto the `rides` row** as `commission_rate_bps`, `commission_cents`, and
`driver_payout_cents`.

**A historical ride's commission is never recomputed from current tiers.**

## Consequences

- Per-ride bracketing is mathematically identical to re-bracketing the whole month, so there is
  **no month-end reconciliation job and no whole-month re-rating** to build or debug.
- The driver can be shown "you keep $X.XX (Y%)" at the moment of accepting — the wedge becomes
  visible on every ride rather than a monthly surprise.
- Tier rates can change without invalidating history, because history is snapshotted. This is
  what makes `commission_tiers` safe to edit as configuration.
- `driver_monthly_stats` becomes load-bearing: the MTD figure must be updated atomically on
  completion or two concurrent rides will both read a stale position and under-charge.
- The math must be exact in integer cents — `commission + payout === fare`, always — because the
  snapshot is the accounting record, not a cache.

**Rejected:** cliff tiers. RIDO's revenue is non-monotonic in GMV, the $1,000 and $3,000 lines
are worth ~$80 and ~$120 to game, and the rule is impossible to state honestly to a driver.
Bracketed is smooth: at $1,001 the commission is $200.00 + $0.12 = $200.12, and there is no line
to stand on.
