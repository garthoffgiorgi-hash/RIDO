# RIDO — Build Roadmap

*The one doc that describes **current repo state**. Everything else here describes intent; this
describes fact. **If it disagrees with the filesystem, the filesystem wins — fix this file in the
same commit that proves it wrong.***

**Last verified: 2026-08-25** (branch `claude/intelligent-fermat-2xkydc`)

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
| CI | `.github/workflows/ci.yml` — drift check + `packages/pricing` under **both** Node and Deno. Green. |
| `apps/web` | Next.js 16 / React 19 / TS 6.0.3 / Tailwind v4. Builds and serves. Brand tokens in `src/app/globals.css` `@theme`. |
| Marketing pages | `/`, `/drivers`, `/about` — **real UI**, built from `brand/exports/2026-08-07-landing-pages-v1.md` |
| `/login`, `/signup` | **Working** — password, email link, or phone SMS code. Verified end to end against a real Supabase project (sign-up → email → `/account`). |
| `/request` | Still a placeholder. Nothing links to it — rider flow not started. |
| UI primitives | `src/components/ui/` — `Button`, `Card`, `Input`, `Badge`, `Avatar`, `FareChip`. Domain: `MarketingNav`, `MarketingFooter`, `Wordmark`. |
| Mock data | `apps/web/src/lib/mock-data.ts` — every example figure lives here, not inline in components |
| Icons | `lucide-react`, per the design system's documented substitution |
| `packages/pricing` | **Implemented and tested.** Bracketed commission, tier validation, flat-fee resolution. 55 tests passing identically under **both** Node and Deno. Exact integer arithmetic throughout — no floating-point value anywhere in the path. Reproduces all three figures the docs published by hand ($200.12 at $1,001; $488/$3,112/13.56% at $3,600). |
| Brand | `design-system.md`, `brand-guide.md`, two Design export bundles with handoff notes |
| Supabase | **Project live, schema applied to it.** Twelve migrations (`drivers`, `subscriptions`, `rides`, `driver_monthly_stats`, `commission_tiers`, PostGIS + ride geography, plus the `rido_year_month`/`reserve_driver_month`/`bump_monthly_stats`/`apply_ride_commission`/`active_commission_tiers`/`driver_month_to_date` functions), RLS on every table, five pgTAP tests plus two standalone concurrency proofs — all green against a real Postgres. `commission_tiers` seeded. **The three newest migrations are not yet applied to the live project**, so `database.types.ts` is a regeneration behind. |
| `complete-ride` | **Built and tested.** `supabase/functions/complete-ride/` — pure `core.ts` (authorization + rating, 19 tests under **both** Node and Deno), `db.ts` (the only SDK importer), `index.ts` (HTTP, bounded compare-and-swap retry). ADR-0008. |
| Ride spatial-temporal data | PostGIS enabled; `rides` carries generated `pickup_geog`/`dropoff_geog` (GiST-indexed), `started_at`, `distance_meters`, `duration_seconds`, and partial indexes on completed rides. Recorded for a future optimizer — nothing reads them yet, and none of it is backfillable. |

## What does not exist

Stripe (subscriptions or Connect) · Mapbox · a rider/driver role distinction · rider booking flow
(which is also why `rides` has no `authenticated` write policy yet — nothing to write it against,
and nothing that creates a ride for `complete-ride` to finish) · driver app.

`complete-ride` has not been **deployed** to the live project or exercised against it — it is
verified locally (both runtimes, and its SQL against a real Postgres) but
`supabase functions deploy complete-ride --use-api` hasn't been run. `database.types.ts` also
needs regenerating (`npm run types:generate`) once the four newest migrations are applied there.

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
⬜ Add a `role` (or equivalent) so a `drivers` row is linked to an account with a rider/driver
distinction — nothing marks that yet, which is why every post-login redirect currently goes to
`/account` instead of splitting.

**Phase 2 — money spine.** ✅ **`packages/pricing` implemented and tested** — bracketed commission
with boundary tests at every tier edge (`$0`, `$999.99`, `$1,000.00`, `$1,000.01`, `$2,999.99`,
`$3,000.00`, `$3,000.01`), spanning rides, monotonicity, and exact `commission + payout === fare`.
55 tests, passing identically under Node and Deno. The suite is split so a repricing breaks only
`commission.seed.test.ts` — see `business/changing-rates.md`.
✅ `bump_monthly_stats` trigger and `reserve_driver_month` locking (DB side, verified).
✅ **The `complete-ride` Edge Function** — reads the active tiers and the driver's month-to-date
position, rates with `@rido/pricing`, and hands the result to `apply_ride_commission`, which locks,
re-checks that position and writes. The "one held-open transaction" the design called for turned
out to be unbuildable from supabase-js, so the transaction moved into SQL and correctness comes
from compare-and-swap instead (**ADR-0008**). Proved by a two-connection race
(`supabase/tests/concurrent-apply-ride-commission.sh`): one `applied`, one `conflict` — and the
test fails if the check is removed.
⬜ Deploy it (`supabase functions deploy complete-ride --use-api`) and exercise it against the
live project. Nothing creates a ride yet, so this needs a hand-inserted row.
✅ **The marketing percentage is derived**, not hand-maintained: `supabase/seed/commission_tiers.sql`
→ `scripts/generate-published-tiers.mjs` → `apps/web/src/lib/marketing/figures.ts` →
`commissionForRide`. Verified by repricing the seed and watching every page figure move, including
the CSS bar widths. CI fails if the generated file drifts from the seed. The two hardcoded tier
sentences in `(marketing)/drivers/page.tsx` and the "Drivers keep 87%" in `../brand/` are gone.
⬜ Stripe.
⬜ Retire `gradComm()` in `tools/pilot-model` — a second commission implementation in
floating-point dollars, with the pilot derived from a month index (the date comparison ADR-0003
forbids). ADR-0005 says it should import `@rido/pricing`.

**Phase 3 — surfaces.** ✅ Marketing pages. ⬜ Rider request flow (map-first, bottom sheet, fare
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
