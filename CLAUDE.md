# CLAUDE.md — RIDO

RIDO is a driver-favorable rideshare marketplace. First market: San Diego / UCSD. The wedge is
driver economics — RIDO's take is a fraction of Uber/Lyft's effective 35–50%. **The commission
logic is the most important code in this repo. Get it exactly right.**

## Ground truth

**Built and working:** the Next.js app on the real brand, four marketing routes, **auth** (a live
Supabase project, sign-up and sign-in by email or phone, session refresh, route guards), the
**database** (schema applied, RLS and constraints tested against a real Postgres), **all
commission math** in `packages/pricing`, and the **`complete-ride` Edge Function** that joins
them.

**Not built:** payments (Stripe), maps (Mapbox), the rider booking flow, the driver app, and any
rider/driver distinction — which is why every post-login redirect goes to `/account`.

`docs/roadmap.md` is the dated, verified version of this. If either disagrees with the
filesystem, **the filesystem wins** — fix it in the same commit that proves it wrong.

**Target stack:** Next.js (App Router) + TypeScript + Tailwind on Vercel · Supabase (Postgres +
RLS + Edge Functions, Deno) · Supabase Auth · Stripe (subscriptions for the flat fee, Connect for
payouts) · Mapbox.

## Where things live

| Path | What it holds | Read it when |
|---|---|---|
| `docs/README.md` | Canonical-source map: which file governs which fact | You're unsure what governs something |
| `docs/decisions/` | ADRs. A decision isn't real until it's one | Changing a rule, or asking "why is it this way" |
| `docs/business/` | Wedge, market sizing, monetization model | Pricing, positioning, marketing copy |
| `docs/architecture/` | Schema, ride-completion flow | Backend work |
| `docs/compliance/` | CPUC, insurance, Prop 22, driver vetting | Onboarding, fees, anything regulated |
| `docs/roadmap.md` | Gap analysis and build order | Deciding what to do next |
| `brand/` | Design system, voice, Claude Design exports | Any UI or copy work |
| `apps/web/` | The Next.js app | — has its own CLAUDE.md |
| `packages/pricing/` | All money math. Pure, dependency-free | — has its own CLAUDE.md |
| `supabase/` | Migrations, RLS, Edge Functions | — has its own CLAUDE.md |
| `tools/` | Non-shipping tools (the pilot economics model) | Financial modelling |

Those paths are backticked deliberately. Claude Code inlines a bare `@path` into **every** session
at launch — imports don't save context, they spend it. Keep references backticked so they stay
pointers you follow on demand.

## Non-negotiable invariants

These live at the root — not in a nested file — because they must hold *before* the first line of
a new file is written, and the root CLAUDE.md is the only project memory that survives compaction.

**Money**

1. **Integer cents everywhere.** Database columns, application code, API payloads. Never a float.
   Never a variable holding dollars. Rates are basis points (`2000` = 20%).
2. **Snapshot commission onto the `rides` row at completion** — `commission_rate_bps`,
   `commission_cents`, `driver_payout_cents`. **Never recompute a historical ride from current
   tiers.** Recalculation destroys reconcilability and makes revenue unpredictable.
3. **Commission is bracketed (marginal), read from the `commission_tiers` table** — never
   hardcoded. Defaults: 20% / 12% / 8% across monthly per-driver fare bands $0–1,000 /
   $1,000–3,000 / >$3,000. Each band's rate applies only to fares inside it. (ADR-0002)
4. **Flat fee is $50/mo steady state, $0 during the launch pilot.** Commission still runs during
   the pilot. The turn-on is a per-driver state gated on a traction signal — **never a date
   in code.** (ADR-0003)
5. **All money math lives in `packages/pricing/` and nowhere else.** Components, route handlers,
   Edge Functions, SQL and the economics model *call* it. They never re-implement it.

**Compliance**

6. A driver may not accept rides unless `background_check_status = 'passed'` **and**
   `vehicle_inspection_status = 'passed'` **and** `status = 'active'`. Enforce in the **database**
   (check constraint + RLS) *and* the app. UI-only enforcement is a bug, not a shortcut.

**Boundaries**

7. **A vendor SDK is called from `apps/web/src/lib/<domain>/`, never from a component or route.**
   Supabase, Stripe, Mapbox alike. Components call our functions and receive our types — a
   component that cannot receive a vendor error cannot render one. A rule that must always hold
   is set *inside* the module, so callers can't forget it: that's why sign-in can't create an
   account. `src/lib/auth/` is the reference implementation. (ADR-0006)
8. **Some things don't ship untested.** All of `packages/pricing`, under both Node and Deno; pure
   logic in `apps/web/src/lib/`; anything enforcing a money or compliance invariant; and, once
   migrations exist, the RLS policies and the driver-activation constraint. A bug fix ships with
   the test that would have caught it. Component and end-to-end tests are deliberately deferred
   until the surfaces stop moving. (ADR-0007)

**Time and secrets**

9. Store `timestamptz` in UTC. Bucket months as `year_month` (`'2026-06'`) computed in
   `America/Los_Angeles`. Fixed once, documented, never re-derived per call site.
10. Supabase service-role keys and Stripe secrets are server-only. `NEXT_PUBLIC_*` is a promise
    that the value is safe to ship to a browser. Secrets live in `.env.local`, which is
    gitignored — **never** create or edit that file through GitHub's web UI, which doesn't
    honour `.gitignore`. A key that reaches a remote is rotated, not deleted.

## Guardrails — do not

- Hardcode a rate, a tier boundary, or the flat fee anywhere outside the `commission_tiers` seed.
- Re-implement commission math in SQL, an Edge Function, a component, or the economics model.
- Store currency as a float, or let a driver go active without passing the compliance gate.
- Reintroduce the flat fee inside the pilot window.
- Import a vendor SDK into a component, a page, or a route handler. Wrap it in `src/lib/` first.
- Ship a change to money math, a compliance rule, or pure `lib/` logic without its test.
- Read `brand/exports/*.dc.html` into context — they're bundled artifacts, ~95% base64 fonts.
  Read the sibling `.md` handoff note instead.
- Introduce a colour, font, or radius that isn't in `brand/design-system.md`.
- Make the app look like Uber. Borrow the polish, not the design — the brand is anti-incumbent.

## Conventions

- TypeScript `strict: true`. No `any` in pricing, schema, or Stripe code.
- Server Components by default; `"use client"` needs a reason.
- Supabase types are generated into `apps/web/src/types/database.types.ts` and committed. Import
  them; never redeclare a table type by hand.
- Tests colocate with source: `commission.ts` → `commission.test.ts`.
- **Biome is the only lint/format toolchain.** `npm run lint` before pushing; `npm run lint:fix`
  applies what's mechanical. It runs in CI, so a formatting diff is a failed build, not a
  reviewer's problem.
- Conventional commits. One concern per PR.
- Every CLAUDE.md stays under 200 lines; every doc under ~200. Split rather than grow.

## When you change a rule

Write or supersede the ADR, update the doc, then change the code — in one PR, in that order.
Run `node scripts/check-context.mjs` before pushing; it fails on broken references, oversized
context files, and pricing constants leaking outside their one home.
