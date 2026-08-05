# Ride completion — the critical path

*Moved out of the schema doc because it's the one flow where a mistake corrupts the accounting
record. Tables: `data-model.md`. The rule being implemented: `../decisions/0002-bracketed-per-ride-commission.md`.*

**Status: not built.** This is the design.

## `completeRide` Edge Function

Runs server-side when a ride completes. Never invoked from a client with a client-supplied fare.

1. Load the driver's month-to-date `gross_fare_cents` from `driver_monthly_stats` for the
   current `year_month` (computed in `America/Los_Angeles`).
2. Compute the **bracketed** commission on *this ride's* `fare_cents`, applied across the active
   `commission_tiers` **starting from the driver's MTD position** — so a ride that straddles a
   band boundary is split at the boundary, not rated wholesale. Call `@rido/pricing`; do not
   implement this here.
3. **Snapshot** `commission_rate_bps` (the effective blended rate for this ride),
   `commission_cents`, and `driver_payout_cents` onto the `rides` row.
4. Mark the ride `completed` and set `completed_at`.

## `bump_monthly_stats` trigger

Fires on `rides` transitioning to `completed`. Atomically upserts the driver's
`driver_monthly_stats` row for `year_month`: increments `rides_count`, adds `gross_fare_cents`,
`commission_cents`, `payout_cents`.

This is what keeps step 1 correct. **Without atomicity, two rides completing concurrently for the
same driver both read the same stale MTD position and both under-charge** — and because step 3
snapshots, the error is permanent in the books. Test it under concurrent completions.

## Why there is no reconciliation job

Per-ride bracketing against a running MTD total is mathematically identical to re-bracketing the
whole month at month-end. Each dollar is charged at its band's rate either way. So there is no
batch job, no month-end re-rating, and no window where a driver's stated payout differs from
their actual one.

Worked check — at $1,001 of month-end fares: $1,000 × 20% + $1 × 12% = $200.12. Same figure
whether computed ride-by-ride or in one pass at month end.

## Invariants this flow must preserve

- `commission_cents + driver_payout_cents === fare_cents`, exactly. No rounding drift.
- A completed ride's commission fields are **never** rewritten — not by a tier change, not by a
  backfill, not by a correction. A correction is a new adjustment row, not an edit.
- `fare_cents` is never taken on trust from a client.
- Money stays in integer cents from the database through the function to the response.
