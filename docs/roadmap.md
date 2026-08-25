# RIDO — Build Roadmap

*The one doc that describes **current repo state**. Everything else here describes intent; this
describes fact. **If it disagrees with the filesystem, the filesystem wins — fix this file in the
same commit that proves it wrong.***

**Last verified: 2026-08-24** (branch `claude/intelligent-fermat-2xkydc`)

## TL;DR

The **scaffolding, context system, marketing surface, auth, database schema, and commission math
are built.** The schema is live on the real Supabase project with generated types; the money math
is implemented and tested under both runtimes. What's missing is the **product**: no ride
completion flow yet joining the two, no payments, no maps, no rider or driver screens.

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
| Supabase | **Project live, schema applied to it.** Nine migrations (`drivers`, `subscriptions`, `rides`, `driver_monthly_stats`, `commission_tiers`, plus the `rido_year_month`/`reserve_driver_month`/`bump_monthly_stats` functions), RLS on every table, four pgTAP tests plus a standalone concurrency proof — all green against a real Postgres. `commission_tiers` seeded; `database.types.ts` generated from the live schema and committed. |

## What does not exist

`complete-ride` Edge Function — the two halves it joins are both built and tested
(`reserve_driver_month` + the rollup trigger in the database; `commissionForRide` in
`@rido/pricing`), but the function that orchestrates them inside one transaction is not ·
Stripe (subscriptions or Connect) · Mapbox · a
rider/driver role distinction · rider booking flow (which is also why `rides` has no
`authenticated` write policy yet — nothing to write it against) · driver app.

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
⬜ The `complete-ride` Edge Function itself — orchestrates `reserve_driver_month` →
`@rido/pricing` → the `rides` snapshot inside one transaction (must hold one connection open
across all three; see `ride-completion.md`). **Both halves it joins now exist**, which makes this
the next concrete piece of work.
⬜ Stripe. ⬜ Retire the hand-computed marketing percentage in
`business/monetization.md` in favour of one derived from `packages/pricing` — and re-point
`mock-data.ts`'s figures at it. Also the tier prose hardcoded in `(marketing)/drivers/page.tsx`,
and the "Drivers keep 87%" in `../brand/` which already contradicts the canonical ~86%.
⬜ Retire `gradComm()` in `tools/pilot-model` — a second commission implementation in
floating-point dollars, with the pilot derived from a month index (the date comparison ADR-0003
forbids). ADR-0005 says it should import `@rido/pricing`.

**Phase 3 — surfaces.** ✅ Marketing pages. ⬜ Rider request flow (map-first, bottom sheet, fare
up front). ⬜ Driver view (online/offline, incoming card with "you keep $X (Y%)", MTD tier
progress). ⬜ Mapbox.

**Phase 4 — compliance gates.** ✅ Driver activation gated on background check + vehicle
inspection, enforced in the database (a `CHECK` constraint plus RLS) — not yet in the app, since
there's no driver-facing surface that would trigger it yet. ⬜ CPUC fee and airport surcharges as
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
