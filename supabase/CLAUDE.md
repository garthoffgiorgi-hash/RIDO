# supabase — CLAUDE.md

Migrations are the **only** source of truth for schema. Never change the database by hand, and
never edit a migration that has been applied — add a new one.

Tables: `drivers` · `subscriptions` · `rides` · `driver_monthly_stats` · `commission_tiers`.
Field-level detail: `docs/architecture/data-model.md`. Completion flow:
`docs/architecture/ride-completion.md`.

## Schema rules

- **Currency columns are `bigint` and suffixed `_cents`. Rates are `integer` and suffixed
  `_bps`.** No `numeric`, no `money`, no `real`, no `double precision` for money — anywhere, for
  any reason. (Coordinates are the one non-money case that's legitimately `double precision` —
  `pickup/dropoff_lat/lng` on `rides` — since that's what every mapping API hands back and this
  rule is about currency representation, not floats in general.)
- `rides.commission_rate_bps`, `rides.commission_cents`, `rides.driver_payout_cents` are
  **write-once at completion**, enforced by a trigger (a `CHECK` can't compare old vs new) —
  never backfilled, never recomputed from current tiers.
- `commission_tiers` is configuration, not code. Changing a rate is a row change, not a deploy.
  Tiers carry `effective_from` and `active` so a change is auditable rather than destructive.
- The driver activation gate is a **check constraint plus RLS**, not application logic:
  `status = 'active'` requires background check and vehicle inspection both `'passed'`.
- Timestamps are `timestamptz` stored UTC. `year_month` is `text` (`'2026-06'`) computed in
  `America/Los_Angeles` by the one canonical `rido_year_month()` function — never re-derived at
  a call site — with a unique constraint on `(driver_id, year_month)`.
- Migration filenames: `<timestamp>_<verb>_<subject>.sql`. One concern per migration.
- **Grant base table privileges explicitly — don't assume Supabase does it for you.** Supabase
  used to grant `anon`/`authenticated`/`service_role` access to every new `public` table by
  default; as of an April 2026 platform change that's an opt-in project setting, not a
  guarantee. RLS only matters once a role can reach the table at all, so every migration here
  pairs its `CREATE POLICY` statements with an explicit `GRANT`.

## RLS

**On by default, on every table. A new table without a policy is a leak, and it will ship.**

- Drivers read their own `drivers`, `subscriptions`, and `driver_monthly_stats` rows, and can
  update a narrow, explicitly column-granted subset of `drivers` (contact and vehicle info —
  never `status` or a compliance column). `subscriptions` and `driver_monthly_stats` are
  **read-only even to their own driver** — both are written exclusively by the service role
  (Stripe webhooks; the rollup trigger) since a driver-writable fee state or MTD figure is a
  direct revenue/commission-integrity hole, not a permissions nuance.
- Riders read only their own `rides`; drivers read only rides where they're the driver. Neither
  has ever had an `INSERT`/`UPDATE` grant on `rides`, and the rider booking flow that now
  exists (ADR-0012) still doesn't need one — `requestRide()`/`cancelRide()` write through the
  service role, gated by `requireUser()` inside the function rather than by a policy. Driver
  accept, when it's built, decides its own write path the same way rather than inheriting one.
- Commission columns on `rides` are writable **only by the service role**. Not by the driver, not
  by the rider, not by an authenticated user with a clever payload.
- Write a pgTAP test for every policy. A policy with no test is an assumption.

## Edge Functions

- Functions **import `@rido/pricing` and call it.** They never re-implement the math.
  `supabase/functions/deno.json` maps that specifier to `packages/pricing/src/index.ts` — one
  shared alias for every function, verified to resolve, run, and bundle under Deno (ADR-0005).
  Write `import { commissionForRide } from "@rido/pricing"`, not a `../../../` relative path.
- `complete-ride` is the critical path: read the active tiers and the driver's MTD position →
  rate the ride with `@rido/pricing` → hand the result to `apply_ride_commission`, which locks,
  re-checks the MTD position, and writes. The snapshot and `status = 'completed'` are **one
  UPDATE**, because `rides_commission_present_iff_completed` won't accept them as two. Full flow
  and the concurrency argument: `docs/architecture/ride-completion.md` (ADR-0008).
- **The transaction belongs in SQL, not the function.** supabase-js auto-commits every call, so a
  lock taken from Deno is released before the commission is computed. Correctness comes from
  compare-and-swap: the caller passes back the MTD figure it rated against, and
  `apply_ride_commission` refuses if it moved. Retry on `conflict`; nothing is written until the
  check passes.
- **Nothing goes between the lock and COMMIT** but the MTD re-read, the comparison and the UPDATE.
  A function with a 2s CPU cap holding a per-driver month lock is not where optimization runs.
- **Split each function into a pure core and a thin shell.** `core.ts` (no SDK, no clock, no
  HTTP) is what a future worker or batch simulation can reuse; `index.ts` owns the request. The
  SDK is imported in exactly one file per function — ADR-0006's boundary, applied on Deno.
- **Never trust a `fare_cents` sent by a client.** Read it from the `rides` row. The request names
  a ride; it does not describe one.
- Deploy with `--use-api` (no Docker required). The service-role key stays inside the function —
  never in `deno.json`, which is committed and holds only import aliases.
- **A new function that imports `@rido/pricing` needs a `[functions.<name>]` table in
  `supabase/config.toml`** pointing `import_map` at `./functions/deno.json`. `functions deploy`
  does not discover the shared `deno.json` on its own — without this entry it looks for
  `supabase/functions/<name>/deno.json` instead, finds nothing, and fails deploy with "Relative
  import path @rido/pricing not prefixed with / or ./ or ../". Confirmed on `complete-ride`'s
  first real deploy (ADR-0005). Copy the `[functions.complete-ride]` block for the next function.
- **`rides` stores addresses, not coordinates, through the pilot.** `pickup_address`/
  `dropoff_address` hold what the rider saw; `pickup_lat/lng` stay null because Search Box results
  may not be stored and permanent geocoding is deliberately off. The addresses are the input to a
  later backfill, which is cheaper than paying per booking. `distance_meters` is the distance
  actually driven and `duration_seconds` is `completed_at - started_at` — neither is ever the
  routed estimate. (ADR-0011)
- **`rides.driver_id` is nullable while `status` is `'requested'` or `'canceled'`**, enforced by
  `rides_driver_present_unless_pending` — every other status still requires one, in the
  database, not by convention. `rides_one_active_per_rider` (a partial unique index) is what
  actually stops a rider from having two live requests; an app-level check would race under a
  concurrent second request. (ADR-0012)
- Regenerate `database.types.ts` (`npm run types:generate`) after applying migrations, so a
  function's row shapes stop being hand-written projections.

## Tests (`supabase/tests/`, pgTAP)

Required, not optional — the compliance gate has to hold in the database and not only the app,
so it is tested there and not only through the app (ADR-0007).

At minimum, assert that: an unvetted driver cannot reach `status = 'active'`; a driver cannot
read another driver's rides; a non-service-role write to a commission column is rejected; and
`bump_monthly_stats` is atomic under concurrent completions for the same driver.

**A column added to a table with RLS inherits that table's policies** — `007_ride_addresses.sql`
proves that for `pickup_address`/`dropoff_address` rather than assuming it. Worth repeating for
the next column added to `rides`: the policy doesn't need changing, but the proof that it still
covers the row does.

The last one has a real limit: `pg_prove`/`supabase test db` run one connection at a time, so
pgTAP alone can prove the rollup's *arithmetic* but not true concurrent-connection locking.
`concurrent-completion.sh` (plain `psql`, no added dependency) is the separate, standalone proof
that `reserve_driver_month()` actually blocks a second completion rather than letting it read a
stale month-to-date figure — run it manually against a real instance; it isn't part of `test db`.
