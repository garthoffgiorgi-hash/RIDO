# RIDO — Build Roadmap

*The one doc that describes **current repo state**. Everything else here describes intent; this
describes fact. **If it disagrees with the filesystem, the filesystem wins — fix this file in the
same commit that proves it wrong.***

**Last verified: 2026-08-26** (branch `claude/intelligent-fermat-2xkydc`)

## TL;DR

The **money spine is complete end to end.** Scaffolding, context system, marketing surface, auth,
database schema, commission math, and the `complete-ride` Edge Function that joins them are all
built and tested — a ride can be rated and snapshotted correctly, including under concurrent
completions. What's missing is the **product around it**: no payments, no maps, no rider or driver
screens, and nothing that creates a ride in the first place.

## What exists (verified, not assumed)

| Area | State |
|---|---|
| Repo structure | Scoped `CLAUDE.md` per domain, ADRs, canonical-source map (`docs/README.md`) |
| Drift guard | `scripts/check-context.mjs` — reference resolution, size budgets, ADR citations, pricing-literal leakage |
| CI | `.github/workflows/ci.yml` — drift check, seed-vs-generated-tiers check, Biome, `packages/pricing` under **both** Node and Deno, the Edge Function under both, plus `apps/web` and `tools/pilot-model` lib tests. Green. |
| `apps/web` | Next.js 16 / React 19 / TS 6.0.3 / Tailwind v4. Builds and serves. Brand tokens in `src/app/globals.css` `@theme`. |
| Marketing pages | `/`, `/drivers`, `/about` — **real UI**, built from `brand/exports/2026-08-07-landing-pages-v1.md` |
| `/login`, `/signup` | **Working** — password, email link, or phone SMS code. Verified end to end against a real Supabase project (sign-up → email → `/account`). |
| `/account`, `/drive` | **Role-aware.** `/account` shows a rider card to everyone and a driver card (compliance status included) to anyone with a `drivers` row; `/drive` is a driver-facing placeholder, auth-gated the same way. No `role` column — verified against real RLS that a rider-only user reads zero `drivers` rows and a dual-role user reads only their own. |
| `/request` | Still a placeholder. Nothing links to it — rider flow not started. |
| UI primitives | `src/components/ui/` — `Button`, `Card`, `Input`, `Badge`, `Avatar`, `FareChip`. Domain: `MarketingNav`, `MarketingFooter`, `Wordmark`. |
| Marketing figures | `apps/web/src/lib/marketing/figures.ts` — every commission figure **derived** from the seeded tiers via `@rido/pricing` at build time. `mock-data.ts` keeps only illustrative copy |
| `tools/pilot-model` | **Runnable** (`npm run model`) — Vite + React + recharts workspace. Integer cents throughout, calls `@rido/pricing`; 15 tests on `../tools/pilot-model/src/model.ts` |
| Icons | `lucide-react`, per the design system's documented substitution |
| `packages/pricing` | **Implemented and tested.** Fare quoting (`quoteFare`) and the Prop 22 floor alongside the commission math. Bracketed commission, tier validation, flat-fee resolution. 95 tests passing identically under **both** Node and Deno. Exact integer arithmetic throughout — no floating-point value anywhere in the path. Reproduces all three figures the docs published by hand ($200.12 at $1,001; $488/$3,112/13.56% at $3,600). |
| Brand | `design-system.md`, `brand-guide.md`, two Design export bundles with handoff notes |
| Supabase | **Project live, schema applied to it.** Fourteen migrations (`drivers`, `subscriptions`, `rides`, `driver_monthly_stats`, `commission_tiers`, PostGIS + ride geography, plus the `rido_year_month`/`reserve_driver_month`/`bump_monthly_stats`/`apply_ride_commission`/`active_commission_tiers`/`driver_month_to_date` functions, plus `fare_rate_cards` and `active_fare_rate_card`), RLS on every table, six pgTAP files (41 tests) plus two standalone concurrency proofs — all green against a real Postgres. `commission_tiers` seeded. All five newest migrations are applied to the live project, and `database.types.ts` is regenerated against it. |
| `complete-ride` | **Built and tested.** `supabase/functions/complete-ride/` — pure `core.ts` (authorization + rating, 19 tests under **both** Node and Deno), `db.ts` (the only SDK importer), `index.ts` (HTTP, bounded compare-and-swap retry). ADR-0008. |
| Fare pricing | **Built.** `quoteFare` + a per-market `fare_rate_cards` table, seeded for San Diego and calibrated to sit ~15% under a modelled UberX fare. `npm run calibrate` prints the report; `npm run check:calibration` fails in CI if the discount drifts or a driver would earn less than on an incumbent. ADR-0009. |
| Prop 22 floor | `packages/pricing/src/earnings-floor.ts` — per-trip diagnostic plus the two-week aggregate the statute actually uses. Nothing enforces it yet; there is no payout run to enforce it in. |
| Ride spatial-temporal data | PostGIS enabled; `rides` carries generated `pickup_geog`/`dropoff_geog` (GiST-indexed), `started_at`, `distance_meters`, `duration_seconds`, and partial indexes on completed rides. Recorded for a future optimizer — nothing reads them yet, and none of it is backfillable. |

