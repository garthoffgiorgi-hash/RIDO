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
  can currently write to `rides` at all — the booking flow doesn't exist yet, so there's no real
  transition logic to write a policy for. Every write goes through the service role until that
  flow ships its own migration with the policies it actually needs.
- Commission columns on `rides` are writable **only by the service role**. Not by the driver, not
  by the rider, not by an authenticated user with a clever payload.
- Write a pgTAP test for every policy. A policy with no test is an assumption.

## Edge Functions

- Functions **import `@rido/pricing` and call it.** They never re-implement the math.
  `supabase/functions/deno.json` maps that specifier to `packages/pricing/src/index.ts` — one
  shared alias for every function, verified to resolve, run, and bundle under Deno (ADR-0005).
  Write `import { commissionForRide } from "@rido/pricing"`, not a `../../../` relative path.
- `complete-ride` is the critical path, in this order: read MTD `gross_fare_cents` from
  `driver_monthly_stats` → compute the bracketed commission for *this* ride against that position
  → snapshot `commission_rate_bps` / `commission_cents` / `driver_payout_cents` onto `rides` →
  mark the ride `completed`. The `bump_monthly_stats` trigger then updates MTD atomically, so the
  next ride reads a correct position without a race.
- **Never trust a `fare_cents` sent by a client.** Verify it server-side against the quoted fare.
- Deploy with `--use-api` (no Docker required). The service-role key stays inside the function —
  never in `deno.json`, which is committed and holds only the import alias.

## Tests (`supabase/tests/`, pgTAP)

Required, not optional — the compliance gate has to hold in the database and not only the app,
so it is tested there and not only through the app (ADR-0007).

At minimum, assert that: an unvetted driver cannot reach `status = 'active'`; a driver cannot
read another driver's rides; a non-service-role write to a commission column is rejected; and
`bump_monthly_stats` is atomic under concurrent completions for the same driver.

The last one has a real limit: `pg_prove`/`supabase test db` run one connection at a time, so
pgTAP alone can prove the rollup's *arithmetic* but not true concurrent-connection locking.
`concurrent-completion.sh` (plain `psql`, no added dependency) is the separate, standalone proof
that `reserve_driver_month()` actually blocks a second completion rather than letting it read a
stale month-to-date figure — run it manually against a real instance; it isn't part of `test db`.
