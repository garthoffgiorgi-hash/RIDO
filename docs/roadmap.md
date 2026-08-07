# RIDO — Build Roadmap

*The one doc that describes **current repo state**. Everything else here describes intent; this
describes fact. **If it disagrees with the filesystem, the filesystem wins — fix this file in the
same commit that proves it wrong.***

**Last verified: 2026-08-07** (against `main` @ `7c98c0d`)

## TL;DR

The **scaffolding and context system are built and enforced**. The **product is not.** There is a
working Next.js app with the brand wired in and five placeholder routes; there is no backend of
any kind — no database, no auth, no payments, no maps, and no implemented pricing math.

## What exists (verified, not assumed)

| Area | State |
|---|---|
| Repo structure | Scoped `CLAUDE.md` per domain, ADRs, canonical-source map (`docs/README.md`) |
| Drift guard | `scripts/check-context.mjs` — reference resolution, size budgets, ADR citations, pricing-literal leakage |
| CI | `.github/workflows/ci.yml` — drift check + `packages/pricing` under **both** Node and Deno. Green. |
| `apps/web` | Next.js 16 / React 19 / TS 6.0.3 / Tailwind v4. Builds and serves. Brand tokens in `src/app/globals.css` `@theme`. |
| Routes | `/`, `/drivers`, `/about`, `/login`, `/request` — **placeholders**, not real UI |
| `packages/pricing` | Typed stubs and a verified cross-runtime import path. **Every function throws `not implemented`. Zero tests.** |
| Brand | `design-system.md`, `brand-guide.md`, two Design export bundles with handoff notes |
| Supabase | **Directories and one seed file only.** No project, no migrations, no RLS, no functions. |

## What does not exist

Supabase project · migrations · RLS policies · `complete-ride` Edge Function ·
`bump_monthly_stats` trigger · any implemented commission math · any test in `packages/pricing` ·
Stripe (subscriptions or Connect) · Mapbox · auth wiring (`src/lib/supabase/*.ts` are stubs) ·
rider booking flow · driver app · compliance enforcement.

## Build order

**Phase 0 — decide.** ✅ Stack locked. ✅ Commission bracketed per-ride (ADR-0002). ✅ Repo
canonical (ADR-0004). ✅ Monorepo-shaped, no monorepo tooling (ADR-0005). ✅ Edge Function import
path verified. **Open:** the commercial insurance quote — gates the economics, needs a broker.

**Phase 1 — foundation.** ✅ Next.js scaffolded with brand tokens. ⬜ Marketing pages + login
(*in progress*). ⬜ **Create the Supabase project — requires founder credentials; this is the
single gate between a demo and a working prototype.** ⬜ Five tables as migrations. ⬜ Seed
`commission_tiers` (SQL already written). ⬜ Auth wiring. ⬜ Generate `database.types.ts`.

**Phase 2 — money spine.** ⬜ Implement `packages/pricing` with boundary tests at every tier edge
(`$0`, `$999.99`, `$1,000.00`, `$1,000.01`, `$2,999.99`, `$3,000.00`, `$3,000.01`), spanning
rides, monotonicity, and exact `commission + payout === fare`. ⬜ `complete-ride` Edge Function +
`bump_monthly_stats` trigger. ⬜ Stripe. ⬜ Retire the hand-computed marketing percentage in
`business/monetization.md` in favour of one derived from `packages/pricing`.

**Phase 3 — surfaces.** ⬜ Rider request flow (map-first, bottom sheet, fare up front). ⬜ Driver
view (online/offline, incoming card with "you keep $X (Y%)", MTD tier progress). ⬜ Mapbox.

**Phase 4 — compliance gates.** ⬜ Driver activation gated on background check + vehicle
inspection, enforced in the database (constraint + RLS), not just the app. ⬜ CPUC fee and
airport surcharges as first-class line items.

## Two definitions of "prototype"

- **Clickable demo (mock data):** needs Phase 1's UI work only. Rider and driver screens can be
  built against a single mock-data module in `apps/web/src/lib/` without any backend.
- **Actually works end-to-end:** needs Phases 1 and 2 complete. Phase 2 is the part not to rush —
  `packages/pricing` is the most important code in the repo, and a wrong number there lands
  permanently in the accounting record via the ride snapshot.

## Blocked on people, not code

| # | Question | Owner |
|---|---|---|
| 1 | Commercial TNC insurance quote — fixed monthly minimum or per-ride? | Broker |
| 2 | Prop 22 earnings floor × "drivers set fares" | CA attorney |
| 3 | Does RIDO absorb Stripe's ~2.9% + $0.30, or pass it to drivers? | Founder |
| 4 | Supabase project creation | Founder |

## Working conventions

- Two parallel tracks: backend (this repo's core) and frontend (marketing/app UI). Both merge to
  `main` via small PRs — keep branches short-lived; `docs/roadmap.md` is the file both touch.
- Frontend work that needs a backend capability leaves `// TODO(backend):` at the call site **and**
  a bullet here. That's the handoff mechanism — `grep -rn "TODO(backend)" apps/web/` before
  starting Phase 2.
- Before Claude Design mocks a new surface, re-sync its repo connection. The 2026-08-07 bundle
  was generated from a pre-fix snapshot and carried a stale figure into the Rider page.