## What does not exist

Stripe (subscriptions or Connect) · Mapbox · rider booking flow
(which is also why `rides` has no `authenticated` write policy yet — nothing to write it against,
and nothing that creates a ride for `complete-ride` to finish) · driver app.

`complete-ride` is **deployed** to the live project (`supabase functions deploy complete-ride
--project-ref <ref> --use-api`) but not yet exercised end to end — nothing creates a `rides` row,
so there is no real request to test it with beyond a hand-inserted row. Deploying it surfaced a
real gap: `functions deploy` needs a `[functions.complete-ride]` entry in `supabase/config.toml`
to resolve `@rido/pricing`, which `deno check`/`deno test` don't need because CI passes `--config`
explicitly. Fixed and documented in `supabase/CLAUDE.md` and ADR-0005 so the next function doesn't
rediscover it.

## Build order

**Phase 0 — decide.** ✅ Stack locked. ✅ Commission bracketed per-ride (ADR-0002). ✅ Repo
canonical (ADR-0004). ✅ Monorepo-shaped, no monorepo tooling (ADR-0005). ✅ Edge Function import
path verified. **Open:** the commercial insurance quote — gates the economics, needs a broker.

**Phase 1 — foundation.** ✅ Next.js scaffolded with brand tokens. ✅ Marketing pages + login UI.
✅ Supabase project created. ✅ **Auth wired and verified live** — real Supabase clients,
`proxy.ts` session refresh, `/signup` (explicit account creation, email or phone), `/login`
(sign-in only: password, email link, or SMS code), `/auth/confirm`, `/auth/signout`, `/account`.
Confirmed working against the real project.
⬜ Finish dashboard config: the "Confirm signup"/"Magic Link" email templates still use
Supabase's default (a link with no code, and not routed through `/auth/confirm`) instead of the
`{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=...` pattern in `apps/web/CLAUDE.md`; custom
SMTP (the built-in sender only reaches the project's own team addresses); an SMS provider for
phone. Non-blocking — deferred, not forgotten.
✅ **Five tables as migrations** — `drivers`, `subscriptions`, `rides`, `driver_monthly_stats`,
`commission_tiers` (no `riders` table — `rides.rider_id` references `auth.users` directly).
Verified against a real local Postgres: every constraint, trigger, and RLS policy exercised and
passing (`supabase/tests/`, `pg_prove` green), including a standalone proof that the
month-to-date lock actually blocks a concurrent completion rather than racing.
✅ **Pushed to the live project** and **`database.types.ts` regenerated** against the real schema —
all five tables typed, so the Supabase clients' generics are load-bearing rather than decorative.
✅ `commission_tiers` seeded on the live project (three bands).
✅ **Rider/driver distinction** — no `role` column: a driver identity is a matching `drivers` row,
read via `getOwnDriverProfile()` (`apps/web/src/lib/drivers/`). A person can be both at once.
`/account` shows a rider card to everyone and a driver card (with live compliance status) to
anyone with a row; a new `(driver)/drive` placeholder is auth-gated the same way `/account` is.
Post-login redirect still always lands on `/account` — deliberately not split yet, since neither
`/request` nor `/drive` has real functionality to redirect into.

**Phase 2 — money spine.** ✅ **`packages/pricing` implemented and tested** — bracketed commission
with boundary tests at every tier edge (`$0`, `$999.99`, `$1,000.00`, `$1,000.01`, `$2,999.99`,
`$3,000.00`, `$3,000.01`), spanning rides, monotonicity, and exact `commission + payout === fare`.
The suite is split so a repricing breaks only `commission.seed.test.ts` — see
`business/changing-rates.md`.
✅ `bump_monthly_stats` trigger and `reserve_driver_month` locking (DB side, verified).
✅ **The `complete-ride` Edge Function** — reads the active tiers and the driver's month-to-date
position, rates with `@rido/pricing`, and hands the result to `apply_ride_commission`, which locks,
re-checks that position and writes. The "one held-open transaction" the design called for turned
out to be unbuildable from supabase-js, so the transaction moved into SQL and correctness comes
from compare-and-swap instead (**ADR-0008**). Proved by a two-connection race
(`supabase/tests/concurrent-apply-ride-commission.sh`): one `applied`, one `conflict` — and the
test fails if the check is removed.
✅ **Deployed** to the live project. ⬜ Exercise it against a real request — nothing creates a
ride yet, so this needs a hand-inserted row and a driver JWT.
✅ **Ride pricing** — `quoteFare`, the `fare_rate_cards` table, and a calibration check in CI
(ADR-0009, `business/fare-pricing.md`). Two findings recorded there rather than discovered later: a
RIDO driver beats an incumbent driver on every trip shape tested even at our worst commission band,
and there is a **low-volume dead zone** once the flat fee turns on — break-even runs from 20 to 94
trips/month across the 35–50% incumbent-take range, and vanishes entirely during the pilot.
⬜ Decide what to do about that dead zone. Needs market research, not code.
⬜ A `quote-ride` Edge Function. Blocked on Mapbox (nothing supplies distance/duration) and on the
booking flow (nothing asks for a quote).
✅ **The marketing percentage is derived**, not hand-maintained: `supabase/seed/commission_tiers.sql`
→ `scripts/generate-published-tiers.mjs` → `apps/web/src/lib/marketing/figures.ts` →
`commissionForRide`. Verified by repricing the seed and watching every page figure move, including
the CSS bar widths. CI fails if the generated file drifts from the seed. The two hardcoded tier
sentences in `(marketing)/drivers/page.tsx` and the "Drivers keep 87%" in `../brand/` are gone.
⬜ Stripe.
✅ **`gradComm()` is retired.** `tools/pilot-model` is a real workspace (`npm run model`) that
calls `@rido/pricing` instead of re-implementing bracketed commission in floating-point dollars.
The flat fee now turns on at a driver-count threshold — the traction signal ADR-0003 describes —
rather than at a month index. Its arithmetic moved to `../tools/pilot-model/src/model.ts` with 15 tests, and fixing a
display bug on the way: "Driver take-home" was showing RIDO's revenue per driver.

**Phase 3 — surfaces.** ✅ Marketing pages. ✅ The fare a rider is quoted is computable
(`quoteFare` + the seeded card) — what's missing is a surface to show it on and a routing engine to
supply distance and duration. ⬜ Rider request flow (map-first, bottom sheet, fare
up front). ⬜ Driver view (online/offline, incoming card with "you keep $X (Y%)", MTD tier
progress). ⬜ Mapbox.

**Phase 4 — compliance gates.** ✅ Driver activation gated on background check + vehicle
inspection, enforced in the database (a `CHECK` constraint plus RLS) **and now in the app** —
`complete-ride`'s `authorizeCompletion` refuses any driver who isn't `status = 'active'`, which
inherits the constraint's terms rather than restating them. ⬜ CPUC fee and airport surcharges as
first-class line items — no schema exists for either.

## Two definitions of "prototype"

- **Clickable demo (mock data):** needs the rider and driver screens only — buildable against
  `apps/web/src/lib/mock-data.ts` with no backend, same pattern the marketing pages used.
- **Actually works end-to-end:** needs Phases 1 and 2 complete. Phase 2 is the part not to rush —
  `packages/pricing` is the most important code in the repo, and a wrong number there lands
  permanently in the accounting record via the ride snapshot.

## Blocked on people, not code

| # | Question | Owner |
|---|---|---|
| 1 | Commercial TNC insurance quote — fixed monthly minimum or per-ride? | Broker |
| 2 | Prop 22 earnings floor × "drivers set fares" | CA attorney |
| 3 | Does RIDO absorb Stripe's ~2.9% + $0.30, or pass it to drivers? | Founder |

## Working conventions

- Two parallel tracks: backend (this repo's core) and frontend (marketing/app UI). Both merge to
  `main` via small PRs — keep branches short-lived; this file is the one both touch, so pull
  before pushing.
- Frontend work that needs a backend capability leaves `// TODO(backend):` at the call site **and**
  a bullet here. That's the handoff mechanism — `grep -rn "TODO(backend)" apps/web/` before
  starting Phase 2.
- Before Claude Design mocks a new surface, re-sync its repo connection. The 2026-08-07 bundle
  was generated from a pre-fix snapshot and carried a stale figure into the Rider page.
