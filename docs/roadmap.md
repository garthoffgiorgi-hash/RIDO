# RIDO — Build Roadmap

*The one doc that describes **current repo state**. Everything else here describes intent; this
describes fact. **If it disagrees with the filesystem, the filesystem wins — fix this file in the
same commit that proves it wrong.***

**Last verified: 2026-08-18** (branch `claude/intelligent-fermat-2xkydc`, PR #10)

## TL;DR

The **scaffolding, context system, marketing surface, and auth are built and connected to a real
Supabase project.** The **product is not.** There is still no database schema, no payments, no
maps, and no implemented pricing math.

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
| `packages/pricing` | Typed stubs and a verified cross-runtime import path. **Every function throws `not implemented`. Zero tests.** |
| Brand | `design-system.md`, `brand-guide.md`, two Design export bundles with handoff notes |
| Supabase | **Project created and live**, auth confirmed working end to end. No migrations, no RLS, no functions — the five tables and `commission_tiers` seed still only exist as SQL, not as an applied schema. |

## What does not exist

Migrations applied to the live project · RLS policies · `complete-ride` Edge Function ·
`bump_monthly_stats` trigger · any implemented commission math · any test in `packages/pricing` ·
Stripe (subscriptions or Connect) · Mapbox · `database.types.ts` (still an empty placeholder) ·
a rider/driver role distinction · rider booking flow · driver app · compliance enforcement.

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
⬜ **Five tables as migrations** (`drivers`, `riders`, `rides`, `commission_tiers`,
`monthly_driver_stats` per `docs/architecture/`). ⬜ Seed `commission_tiers` (SQL already
written). ⬜ Generate `database.types.ts` (currently an empty `interface Database {}`, so the
Supabase clients' generics are decorative until it's real). ⬜ Add a `role` (or equivalent) so a
`drivers`/`riders` row exists per account — nothing distinguishes them yet, which is why every
post-login redirect currently goes to `/account` instead of splitting.

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

## Working conventions

- Two parallel tracks: backend (this repo's core) and frontend (marketing/app UI). Both merge to
  `main` via small PRs — keep branches short-lived; this file is the one both touch, so pull
  before pushing.
- Frontend work that needs a backend capability leaves `// TODO(backend):` at the call site **and**
  a bullet here. That's the handoff mechanism — `grep -rn "TODO(backend)" apps/web/` before
  starting Phase 2.
- Before Claude Design mocks a new surface, re-sync its repo connection. The 2026-08-07 bundle
  was generated from a pre-fix snapshot and carried a stale figure into the Rider page.
