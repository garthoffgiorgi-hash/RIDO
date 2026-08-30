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
- Riders read only their own `rides`; drivers read only rides where they're the driver, **plus**
  (new, ADR-0013) any active driver reads every unassigned `'requested'` ride — the open pool a
  dispatch board needs. That policy is PERMISSIVE, ORing with the two ownership policies rather
  than narrowing either. Neither `INSERT` nor `UPDATE` has ever been granted on `rides` to
  `authenticated` — the rider booking flow (ADR-0012) and driver accept (ADR-0013) both write
  through the service role instead, gated by `requireUser()` inside the function rather than by a
  policy.
- **A nullable column compared with `IN (subquery)` in an RLS policy silently hides rows where
  it's null** — SQL's three-valued logic makes the comparison neither `TRUE` nor `FALSE`, and RLS
  refuses anything short of `TRUE`. This bit `rides_select_own_as_driver` the moment `driver_id`
  became nullable (ADR-0012): every open request was invisible to every driver until ADR-0013
  added a policy that checks `driver_id IS NULL` explicitly instead. No fixture caught it because
  every prior `rides` row in the test suite bound a driver at insert. Worth checking for on the
  next nullable column added to a table with an `IN (subquery)` policy already on it.
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
  and the concurrency argument: `docs/architecture/ride-completion.md` (ADR-0008). **The app now
  calls it** (ADR-0014) — `apps/web/CLAUDE.md`'s Rules section is where the caller-side pattern
  (forward the driver's own token, never the service-role key) lives, since that half of the
  contract is the app's to keep, not this function's.
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
  actually driven and `duration_seconds` is `completed_at - started_at`, derived by a trigger
  (`set_ride_duration`, ADR-0014) rather than computed at write time — neither is ever the routed
  estimate. (ADR-0011)
- **`rides.driver_id` is nullable while `status` is `'requested'` or `'canceled'`**, enforced by
  `rides_driver_present_unless_pending` — every other status still requires one, in the
  database, not by convention. `rides_one_active_per_rider` (a partial unique index) is what
  actually stops a rider from having two live requests; an app-level check would race under a
  concurrent second request. (ADR-0012) Its driver-side mirror, `rides_one_active_per_driver`
  (total, not partial — `driver_id` is never null in the two statuses it covers), stops a driver
  from holding two accepted rides at once. (ADR-0013)
- **Driver accept is one conditional `UPDATE`, not a lock.** `WHERE status = 'requested' AND
  driver_id IS NULL` in the same statement that sets `driver_id`/`status`/`accepted_at` is the
  entire concurrency mechanism — accept touches exactly one row, so Postgres's own row-level
  locking serializes two drivers racing it without any of `apply_ride_commission`'s compare-and-
  swap machinery. That machinery exists because completion touches *two* rows (the ride and the
  month rollup); reaching for it here would solve a problem accept doesn't have. (ADR-0013)
- **`rides.started_at` is required exactly while `status = 'in_progress'`**
  (`rides_started_at_present_iff_in_progress`) and required nowhere else — a ride may still
  complete straight from `'accepted'` with no `started_at` at all, since `apply_ride_commission`
  has always accepted both statuses. Start-trip is the same conditional-`UPDATE` shape accept
  uses: `WHERE status = 'accepted' AND driver_id = ?`, no lock needed, only this ride's own driver
  can ever match the predicate. (ADR-0014)
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
`concurrent-completion.sh` (plain `psql`, no added dependency) is the standalone proof that
`reserve_driver_month()` actually blocks a second completion rather than letting it read a stale
month-to-date figure. `concurrent-accept-ride.sh` proves the same class of thing for accept — two
connections racing one ride, asserting exactly one wins and the loser genuinely blocked rather than
losing by luck — even though accept needs no lock of its own to get there (ADR-0013). Run these
manually against a real instance; neither is part of `test db`.

**`concurrent-apply-ride-commission.sh` is retired.** It raced two *different* rides for one
driver to completion — but `rides_one_active_per_driver` (ADR-0013) makes that setup illegal now:
a driver holds at most one `'accepted'`/`'in_progress'` ride at a time, so two of their rides can
never both be completable at once through any real code path. `reserve_driver_month()`'s lock
stays regardless — it becomes load-bearing again the moment a future feature relaxes that
constraint (driver ride queuing, say). Full account: `docs/architecture/ride-completion.md`.
