# RIDO — Build Roadmap

*The one doc that describes **current repo state**. Everything else here describes intent; this
describes fact. **If it disagrees with the filesystem, the filesystem wins — fix this file in the
same commit that proves it wrong.***

**Last verified: 2026-08-29** (branch `claude/intelligent-fermat-2xkydc`)

## TL;DR

The **money spine is complete end to end.** Scaffolding, context system, marketing surface, auth,
database schema, commission math, and the `complete-ride` Edge Function that joins them are all
built and tested — a ride can be rated and snapshotted correctly, including under concurrent
completions. Maps — measuring, searching, and now rendering — are also built and proven end to
end at `/dev/maps`, and a rider can now book a real ride at `/request`. What's missing is the
rest of the **product around it**: no payments, no driver screen, and nothing that ever accepts
a requested ride.

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
| `/request` | **Built, rider side.** Map-first, a bottom sheet with a real `quoteRideRequest()`/`requestRide()`/`cancelRide()` write path — `src/lib/rides/`, auth-gated, unlinked from anywhere so no real rider reaches the dead end past 'requested'. Nothing accepts a ride yet — no dispatch, no driver-side accept. ADR-0012, `architecture/ride-booking.md`. |
| Maps | **Built end to end.** `apps/web/src/lib/maps/` — `measureRoute()` (server-only, secret token) turns two coordinates into the integer distance and duration `quoteFare()` needs; `searchPlaces()`/`describePlaceAt()` (browser, public token) turn typed text into coordinates; `map.ts` renders a map (`mapbox-gl`, the only file importing it, dynamically loaded) via an opaque `RideMapHandle` — no vendor type crosses into `RideMap.tsx`. `/dev/maps` (auth-gated, 404s outside development) proves search → measure → quote → render against a real Mapbox account. `geocode.ts` (Geocoding v6, always `permanent=true`) is the storable-coordinate path, **built and switched off** — ADR-0011 defers permanent geocoding for the pilot. Pure request-building, response-parsing, and map geometry are tested (77 tests). ADR-0010, ADR-0011, `architecture/maps.md`. |
| UI primitives | `src/components/ui/` — `Button`, `Card`, `Input`, `Badge`, `Avatar`, `FareChip`. Domain: `MarketingNav`, `MarketingFooter`, `Wordmark`. |
| Marketing figures | `apps/web/src/lib/marketing/figures.ts` — every commission figure **derived** from the seeded tiers via `@rido/pricing` at build time. `mock-data.ts` keeps only illustrative copy |
| `tools/pilot-model` | **Runnable** (`npm run model`) — Vite + React + recharts workspace. Integer cents throughout, calls `@rido/pricing`; 24 tests on `../tools/pilot-model/src/model.ts`. Full monthly P&L now — driver *and* rider acquisition cost, Mapbox and card-processing as sliders (not constants), an adjustable horizon, one-click CSV export |
| Icons | `lucide-react`, per the design system's documented substitution |
| `packages/pricing` | **Implemented and tested.** Fare quoting (`quoteFare`) and the Prop 22 floor alongside the commission math. Bracketed commission, tier validation, flat-fee resolution. 95 tests passing identically under **both** Node and Deno. Exact integer arithmetic throughout — no floating-point value anywhere in the path. Reproduces all three figures the docs published by hand ($200.12 at $1,001; $488/$3,112/13.56% at $3,600). |
| Brand | `design-system.md`, `brand-guide.md`, two Design export bundles with handoff notes |
| Supabase | **Project live, schema applied to it.** Sixteen migrations (`drivers`, `subscriptions`, `rides`, `driver_monthly_stats`, `commission_tiers`, PostGIS + ride geography, plus the `rido_year_month`/`reserve_driver_month`/`bump_monthly_stats`/`apply_ride_commission`/`active_commission_tiers`/`driver_month_to_date` functions, plus `fare_rate_cards`, `active_fare_rate_card`, the `rides` address columns, and `driver_id` nullable + `rides_one_active_per_rider` + `canceled_at`), RLS on every table, eight pgTAP files (57 tests) plus two standalone concurrency proofs — all green against a real Postgres. `commission_tiers` seeded. **The newest two migrations are verified locally but not yet applied to the live project** — `database.types.ts` does not yet carry `pickup_address`/`dropoff_address`, nullable `driver_id`, or `canceled_at`; `apps/web/src/lib/rides/server.ts` bridges that gap with two documented local type overrides until it's pushed and regenerated. |
| `complete-ride` | **Built and tested.** `supabase/functions/complete-ride/` — pure `core.ts` (authorization + rating, 19 tests under **both** Node and Deno), `db.ts` (the only SDK importer), `index.ts` (HTTP, bounded compare-and-swap retry). ADR-0008. |
| Fare pricing | **Built.** `quoteFare` + a per-market `fare_rate_cards` table, seeded for San Diego and calibrated to sit ~15% under a modelled UberX fare. `npm run calibrate` prints the report; `npm run check:calibration` fails in CI if the discount drifts or a driver would earn less than on an incumbent. ADR-0009. |
| Prop 22 floor | `packages/pricing/src/earnings-floor.ts` — per-trip diagnostic plus the two-week aggregate the statute actually uses. Nothing enforces it yet; there is no payout run to enforce it in. |
| Ride spatial-temporal data | PostGIS enabled; `rides` carries generated `pickup_geog`/`dropoff_geog` (GiST-indexed), four lifecycle timestamps, `distance_meters`, `duration_seconds`, `pickup_address`/`dropoff_address`, and partial indexes on completed rides. **ADR-0011 decides what each holds:** the timestamps are RIDO's own clock and carry no vendor restriction (the temporal half of a demand heatmap, free from the first ride); the addresses are stored and the coordinates deferred to a backfill; `distance_meters`/`duration_seconds` are the *actual* trip, never the routed estimate. Nothing writes any of it yet. |

