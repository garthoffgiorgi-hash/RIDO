# CLAUDE.md — RIDO

> The operating manual for writing RIDO's code. Claude Code reads this every run.
> The "why" behind every decision lives in `@docs/` — this file is the "how."
> Anything marked **[CONFIRM]** is my proposal; reconcile with the actual repo and edit.

---

## What RIDO is

A driver-favorable rideshare marketplace. Riders request rides, drivers fulfill them, RIDO runs the platform and takes a cut. The entire wedge is **driver economics**: RIDO takes far less than Uber/Lyft (whose effective take runs ~35–50%), so drivers keep more and riders pay a fairer price. Pre-launch, capital-constrained. **First market: San Diego / UCSD.**

The mission matters and it constrains the code: "fair to drivers" is a promise, so the commission logic is the most important thing in this repo. Get it exactly right.

Read `@docs/business-overview.md` and `@docs/monetization-model.md` before touching pricing or payout code.

---

## Current state — the repo today (read this before assuming anything exists)

The uploaded repo is a **plain static marketing site**, not the application described below. What actually exists:
- `index.html`, `about.html` — two static marketing pages.
- `styles.css` — plain CSS using the **old** brand: indigo `#2A2EA0` + cornflower `#4169E1`, Poppins + Inter, and a **car-with-wheels logo** (the exact rideshare cliché the new design system rejects).
- `script.js` — vanilla JS (mobile menu, language dropdown).
- `vercel.json`, a Node CI workflow, and a stub `package.json` with **no real dependencies**.

**No framework, no backend, no database, no app (no rider/driver flows), no payments or maps exist yet.** Everything in "Target stack" and "Core domain model" below is the destination, not current reality — do not assume Supabase, Next.js, or the schema exist. The brand in the repo predates `@brand/` and should be **replaced, not matched**. Full gap + build order: `@docs/reconciliation.md`.

## Target stack [what we're building toward]

- **Frontend:** Next.js (App Router) + TypeScript, on Vercel. Replacing the current static marketing site — not extending it.
- **Styling:** Tailwind CSS. Brand tokens are defined in the design system — see `@brand/design-system.md`. Do not invent colors or fonts; use the tokens.
- **Backend:** Supabase — PostgreSQL + Row-Level Security + Edge Functions (Deno/TypeScript).
- **Auth:** Supabase Auth.
- **Maps:** Mapbox.
- **Payments:** Stripe (subscriptions for the flat fee; Connect for driver payouts).

---

## Proposed repo structure [CONFIRM]

```
src/
  app/                 # Next.js App Router (routes)
    (rider)/           # rider-facing flow
    (driver)/          # driver-facing flow
    (marketing)/       # landing + public pages
  components/          # shared UI (Button, Card, FareChip, …) — built on design tokens
  lib/
    supabase/          # client + server Supabase helpers
    stripe/            # Stripe helpers
    pricing/           # commission + payout logic (pure functions, unit-tested)
    maps/              # Mapbox helpers
  types/               # shared TS types (incl. generated Supabase types)
supabase/
  migrations/          # SQL migrations (source of truth for schema)
  functions/           # Edge Functions (completeRide, …)
```

Keep all money/commission math in `lib/pricing/` as **pure, unit-tested functions**. Never scatter pricing logic across components or route handlers.

---

## Core domain model — the heart of the app

> **Target — none of this exists in the repo yet.** This is the design to build.

Full schema in `@docs/technical-architecture.md`. The invariants below are non-negotiable; violating them breaks the business model or the books.

**Tables:** `drivers`, `subscriptions`, `rides`, `driver_monthly_stats`, `commission_tiers`.

