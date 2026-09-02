# RIDO — Data Model

> Implemented in `supabase/migrations/` — this is a human-readable summary; **the migrations are
> the source of truth**, per `supabase/CLAUDE.md`. Where this doc and the migrations disagree,
> the migrations win; fix this doc in the same commit that proves it wrong. Tables only — the
> completion flow lives in `ride-completion.md`, the bracketed-commission decision in
> `../decisions/0002-bracketed-per-ride-commission.md`.
>
> **Status: built and verified** (migrations applied and exercised against a real Postgres —
> constraints, triggers, and RLS all confirmed to do what this doc says; `pg_prove` green) —
> **and applied to the live project**, with `database.types.ts` regenerated against it.

## Stack
PostgreSQL via **Supabase** (+ RLS + Edge Functions). Next.js/Vercel frontend, Stripe payments, Mapbox maps. Migrating off Base44.

## Schema — nine core tables

### `drivers`
Identity, vehicle, and compliance state.
`id` · `auth_user_id` → `auth.users`, cascades · `full_name` · `email` · `phone` · `status` (`pending` | `active` | `suspended`) · `background_check_status` (`pending`|`passed`|`failed`) · `dmv_check_status` (`pending`|`passed`|`failed`) · `vehicle_inspection_status` (`pending`|`passed`|`failed`) · `vehicle_inspection_date` · `training_completed` (bool) · `vehicle_make/model/year/plate` · `stripe_account_id` (Connect Express, written by RIDO's server at onboarding) · `stripe_payouts_enabled` · `stripe_details_submitted` (both mirrored from a signature-verified `account.updated` webhook — ADR-0015) · `created_at` · `updated_at` (trigger-maintained).
Plus **`accepting_rides`** (bool, default `true`, ADR-0019) — the driver's own online/offline state. The UI calls it Online/Offline; it gates *accepting only*, so an offline driver still sees the whole open board and still finishes a ride they already hold.
**Activation gate:** `status='active'` requires background + inspection passed — a table `CHECK` constraint, not just app logic. `dmv_check_status`/`vehicle_inspection_status` values weren't specified anywhere; inferred to mirror `background_check_status`.
**RLS:** a driver reads and updates their own row; the update grant covers only contact/vehicle columns **plus `accepting_rides`** — never `status`, a compliance field, or any of the three `stripe_*` columns, which are Stripe's word about an external system and written only by the service role. `accepting_rides` earns its place by the rule ADR-0019 states: *one writer forever → column grant; possibly-many writers → service role*, and a driver's willingness to work is something only they can assert. No `INSERT` for `authenticated` — the initial row is created by an admin/vetting process under the service role.

### `subscriptions`
The flat-fee relationship (Stripe-backed). Drives pilot vs steady.
`id` · `driver_id` → drivers, cascades · `plan` (`pilot` | `standard`) · `flat_fee_cents` (0 during pilot, 5000 standard) · `status` (`active`|`past_due`|`canceled`) · `current_period_start/end` · `fee_active` (bool — the traction-gated flip) · `stripe_subscription_id` · `created_at`. Unique partial index enforces at most one `active` row per driver.
**RLS:** a driver reads only their own row. No write access even to their own row — subscription state changes come from Stripe webhooks under the service role; a driver-writable `fee_active`/`flat_fee_cents` would be a revenue-integrity hole.

### `rides`
One row per ride. **Commission is snapshotted here at completion — never recomputed.**
`id` · `rider_id` → `auth.users` directly (no `riders` table exists) · `driver_id` → drivers, **nullable** while `status` is `'requested'` or `'canceled'` · `status` (`requested`|`accepted`|`in_progress`|`completed`|`canceled`) · `fare_cents` (commissionable) · **`rider_total_cents`** (what the rider is CHARGED — fare plus non-commissionable pass-throughs, `>= fare_cents`, nullable for pre-ADR-0017 rows; commission still splits `fare_cents` alone, so `rides_commission_sums_to_fare` is untouched) · **`commission_rate_bps`** (snapshot, basis points) · **`commission_cents`** (snapshot) · **`driver_payout_cents`** (snapshot) · `pickup_lat/lng` · `dropoff_lat/lng` · `pickup_address` · `dropoff_address` · `requested_at` · `accepted_at` · `started_at` · `completed_at` · `canceled_at` · `created_at` · `distance_meters` · `duration_seconds` · generated `pickup_geog`/`dropoff_geog`. `CHECK` constraints enforce the commission columns exist iff `status='completed'`; `commission_cents + driver_payout_cents = fare_cents` exactly; `driver_id` is set whenever `status` is anything but `'requested'`/`'canceled'` (`rides_driver_present_unless_pending`); and (new, ADR-0014) `started_at` is set whenever `status = 'in_progress'` (`rides_started_at_present_iff_in_progress`) — but never required at completion, since a ride may still complete straight from `'accepted'`. A partial unique index (`rides_one_active_per_rider`) permits at most one live ride per rider; its driver-side mirror (`rides_one_active_per_driver`, total rather than partial-on-nullable — see ADR-0013) permits at most one `'accepted'`/`'in_progress'` ride per driver. A trigger blocks any rewrite of the three commission columns once set. `accepted_at` is written by the accept path's conditional `UPDATE` (ADR-0013); `started_at` by the start-trip path's, the same shape (ADR-0014).

**What the location and trip columns hold** is ADR-0011, not a matter of taste. The four lifecycle timestamps are RIDO's own clock and carry no vendor restriction — they are the whole temporal half of a demand heatmap, available from the first completed ride. `pickup_address`/`dropoff_address` hold the address line the rider saw; the lat/lng pair stays **null through the pilot** because Search Box results may not be stored and permanent geocoding is deliberately switched off, so the addresses are the input to a later backfill. `duration_seconds` is `completed_at − started_at`, derived by a trigger (`set_ride_duration`) on completion — `null` when `started_at` never was, which is legal (a ride may complete straight from `'accepted'`). `distance_meters` needs a GPS trace and stays null until the driver app exists — it is never the routed estimate. See `../decisions/0011-what-a-completed-ride-records.md`.
**RLS:** a rider reads their own rides, a driver reads rides where they're the driver, and (new) an **active** driver also reads every `'requested'` ride with no driver yet — the open pool a dispatch board needs (`rides_select_open_requests_as_active_driver`, PERMISSIVE, ORs with the other two). Still no `INSERT`/`UPDATE` grant for `authenticated` at all, deliberately — both the rider booking flow and the driver accept flow write through the service role instead (`../decisions/0012-rider-books-server-owns-the-write.md`, `../decisions/0013-driver-accepts-one-row-one-update.md`), so there was never a real transition to write a policy for.

### `driver_monthly_stats`
Per-driver, per-month rollup. Powers tier lookup and reporting. Maintained atomically by trigger.
`id` · `driver_id` → drivers, cascades · `year_month` (text, e.g. `2026-06`) · `rides_count` · `gross_fare_cents` · `commission_cents` · `payout_cents` · `updated_at`. Unique on (`driver_id`, `year_month`). A `CHECK` enforces `commission_cents + payout_cents = gross_fare_cents`.
**RLS:** a driver reads only their own row. No write access at all for `authenticated` — this table is fed exclusively by the `bump_monthly_stats` trigger.

### `driver_payouts`
What RIDO owes a driver, and whether it has been sent — the ledger `driver_payout_cents` never had. Full flow: `payouts.md`; why it's shaped this way: `../decisions/0015-connect-payouts-per-ride.md`.
`id` · `driver_id` → drivers, **restrict** (a financial record blocks deleting the driver it points at) · `ride_id` → rides, **nullable and restrict** (null is the seam for the Prop 22 two-week top-up and the adjustment rows `ride-completion.md` calls for; nothing creates one yet) · `amount_cents` (`> 0`, not `>= 0` — Stripe rejects a zero transfer and a zero payout means something computed wrongly) · `status` (`pending`|`paid`|`failed`) · `stripe_transfer_id` · `failure_reason` · `created_at` · `updated_at` (trigger-maintained).
**Constraints:** `driver_payouts_transfer_id_iff_paid` — a `paid` row must carry its receipt and a non-`paid` row must not claim one. Two partial unique indexes: `driver_payouts_one_per_ride` (a ride is owed for at most once) and one on `stripe_transfer_id`. Together with Stripe's own idempotency key (the payout row's id) that makes a duplicate transfer impossible from two independent directions.
**Written by trigger, not by application code:** `queue_driver_payout` fires on the same `→ completed` transition `bump_monthly_stats` watches, so the debt is recorded *inside* the completion transaction — a ride is completed and owed for atomically, or neither. A zero-payout ride is skipped rather than written.
**RLS:** a driver reads only their own rows, and writes none — matching `driver_monthly_stats` and for the same reason: a driver who could mark unsent money `paid`, or paid money `pending`, is a cash-integrity hole.

