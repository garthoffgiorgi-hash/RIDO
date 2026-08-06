# supabase — CLAUDE.md

Migrations are the **only** source of truth for schema. Never change the database by hand, and
never edit a migration that has been applied — add a new one.

Tables: `drivers` · `subscriptions` · `rides` · `driver_monthly_stats` · `commission_tiers`.
Field-level detail: `docs/architecture/data-model.md`. Completion flow:
`docs/architecture/ride-completion.md`.

## Schema rules

- **Money columns are `bigint` and suffixed `_cents`. Rates are `integer` and suffixed `_bps`.**
  No `numeric`, no `money`, no `real`, no `double precision` — anywhere, for any reason.
- `rides.commission_rate_bps`, `rides.commission_cents`, `rides.driver_payout_cents` are
  **write-once at completion**. Never backfilled, never recomputed from current tiers.
- `commission_tiers` is configuration, not code. Changing a rate is a row change, not a deploy.
  Tiers carry `effective_from` and `active` so a change is auditable rather than destructive.
- The driver activation gate is a **check constraint plus RLS**, not application logic:
  `status = 'active'` requires background check and vehicle inspection both `'passed'`.
- Timestamps are `timestamptz` stored UTC. `year_month` is `text` (`'2026-06'`) computed in
  `America/Los_Angeles`, with a unique constraint on `(driver_id, year_month)`.
- Migration filenames: `<timestamp>_<verb>_<subject>.sql`. One concern per migration.

## RLS

**On by default, on every table. A new table without a policy is a leak, and it will ship.**

- Drivers read and update only their own `drivers`, `subscriptions`, and `driver_monthly_stats`
  rows. Riders read only their own `rides`.
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

At minimum, assert that: an unvetted driver cannot reach `status = 'active'`; a driver cannot
read another driver's rides; a non-service-role write to a commission column is rejected; and
`bump_monthly_stats` is atomic under concurrent completions for the same driver.
