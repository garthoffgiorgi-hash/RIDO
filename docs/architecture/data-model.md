# RIDO — Data Model

> Implemented in `supabase/migrations/` — this is a human-readable summary; **the migrations are
> the source of truth**, per `supabase/CLAUDE.md`. Where this doc and the migrations disagree,
> the migrations win; fix this doc in the same commit that proves it wrong. Tables only — the
> completion flow lives in `ride-completion.md`, the bracketed-commission decision in
> `../decisions/0002-bracketed-per-ride-commission.md`.
>
> **Status: built and verified** (migrations applied and exercised against a real Postgres —
> constraints, triggers, and RLS all confirmed to do what this doc says; `pg_prove` green).
> Not yet applied to the live project — that's a manual step, see `supabase/CLAUDE.md`.

## Stack
PostgreSQL via **Supabase** (+ RLS + Edge Functions). Next.js/Vercel frontend, Stripe payments, Mapbox maps. Migrating off Base44.

## Schema — five core tables

### `drivers`
Identity, vehicle, and compliance state.
`id` · `auth_user_id` → `auth.users`, cascades · `full_name` · `email` · `phone` · `status` (`pending` | `active` | `suspended`) · `background_check_status` (`pending`|`passed`|`failed`) · `dmv_check_status` (`pending`|`passed`|`failed`) · `vehicle_inspection_status` (`pending`|`passed`|`failed`) · `vehicle_inspection_date` · `training_completed` (bool) · `vehicle_make/model/year/plate` · `stripe_account_id` (Connect) · `created_at` · `updated_at` (trigger-maintained).
**Activation gate:** `status='active'` requires background + inspection passed — a table `CHECK` constraint, not just app logic. `dmv_check_status`/`vehicle_inspection_status` values weren't specified anywhere; inferred to mirror `background_check_status`.
**RLS:** a driver reads and updates their own row; the update grant covers only contact/vehicle columns, never `status` or a compliance field. No `INSERT` for `authenticated` — the initial row is created by an admin/vetting process under the service role.

### `subscriptions`
The flat-fee relationship (Stripe-backed). Drives pilot vs steady.
`id` · `driver_id` → drivers, cascades · `plan` (`pilot` | `standard`) · `flat_fee_cents` (0 during pilot, 5000 standard) · `status` (`active`|`past_due`|`canceled`) · `current_period_start/end` · `fee_active` (bool — the traction-gated flip) · `stripe_subscription_id` · `created_at`. Unique partial index enforces at most one `active` row per driver.
**RLS:** a driver reads only their own row. No write access even to their own row — subscription state changes come from Stripe webhooks under the service role; a driver-writable `fee_active`/`flat_fee_cents` would be a revenue-integrity hole.

### `rides`
One row per ride. **Commission is snapshotted here at completion — never recomputed.**
`id` · `rider_id` → `auth.users` directly (no `riders` table exists) · `driver_id` → drivers · `status` (`requested`|`accepted`|`in_progress`|`completed`|`canceled`) · `fare_cents` · **`commission_rate_bps`** (snapshot, basis points) · **`commission_cents`** (snapshot) · **`driver_payout_cents`** (snapshot) · `pickup_lat/lng` · `dropoff_lat/lng` · `pickup_address` · `dropoff_address` · `requested_at` · `accepted_at` · `started_at` · `completed_at` · `created_at` · `distance_meters` · `duration_seconds` · generated `pickup_geog`/`dropoff_geog`. Two `CHECK` constraints enforce the commission columns exist iff `status='completed'`, and `commission_cents + driver_payout_cents = fare_cents` exactly. A trigger blocks any rewrite of the three commission columns once set.

**What the location and trip columns hold** is ADR-0011, not a matter of taste. The four lifecycle timestamps are RIDO's own clock and carry no vendor restriction — they are the whole temporal half of a demand heatmap, available from the first completed ride. `pickup_address`/`dropoff_address` hold the address line the rider saw; the lat/lng pair stays **null through the pilot** because Search Box results may not be stored and permanent geocoding is deliberately switched off, so the addresses are the input to a later backfill. `duration_seconds` is `completed_at − started_at`. `distance_meters` needs a GPS trace and stays null until the driver app exists — it is never the routed estimate. See `../decisions/0011-what-a-completed-ride-records.md`.
**RLS:** a rider reads their own rides, a driver reads rides where they're the driver. No `INSERT`/`UPDATE` for `authenticated` at all yet — the booking flow doesn't exist, so there's no real transition logic to write a policy for; every write goes through the service role until that flow ships its own migration.

### `driver_monthly_stats`
Per-driver, per-month rollup. Powers tier lookup and reporting. Maintained atomically by trigger.
`id` · `driver_id` → drivers, cascades · `year_month` (text, e.g. `2026-06`) · `rides_count` · `gross_fare_cents` · `commission_cents` · `payout_cents` · `updated_at`. Unique on (`driver_id`, `year_month`). A `CHECK` enforces `commission_cents + payout_cents = gross_fare_cents`.
**RLS:** a driver reads only their own row. No write access at all for `authenticated` — this table is fed exclusively by the `bump_monthly_stats` trigger.

### `commission_tiers`
Config — the graduated rates, editable without deploy.
`id` · `tier_order` · `lower_bound_cents` · `upper_bound_cents` (null = ∞) · `rate_bps` · `active` (bool) · `effective_from`. Unique on (`tier_order`, `effective_from`) — required for `supabase/seed/commission_tiers.sql`'s `ON CONFLICT` to be valid. Seed: (0–100000 → 2000 bps), (100000–300000 → 1200 bps), (300000–null → 800 bps).
**RLS:** every signed-in user can read the current rates. No write policy for anyone — a rate change is a row edit via the dashboard or a service-role script, never the app.

## Functions

`rido_year_month(timestamptz)` — the one canonical `America/Los_Angeles` bucketing conversion.
`reserve_driver_month(driver_id, completed_at)` — takes the MTD row's lock before it's read;
the fix for a race a naive rollup trigger alone doesn't cover, see `ride-completion.md`.
`bump_monthly_stats()` — the rollup trigger. `set_updated_at()` — generic, reused wherever a
table needs a maintained `updated_at`. `prevent_commission_rewrite()` — the write-once trigger
on `rides`.

## Not built, in this pass or any prior one

The CPUC 0.33% fee and airport surcharges (`../compliance/ca-tnc.md` calls both out as needing
to be "first-class line items") have no schema anywhere yet. Neither does an adjustment-row
table — `ride-completion.md`'s "a correction is a new row, not an edit" rule currently has
nowhere to write to. Both are real future work, not decided here.

## The completion flow

How a ride's commission is computed, snapshotted, and rolled into monthly stats — moved to
`ride-completion.md` because it's the one flow where a mistake corrupts the accounting record.

The bracketed-vs-cliff decision and why cliff was rejected: `../decisions/0002-bracketed-per-ride-commission.md`.

## Other architecture notes
- **Currency:** integer cents everywhere. No floats.
- **Time:** store UTC; compute `year_month` in America/Los_Angeles (SD market) — fix and document the boundary.
- **RLS:** drivers see only their own rows; riders only theirs; service role for Edge Functions.
- **Payouts:** Stripe Connect to drivers; flat fee via Stripe subscription (skipped/zeroed during pilot via `flat_fee_cents=0` / `fee_active=false`).
