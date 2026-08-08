# RIDO — Build Roadmap

*The one doc that describes **current repo state**. Everything else here describes intent; this
describes fact. **If it disagrees with the filesystem, the filesystem wins — fix this file in the
same commit that proves it wrong.***

**Last verified: 2026-08-07** (against `main` @ `ae399d5`)

## TL;DR

The **scaffolding, context system, and marketing surface are built.** The **product is not.**
Four routes are real UI on the real brand; there is no backend of any kind — no database, no
working auth, no payments, no maps, and no implemented pricing math.

## What exists (verified, not assumed)

| Area | State |
|---|---|
| Repo structure | Scoped `CLAUDE.md` per domain, ADRs, canonical-source map (`docs/README.md`) |
| Drift guard | `scripts/check-context.mjs` — reference resolution, size budgets, ADR citations, pricing-literal leakage |
| CI | `.github/workflows/ci.yml` — drift check + `packages/pricing` under **both** Node and Deno. Green. |
| `apps/web` | Next.js 16 / React 19 / TS 6.0.3 / Tailwind v4. Builds and serves. Brand tokens in `src/app/globals.css` `@theme`. |
| Marketing pages | `/`, `/drivers`, `/about` — **real UI**, built from `brand/exports/2026-08-07-landing-pages-v1.md` |
| `/login` | **Real UI** — password + magic-link modes, loading/error/disabled states. **No working submission** (see Phase 1). |
| `/request` | Still a placeholder. Rider flow not started. |
| UI primitives | `src/components/ui/` — `Button`, `Card`, `Input`, `Badge`, `Avatar`, `FareChip`. Domain: `MarketingNav`, `MarketingFooter`, `Wordmark`. |
| Mock data | `apps/web/src/lib/mock-data.ts` — every example figure lives here, not inline in components |
| Icons | `lucide-react`, per the design system's documented substitution |
| `packages/pricing` | Typed stubs and a verified cross-runtime import path. **Every function throws `not implemented`. Zero tests.** |
| Brand | `design-system.md`, `brand-guide.md`, two Design export bundles with handoff notes |
| Supabase | **Directories and one seed file only.** No project, no migrations, no RLS, no functions. |

## What does not exist

Supabase project · migrations · RLS policies · `complete-ride` Edge Function ·
`bump_monthly_stats` trigger · any implemented commission math · any test in `packages/pricing` ·
Stripe (subscriptions or Connect) · Mapbox · working auth (`src/lib/supabase/*.ts` still throw) ·
rider booking flow · driver app · compliance enforcement.

## Build order

**Phase 0 — decide.** ✅ Stack locked. ✅ Commission bracketed per-ride (ADR-0002). ✅ Repo
canonical (ADR-0004). ✅ Monorepo-shaped, no monorepo tooling (ADR-0005). ✅ Edge Function import
path verified. **Open:** the commercial insurance quote — gates the economics, needs a broker.

**Phase 1 — foundation.** ✅ Next.js scaffolded with brand tokens. ✅ Marketing pages + login UI.
✅ Supabase project created. ✅ **Auth wired** — real Supabase clients, `proxy.ts` session
refresh, `/signup` (explicit account creation + email verification), `/login` (sign-in only),
`/auth/confirm`, `/auth/signout`, `/account`. ⬜ Five tables as migrations. ⬜ Seed
`commission_tiers` (SQL already written). ⬜ Generate `database.types.ts` (currently an empty
`interface Database {}`, so the Supabase clients' generics are decorative until it's real).
⬜ Link `auth.users` to a `drivers`/riders row — nothing distinguishes a rider from a driver
yet, which is why every post-login redirect currently goes to `/account`.

**Phase 2 — money spine.** ⬜ Implement `packages/pricing` with boundary tests at every tier edge
(`$0`, `$999.99`, `$1,000.00`, `$1,000.01`, `$2,999.99`, `$3,000.00`, `$3,000.01`), spanning
rides, monotonicity, and exact `commission + payout === fare`. ⬜ `complete-ride` Edge Function +
`bump_monthly_stats` trigger. ⬜ Stripe. ⬜ Retire the hand-computed marketing percentage in
`business/monetization.md` in favour of one derived from `packages/pricing` — and re-point
`mock-data.ts`'s figures at it.

**Phase 3 — surfaces.** ✅ Marketing pages. ⬜ Rider request flow (map-first, bottom sheet, fare
up front). ⬜ Driver view (online/offline, incoming card with "you keep $X (Y%)", MTD tier
progress). ⬜ Mapbox.

**Phase 4 — compliance gates.** ⬜ Driver activation gated on background check + vehicle
inspection, enforced in the database (constraint + RLS), not just the app. ⬜ CPUC fee and
airport surcharges as first-class line items.

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
| 4 | Supabase project creation | Founder |

## Working conventions

- Two parallel tracks: backend (this repo's core) and frontend (marketing/app UI). Both merge to
  `main` via small PRs — keep branches short-lived; this file is the one both touch, so pull
  before pushing.
- Frontend work that needs a backend capability leaves `// TODO(backend):` at the call site **and**
  a bullet here. That's the handoff mechanism — `grep -rn "TODO(backend)" apps/web/` before
  starting Phase 2.
- Before Claude Design mocks a new surface, re-sync its repo connection. The 2026-08-07 bundle
  was generated from a pre-fix snapshot and carried a stale figure into the Rider page.
