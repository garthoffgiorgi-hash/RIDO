# RIDO — Repo Reconciliation & Build Roadmap

*What's actually in the repo vs. what the docs describe, and the order to close the gap. Generated after reviewing the uploaded repo.*

## TL;DR
The repo is a **static marketing site** (two HTML pages, plain CSS/JS, no build). The architecture docs describe a **Next.js + Supabase app that doesn't exist yet**. The repo's brand is the **old direction** (different blues, Poppins/Inter, a car-with-wheels logo) and predates the design system. So this isn't "the code diverged from the plan" — it's "almost nothing is built, and the one thing that is (marketing) needs re-skinning."

## What's actually in the repo
- `index.html` + `about.html` — marketing pages (hero, content sections, fictional founders).
- `styles.css` — plain CSS, custom properties. Old palette: `#2A2EA0` / `#4169E1` / `#FAF7F0`; Poppins + Inter.
- `script.js` — vanilla JS (mobile menu, language dropdown).
- `vercel.json` — static hosting config (compatible with the target).
- `.github/workflows/node.js.yml` — Node CI; currently **fails** (`npm test` is a stub that exits 1).
- `package.json` / `package-lock.json` — stub, **no real dependencies**.

## The gap
| Area | Repo today | Target (docs) | Action |
|---|---|---|---|
| Framework | static HTML | Next.js + TS | build |
| Styling | plain CSS | Tailwind + tokens | build |
| Backend | none | Supabase (Postgres, RLS, Edge Fns) | build |
| Schema | none | drivers/subscriptions/rides/driver_monthly_stats/commission_tiers | build |
| Pricing logic | none | graduated commission + pilot | build |
| Payments/maps | none | Stripe + Mapbox | build |
| App | marketing only | rider + driver flows | build |
| Brand (palette/type/logo) | old (`#2A2EA0`, Poppins, car logo) | Midnight/Signal, Sora/Jakarta, RIDO/rido wordmark | re-skin or rebuild |
| Hosting | Vercel (static) | Vercel | keep |

## Specific fixes
1. **CI fails on every push** — `npm test` stub exits 1. Remove the workflow or replace with a real lint/test once there's a build.
2. **Fictional founders** in `about.html` (Ava Mercer / Diego Romano / Priya Anand) — replace with real content or drop the section.
3. **Old logo is a car with wheels** — the exact cliché the design system rejects. Replace with the RIDO/rido wordmark.
4. **Confirm this is the canonical repo** — it's on a Claude-generated branch (`claude/nice-franklin-8eychm`), not obviously `main`.

## Build roadmap (suggested order)
**Phase 0 — decide (blocks everything):** ✅ stack locked (Next.js + TS + Tailwind + Supabase + Stripe + Mapbox); ✅ landing rebuilt fresh in Claude Design on the new brand; ✅ commission is **bracketed per-ride** (no reconciliation job). **Still open:** the commercial insurance quote (gates the economics).

**Phase 1 — foundation:** scaffold Next.js + TS + Tailwind (map brand tokens into the Tailwind config); set up Supabase project; wire auth; add the 5 tables as migrations; seed `commission_tiers`.

**Phase 2 — money spine:** `lib/pricing/` pure functions (graduated commission, pilot $0 fee) with unit tests at every tier boundary; `completeRide` Edge Function + `bump_monthly_stats` trigger; Stripe (subscription for flat fee, Connect for payouts).

**Phase 3 — surfaces:** marketing landing on the new brand (Claude Design → handoff); rider request flow; driver view (online/offline, incoming request with "you keep $X", MTD tier progress). Mapbox integration.

**Phase 4 — compliance gates:** driver activation gated on background-check + vehicle-inspection status; CPUC fee + airport surcharge handling.

> The old static site can stay live as a placeholder landing while Phase 1–2 happen behind it — just re-skin it to the new brand first so it's not advertising the old identity.
