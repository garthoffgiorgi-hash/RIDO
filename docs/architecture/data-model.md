# RIDO — Data Model

> Reconstructed from prior technical sessions. **Reconcile with the actual migrations** — where
> this and `supabase/migrations/` disagree, the migrations win; then update this doc. Tables
> only — the completion flow lives in `ride-completion.md`, the bracketed-commission decision in
> `../decisions/0002-bracketed-per-ride-commission.md`.
>
> **Status: none of this is built yet.** No migrations exist. This is the target design.

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

## The completion flow

How a ride's commission is computed, snapshotted, and rolled into monthly stats — moved to
`ride-completion.md` because it's the one flow where a mistake corrupts the accounting record.

The bracketed-vs-cliff decision and why cliff was rejected: `../decisions/0002-bracketed-per-ride-commission.md`.

## Other architecture notes
- **Currency:** integer cents everywhere. No floats.
- **Time:** store UTC; compute `year_month` in America/Los_Angeles (SD market) — fix and document the boundary.
- **RLS:** drivers see only their own rows; riders only theirs; service role for Edge Functions.
- **Payouts:** Stripe Connect to drivers; flat fee via Stripe subscription (skipped/zeroed during pilot via `flat_fee_cents=0` / `fee_active=false`).
