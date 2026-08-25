# apps/web — CLAUDE.md

Next.js (App Router) + TypeScript + Tailwind. On Vercel, **Root Directory is `apps/web`**.

TypeScript is pinned to **6.0.3**, not the npm-latest 7.x. TS 7 went native in July 2026 and
shipped with no stable programmatic API — it breaks `typescript-eslint` and most type-checking
tooling until 7.1 lands. Don't bump past 6.x until that ships and the ecosystem catches up.

## Brand

Tokens come from `brand/design-system.md`, mapped **once** into `src/app/globals.css`'s
`@theme` block. Tailwind v4 is CSS-first — there is no `tailwind.config.ts`.
**Never write a hex value in a component.**

| Token | Hex | Role |
|---|---|---|
| Midnight | `#0B2A5B` | Primary. Headers, primary buttons, map markers, wordmark |
| Signal | `#2A5BFF` | The single accent. Interactive/live states, focus, the `i` |
| Ivory | `#F7F5EF` | Canvas |
| White | `#FFFFFF` | Cards and sheets |
| Mist | `#E7E3DA` | 1px borders and dividers |
| Ink | `#14171F` | Primary text |
| Slate | `#5B5F69` | Secondary text |

- **Sora** for display and the wordmark; **Plus Jakarta Sans** for body and UI.
- **Tabular numerals on every fare, ETA, distance, count and percentage.** Use the shared
  `tabular` utility — don't hand-roll `font-feature-settings` per component.
- White cards on ivory canvas with a 1px Mist border. **Borders and tonal lift, not shadows.**
  This is the signature surface; it does the sleek-but-warm work.
- Radii: inputs and buttons 12px, cards 16–18px, pills 20px+.
- In-app wordmark is lowercase `rido` with a Signal-blue `i`. Uppercase `RIDO` is for the app
  icon, splash, favicon, and large standalone marks only.
- Map markers are **Midnight, never a default red pin.** Route line Midnight, live driver dot Signal.
- **Light UI only.** No dark mode unless one is deliberately designed.

## Structure

| Path | Holds |
|---|---|
| `src/app/(marketing)/` · `(rider)/` · `(driver)/` | Route groups, one flow each. No shared layout between rider and driver beyond the root |
| `src/components/ui/` | Brand primitives: `Button`, `Card`, `Input`, `Badge`, `SegmentedControl` |
| `src/components/domain/` | RIDO-specific: `MarketingNav`, `Wordmark`, later `RideCard`, `TierProgress` |
| `src/lib/<domain>/` | **The vendor boundary.** One module per domain — `auth/` today, `rides/`, `stripe/`, `maps/` to come |
| `src/lib/marketing/` | Published figures, derived from `@rido/pricing` at build time. Not a vendor boundary — a *derivation* boundary, so no page ever types a rate |
| `src/lib/supabase/` | Client construction only (`client.ts` browser, `server.ts` server-only). Domain modules consume it; components don't |
| `src/types/database.types.ts` | Generated. Regenerate after every migration; never hand-edit |

`src/proxy.ts` refreshes the Supabase session cookie on every request and bounces anonymous
visitors off `PROTECTED_PREFIXES` as a real 307. Named `proxy.ts` / `proxy()`, not
`middleware.ts` / `middleware()` — Next.js 16 deprecated the old name. It runs on nearly every
route, so **without `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` set, every page 500s** — by design; a
missing Supabase config fails loud, not silently.

`error.tsx` · `global-error.tsx` · `not-found.tsx` · `loading.tsx` sit at the app root.
`loading.tsx` puts every route behind a Suspense boundary, which turns a page-level `redirect()`
into a streamed 200 plus a client navigation — that's why the auth gate is *also* in `proxy.ts`.
**`requireUser()` in the page remains the security boundary**; the proxy list only buys a clean
HTTP status, so forgetting an entry there fails safe.

**There is no `src/lib/pricing/`.** Money math is `packages/pricing`, imported as `@rido/pricing`.
If you're reaching for arithmetic on a fare here, you're in the wrong file.

