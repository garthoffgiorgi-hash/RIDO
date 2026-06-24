# RIDO — Technical Architecture

> Reconstructed from our prior technical sessions. **Reconcile with your actual migrations/code** — where this and the repo disagree, the repo wins; then update this doc. Pairs with `../monetization-model.md` (the rules) and CLAUDE.md (the invariants).
>
> **Status (checked against the uploaded repo): none of this is built yet.** The repo is a static marketing site — no backend, no database, no app. Everything below is the target design to build. See `reconciliation.md`.

## Stack
PostgreSQL via **Supabase** (+ RLS + Edge Functions). Next.js/Vercel frontend, Stripe payments, Mapbox maps. Migrating off Base44.

## Schema — five core tables

### `drivers`
Identity, vehicle, and compliance state.
`id` · `auth_user_id` · `full_name` · `email` · `phone` · `status` (`pending` | `active` | `suspended`) · `background_check_status` (`pending`|`passed`|`failed`) · `dmv_check_status` · `vehicle_inspection_status` · `vehicle_inspection_date` · `training_completed` (bool) · `vehicle_make/model/year/plate` · `stripe_account_id` (Connect) · `created_at` · `updated_at`.
**Activation gate:** `status='active'` requires background + inspection passed (enforce via check/RLS + app).

### `subscriptions`
The flat-fee relationship (Stripe-backed). Drives pilot vs steady.
`id` · `driver_id` → drivers · `plan` (`pilot` | `standard`) · `flat_fee_cents` (0 during pilot, 5000 standard) · `status` (`active`|`past_due`|`canceled`) · `current_period_start/end` · `fee_active` (bool — the traction-gated flip) · `stripe_subscription_id` · `created_at`.

### `rides`
One row per ride. **Commission is snapshotted here at completion — never recomputed.**
`id` · `rider_id` · `driver_id` → drivers · `status` (`requested`|`accepted`|`in_progress`|`completed`|`canceled`) · `fare_cents` · **`commission_rate_bps`** (snapshot, basis points) · **`commission_cents`** (snapshot) · **`driver_payout_cents`** (snapshot) · `pickup_lat/lng` · `dropoff_lat/lng` · `requested_at` · `accepted_at` · `completed_at` · `created_at`.

### `driver_monthly_stats`
Per-driver, per-month rollup. Powers tier lookup and reporting. Maintained atomically by trigger.
`id` · `driver_id` → drivers · `year_month` (text, e.g. `2026-06`) · `rides_count` · `gross_fare_cents` · `commission_cents` · `payout_cents` · `updated_at`. Unique on (`driver_id`, `year_month`).

### `commission_tiers`
Config — the graduated rates, editable without deploy.
`id` · `tier_order` · `lower_bound_cents` · `upper_bound_cents` (null = ∞) · `rate_bps` · `active` (bool) · `effective_from`. Seed: (0–100000 → 2000 bps), (100000–300000 → 1200 bps), (300000–null → 800 bps).

## The completion flow (the critical path)

**`completeRide` Edge Function** (server-side, runs on ride completion):
1. Load the driver's month-to-date `gross_fare_cents` from `driver_monthly_stats` for the current `year_month`.
2. Compute the **bracketed** commission on *this* ride's `fare_cents`, applied across the active `commission_tiers` starting from the driver's MTD position (so the ride is split across whatever bands it spans).
3. **Snapshot** `commission_rate_bps` (effective blended for this ride), `commission_cents`, and `driver_payout_cents` onto the `rides` row.
4. Mark the ride `completed` (set `completed_at`).

**`bump_monthly_stats` trigger** (on `rides` → `completed`):
- Atomically upsert the driver's `driver_monthly_stats` row for `year_month`: increment `rides_count`, add `gross_fare_cents`, `commission_cents`, `payout_cents`. Keeps the MTD figure that step 1 reads — so tier lookups stay correct ride-to-ride without race conditions.

Keep the pure commission math in `lib/pricing/` (unit-tested at every tier boundary) and have the Edge Function call it, so the same logic is testable in isolation and reusable.

## DECIDED — bracketed per-ride (no reconciliation job)
Tiers are **bracketed (marginal)** and reset monthly. Each ride is rated against the driver's month-to-date volume at completion and **snapshotted** to the row (snapshotting principle above) — each dollar charged at its band's rate. This is mathematically identical to re-bracketing the whole month at month-end, so **no batch reconciliation job is required.**

Rejected: **cliff** (whole month re-rated to a single tier by total volume) — it makes more earnings sometimes yield *less* take-home and invites gaming the $1,000 / $3,000 thresholds. Bracketed is smooth, monotonic, and un-gameable. Example: at month-end $1,001 in fares, the driver pays $200.00 on the first $1,000 + $0.12 on the dollar over = $200.12 — never an $80 cliff.

## Other architecture notes
- **Currency:** integer cents everywhere. No floats.
- **Time:** store UTC; compute `year_month` in America/Los_Angeles (SD market) — fix and document the boundary.
- **RLS:** drivers see only their own rows; riders only theirs; service role for Edge Functions.
- **Payouts:** Stripe Connect to drivers; flat fee via Stripe subscription (skipped/zeroed during pilot via `flat_fee_cents=0` / `fee_active=false`).