**Invariants:**
1. **Snapshot the commission rate onto the `rides` row at completion.** The rate that applied at the moment a ride completed is locked to that row (`commission_rate_bps`, `commission_cents`, `driver_payout_cents`). **Never recompute a historical ride's commission from current tiers.** Recalculation creates reconciliation chaos and unpredictable revenue.
2. **Graduated commission, read from `commission_tiers` (never hardcoded):** default 20% / 12% / 8% across monthly fare bands $0–1,000 / $1,000–3,000 / >$3,000. Bracketed (marginal), not cliff. Tiers are config rows so they can change without a deploy.
3. **Flat fee:** $50/mo in steady state; **$0 during the 6-month launch pilot.** Commission still applies during the pilot. Do not reintroduce the flat fee inside the pilot window. Fee turn-on should be gated on a traction signal, not a hard date (see `@docs/monetization-model.md`).
4. **[DECIDED — bracketed per-ride]** Tiers are **bracketed (marginal)**, like tax brackets: each band's rate applies only to the fares within that band. Compute per ride at completion against the driver's month-to-date volume and **snapshot** (invariant #1). This is mathematically identical to re-bracketing the whole month, so **no month-end reconciliation job and no whole-month re-rating.** Cliff (whole month at one rate) is rejected — it lets more earnings yield less take-home and invites gaming the $1,000 / $3,000 lines.
5. **Currency is integer cents everywhere** — DB columns, app code, API. **Never floats for money.**
6. **All timestamps UTC** in the DB. Monthly buckets keyed `year_month` (e.g. `2026-06`) computed in a fixed timezone (America/Los_Angeles for a SD market) — decide once, document it.

**Driver activation gate (compliance, see invariant in `@docs/regulatory-compliance.md`):** a driver may not accept rides unless `background_check_status = 'passed'` AND `vehicle_inspection_status = 'passed'` AND `status = 'active'`. Enforce in the DB (RLS / check) AND the app — never just the UI.

---

## Brand / UI rules (so generated UI is on-brand)

Tokens and components are fully specified in `@brand/design-system.md`. Summary:
- **Palette:** Midnight `#0B2A5B` (brand/primary), Signal `#2A5BFF` (the single accent), Ivory `#F7F5EF` (canvas), White `#FFFFFF` (cards), Mist `#E7E3DA` (borders), Ink `#14171F` (text).
- **Type:** Sora (display/wordmark), Plus Jakarta Sans (body/UI). **Tabular numerals on every fare, ETA, distance, and count.**
- **Aesthetic:** light UI, white cards on ivory, generous rounded corners, lots of whitespace.
- **Logo:** `RIDO` uppercase (blue I) for icon/large standalone marks; `rido` lowercase (blue i) as the in-product verb and the in-app wordmark.
- **Maps:** brand-blue (Midnight) markers, **not** the default red pin.

---

## Conventions [CONFIRM]

- TypeScript `strict: true`. No `any` in pricing or schema code.
- Server components by default; client components only where interactivity needs them.
- Generate and commit Supabase types; import DB types, don't redeclare them.
- Env: `NEXT_PUBLIC_*` for client-safe only. **Service-role key is server-only — never shipped to the client.**
- Tests: pricing/payout logic must have unit tests covering each tier boundary ($0, $999.99, $1,000, $3,000, >$3,000) and the pilot ($0 fee) vs steady ($50 fee) cases.
- Conventional commits; small PRs; one concern per PR.

---

## Guardrails — do NOT

- Hardcode commission rates or the flat fee in app code — read `commission_tiers` and the driver's `subscriptions` row.
- Recompute historical ride commissions from current tiers (invariant #1).
- Store currency as a float.
- Let a driver go active without passing the compliance gate.
- Reintroduce the flat fee during the pilot.
- Expose the Supabase service-role key or Stripe secret to the client.
- Make the app look like Uber. Borrow the polish, not the design — the brand is explicitly anti-incumbent.

---

## Deeper context (load when relevant)

- `@docs/business-overview.md` — what/why/who, the wedge, the market.
- `@docs/market-viability.md` — sizing, take-rate data, driver break-even, the Empower post-mortem, the verdict.
- `@docs/monetization-model.md` — the finalized pricing + pilot logic. **Read before pricing work.**
- `@docs/regulatory-compliance.md` — CA TNC rules, insurance, Prop 22, compliance fields.
- `@docs/technical-architecture.md` — full schema, the trigger, the `completeRide` Edge Function, the open retroactive decision.
- `@brand/design-system.md` — tokens, components, the logo system. **Read before any UI work.**
- `@brand/brand-guide.md` — positioning, voice, message hierarchy.