## What does not exist

Stripe (subscriptions or Connect) · driver-side accept and dispatch (so a requested ride still
has nowhere to go, and `complete-ride` still has no real ride created through the app to
finish) · driver app.

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
Post-login redirect still always lands on `/account` — deliberately not split yet. `/request`
has real functionality now, but landing a rider straight into a live map on every sign-in isn't
obviously right either; `/drive` still has nothing to redirect into. Revisit once both sides
have opinions worth having.

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
✅ **Deployed** to the live project. ⬜ Exercise it against a real request — `/request` now
creates real `rides` rows, but nothing ever moves one past `'requested'`, so `complete-ride`
still needs a hand-inserted `'accepted'` row and a driver JWT until driver-side accept exists.
✅ **Ride pricing** — `quoteFare`, the `fare_rate_cards` table, and a calibration check in CI
(ADR-0009, `business/fare-pricing.md`). Two findings recorded there rather than discovered later: a
RIDO driver beats an incumbent driver on every trip shape tested even at our worst commission band,
and there is a **low-volume dead zone** once the flat fee turns on — break-even runs from 20 to 94
trips/month across the 35–50% incumbent-take range, and vanishes entirely during the pilot.
⬜ Decide what to do about that dead zone. Needs market research, not code.
⬜ A `quote-ride` Edge Function. **No longer blocked on Mapbox** — `measureRoute()` supplies
distance and duration, and `apps/web/src/lib/maps/route.ts` is Next-free with `.ts`-extensioned
imports so Deno can import it directly. Blocked only on the booking flow now: nothing asks for a
quote.
✅ **The marketing percentage is derived**, not hand-maintained: `supabase/seed/commission_tiers.sql`
→ `scripts/generate-published-tiers.mjs` → `apps/web/src/lib/marketing/figures.ts` →
`commissionForRide`. Verified by repricing the seed and watching every page figure move, including
the CSS bar widths. CI fails if the generated file drifts from the seed. The two hardcoded tier
sentences in `(marketing)/drivers/page.tsx` and the "Drivers keep 87%" in `../brand/` are gone.
⬜ Stripe.
✅ **`gradComm()` is retired.** `tools/pilot-model` is a real workspace (`npm run model`) that
calls `@rido/pricing` instead of re-implementing bracketed commission in floating-point dollars.
The flat fee now turns on at a driver-count threshold — the traction signal ADR-0003 describes —
rather than at a month index. Its arithmetic moved to `../tools/pilot-model/src/model.ts` with 24 tests, and fixing a
display bug on the way: "Driver take-home" was showing RIDO's revenue per driver.

**Phase 3 — surfaces.** ✅ Marketing pages. ✅ The fare a rider is quoted is computable
(`quoteFare` + the seeded card), measurable (`measureRoute` + Mapbox Directions), and renderable
and provable end to end at `/dev/maps`. ✅ **Mapbox** — the vendor boundary, the rendering
(`map.ts`, `RideMap.tsx`), and a proving page are all built and tested against a real account.
✅ **Rider request flow** — `/request` books a real `rides` row through `src/lib/rides/`
(ADR-0012): naming, a server-side quote, price-changed re-confirmation, and a cancelable
'requested' state, behind a new `Sheet` primitive nothing in this repo had built. ⬜ Driver
accept and dispatch — `matched` onward in the blueprint needs it, and it has its own
concurrency problem (two drivers accepting one ride) that hasn't been designed. ⬜ Driver view
(online/offline, incoming card with "you keep $X (Y%)", MTD tier progress).

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