## Auth

`src/lib/auth/` is the boundary and the reference implementation of ADR-0006: `browser.ts`
(client operations), `server.ts` (`server-only` — session reads, email-link completion,
sign-out), `errors.ts` (vendor error → RIDO voice), `result.ts` (`AuthResult`).

- Routes: `/login` (sign-in only), `/signup` (**the only place accounts are created**),
  `/auth/confirm` (exchanges an email `token_hash` for a session — every email-link flow needs
  it), `/auth/signout` (POST only, so an `<img>` tag can't log people out), `/account`.
- Both surfaces take email **or** phone. Phone is passwordless — the SMS code is the credential,
  so there is deliberately no phone+password combination. Numbers normalise to E.164 via
  `src/lib/phone.ts`; a bare 10-digit number is assumed US (first market is San Diego).
- A phone-only account has **no** `email`. Anything rendering an identity handles both.
- **Dashboard configuration is required and fails silently without it** — email templates,
  redirect allowlist, custom SMTP, SMS provider. See `docs/architecture/auth-setup.md`.
- `.env.local` (gitignored) holds the three Supabase values; copy `.env.example`. Never create or
  edit it through GitHub's web UI — that path ignores `.gitignore` and commits the secret.

## Rules

- Server Components by default. `"use client"` needs a reason you could state out loud.
- **Never call a vendor SDK from a component, page, or route handler** — go through
  `src/lib/<domain>/`. A component calling `supabase.auth.*` is a bug even when it works: it puts
  a rule somewhere it can drift. Operations return app-shaped results, so a component *cannot*
  render a raw vendor error. New behaviour is a new function there. (ADR-0006)
- **Login never creates accounts.** `shouldCreateUser: false` is set once inside
  `src/lib/auth/browser.ts`; callers don't pass it, so they can't forget it. Account creation is
  an explicit act at `/signup`, verified before the account is usable — drivers are
  compliance-gated, so an account existing is always someone's deliberate decision.
- **Pure logic in `src/lib/` ships with tests** — phone normalisation, error mapping, redirect
  guards. They take arguments and return values; there's no setup cost. (ADR-0007)
- `params` and `searchParams` in page/layout components are **Promises**, not plain objects
  (`const { id } = await params`). Easy to get wrong copying older Next.js examples.
- The service-role client is importable **only** from `src/lib/supabase/server.ts`, which carries
  `import "server-only"`. It must never be reachable from a client component.
- Components receive **cents**. Money is formatted at the very edge with `Intl.NumberFormat`.
  No component does arithmetic on a fare.
- Any fare, payout, or percentage shown to a driver comes from a **snapshotted `rides` row** or
  from `@rido/pricing`. Never from arithmetic inline in JSX.
- The driver-facing **"you keep $X.XX (Y%)"** figure is the product's core promise made visible.
  If it can't be sourced from a snapshot or the pricing package, **don't render a number.**
- Marketing/aggregate percentages (e.g. "drivers keep X%" on a landing page) come from
  `src/lib/marketing/figures.ts`, which derives every one of them by running `@rido/pricing` over
  the seeded tiers at build time. **Never type a rate or a percentage into a page or into
  `mock-data.ts`.** To change one, change `supabase/seed/commission_tiers.sql` and run
  `npm run generate:tiers` — see `docs/business/changing-rates.md`.
- `src/lib/mock-data.ts` is for genuinely illustrative copy — testimonials, requirements, contact.
  A commission figure appearing there is a bug: it belongs in `src/lib/marketing/figures.ts`.
- Copy follows `brand/brand-guide.md`: plain verbs, sentence case, active voice. Buttons name what
  happens ("Get a rido", not "Submit").
- Marketing CTAs: "Get a rido" → `/login`, "Drive with rido" → `/drivers` — except **on**
  `/drivers`, where it's the conversion CTA and goes to `/signup`. `/request` exists but nothing
  links to it; it's an unbuilt placeholder.