### `ride_charges`
What RIDO has held on a rider's card and what it has taken — the inbound mirror of `driver_payouts`. Full flow: `rider-charging.md`; why: `../decisions/0017-rider-charging.md`.
`id` · `ride_id` → rides, **restrict** · `rider_id` → `auth.users`, **restrict** · `authorized_cents` (`> 0` — Stripe rejects a zero authorization) · `captured_cents` (null until capture, never above `authorized_cents`) · `status` (`authorizing`|`authorized`|`captured`|`voided`|`failed`) · `stripe_payment_intent_id` · `failure_reason` · `attempt_count`/`settling`/`settling_since` (ADR-0016's claim, applied from the start) · `created_at` · `updated_at`.
**Deliberately no `kind` column.** A cancellation fee is a partial capture of the *same* hold a fare would have used, so what a captured row was for depends only on how the ride ended — and `rides.status` already says that, in one place, with nothing to drift.
**Constraints:** `ride_charges_captured_iff_settled` — a `captured` row carries both its amount and its PaymentIntent id, and a non-captured one claims neither. `ride_charges_one_live_per_ride` is partial on the unsettled statuses, so a `failed` authorization can be superseded by a new row ("a correction is a new row") while two live holds for one ride stay impossible.
**RLS:** a rider reads their own charges and writes none — a rider who could mark a hold `voided` would have a free ride.

### `rider_payment_profiles`
Who a rider is to Stripe, and which card they saved. A table rather than a column because there is no `riders` table — `rides.rider_id` points at `auth.users`, which is Supabase's.
`rider_id` (PK) → `auth.users`, **cascade** (a pointer and a display cache, not a financial record — the money lives in `ride_charges`, which restricts) · `stripe_customer_id` (unique) · `default_payment_method_id` (null is what makes `requestRide` return `needs_card`) · `card_brand` · `card_last4` (exactly 4) · `card_exp_month`/`card_exp_year` · `created_at` · `updated_at`.
**The card number is never here.** Stripe Elements collects it in the browser and returns a PaymentMethod reference; brand/last4/expiry exist only so a rider recognises their own card without a round trip.
**RLS:** read own, write none. Every column is Stripe's word about an external system.

### `ride_declines`
Which open requests a driver has waved off, so the board stops showing them. Why: `../decisions/0019-driver-controls-their-own-queue.md`.
`driver_id` → drivers, **cascade** · `ride_id` → rides, **cascade** · `declined_at` · primary key `(driver_id, ride_id)`.
**Cascade, not restrict** — this is a preference, not a financial record, so the `rider_payment_profiles` reasoning applies rather than `driver_payouts`'. It's also what keeps an un-decline trivially addable later: deleting a preference row is a normal operation.
**The composite PK is the whole mechanism.** Driver-first so `where driver_id = ? and ride_id in (…)` is served directly, and it makes a repeated decline `on conflict do nothing` — the same idempotence idiom `queue_driver_payout` uses. There is deliberately **no index on `ride_id` alone**: nothing queries by ride, and the only cascade that would want one fires on ride deletion, which never happens.
**RLS:** a driver reads their own declines and writes none — the insert goes through the service role, since unlike `accepting_rides` this has plausible future writers that aren't the driver (auto-decline on a dispatch timeout, an admin clearing declines).

### `commission_tiers`
Config — the graduated rates, editable without deploy.
`id` · `tier_order` · `lower_bound_cents` · `upper_bound_cents` (null = ∞) · `rate_bps` · `active` (bool) · `effective_from`. Unique on (`tier_order`, `effective_from`) — required for `supabase/seed/commission_tiers.sql`'s `ON CONFLICT` to be valid. Seed: (0–100000 → 2000 bps), (100000–300000 → 1200 bps), (300000–null → 800 bps).
**RLS:** every signed-in user can read the current rates. No write policy for anyone — a rate change is a row edit via the dashboard or a service-role script, never the app.

## Functions

`rido_year_month(timestamptz)` — the one canonical `America/Los_Angeles` bucketing conversion.
`reserve_driver_month(driver_id, completed_at)` — takes the MTD row's lock before it's read;
the fix for a race a naive rollup trigger alone doesn't cover, see `ride-completion.md`.
`bump_monthly_stats()` — the rollup trigger. `set_ride_duration()` — derives `duration_seconds`
from `started_at`/`completed_at` on the same completion transition, when both exist (ADR-0014).
`queue_cancellation_payout()` — the cancellation-side mirror, firing on the transition into
`'canceled'`. If a fee was captured, the driver gets it **in full** (ADR-0018; provisional — see
`README.md`'s open questions). The fee must be captured *before* the status flips, since this reads it.

`claim_ride_charge_attempt()` / `release_ride_charge_attempt()` — ADR-0016's exclusive claim,
mirrored for the inbound ledger rather than generalised: a shared version would need a table name
as a parameter, and dynamic SQL in a money path is not a trade worth nine saved lines.

`queue_driver_payout()` — writes the `driver_payouts` row on that same transition, so a completed
ride and the debt it creates are one atomic act (ADR-0015). `set_updated_at()` — generic, reused
wherever a table needs a maintained `updated_at`. `prevent_commission_rewrite()` — the write-once
trigger on `rides`.

## Not built, in this pass or any prior one

The CPUC 0.33% fee and airport surcharges (`../compliance/ca-tnc.md` calls both out as needing
to be "first-class line items") have no schema anywhere yet — and when they land, what a rider is
charged stops equalling `rides.fare_cents`, which has no `rider_total_cents` column to hold the
difference (`FareQuote` already distinguishes the two; the table does not). Real future work, not
decided here.

An adjustment-row table is **half-answered**: `driver_payouts.ride_id` is nullable precisely so a
correction or a Prop 22 top-up has somewhere to be written without editing a settled row, which is
what `ride-completion.md`'s "a correction is a new row, not an edit" asks for. Nothing creates one
yet, and adjustments to the *commission* side still have no home.

## The completion flow

How a ride's commission is computed, snapshotted, and rolled into monthly stats — moved to
`ride-completion.md` because it's the one flow where a mistake corrupts the accounting record.

The bracketed-vs-cliff decision and why cliff was rejected: `../decisions/0002-bracketed-per-ride-commission.md`.

## Other architecture notes
- **Currency:** integer cents everywhere. No floats.
- **Time:** store UTC; compute `year_month` in America/Los_Angeles (SD market) — fix and document the boundary.
- **RLS:** drivers see only their own rows; riders only theirs; service role for Edge Functions.
- **Payouts:** Stripe Connect Express to drivers, one transfer per completed ride against the `driver_payouts` ledger (`payouts.md`, ADR-0015). RIDO absorbs card processing, so a driver receives exactly `driver_payout_cents`. Flat fee via Stripe subscription is still unbuilt — skipped/zeroed during the pilot via `flat_fee_cents=0` / `fee_active=false`.
