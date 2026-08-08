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

- `src/app/(marketing)/` · `(rider)/` · `(driver)/` — route groups, one flow each. No shared
  layout between rider and driver beyond the root.
- `src/components/ui/` — brand primitives: `Button`, `Card`, `Input`, `FareChip`, `BottomSheet`.
- `src/components/domain/` — RIDO-specific: `RideCard`, `TierProgress`, `DriverStatusToggle`.
- `src/lib/supabase/` (`client.ts` browser, `server.ts` server-only), `src/lib/stripe/`,
  `src/lib/maps/`.
- `src/proxy.ts` — refreshes the Supabase session cookie on every request. Named `proxy.ts` /
  `proxy()`, not `middleware.ts` / `middleware()` — Next.js 16 deprecated the old name. Runs on
  nearly every route; **without `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` set, every page 500s**,
  by design — a missing Supabase config fails loud, not silently.
- `.env.local` (gitignored) holds the three Supabase values — copy `.env.example` and fill in
  real ones from Settings → API. `SUPABASE_SERVICE_ROLE_KEY` is server-only, never
  `NEXT_PUBLIC_`, never pasted anywhere it could be logged or committed.
- Auth routes: `/login` (sign-in only), `/signup` (the only place accounts are created),
  `/auth/confirm` (exchanges an email `token_hash` for a session — **every** email-link flow
  needs it), `/auth/signout` (POST only), `/account` (first auth-gated route).
- **There is no `src/lib/pricing/`.** Money math is `packages/pricing`, imported as
  `@rido/pricing`. If you're reaching for arithmetic on a fare here, you're in the wrong file.
- `src/types/database.types.ts` is generated. Regenerate after every migration; never hand-edit.

## Rules

- Server Components by default. `"use client"` needs a reason you could state out loud.
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
- Marketing/aggregate percentages (e.g. "drivers keep X%" on a landing page) cite the one figure
  in `docs/business/monetization.md` — never invent or recompute one per-component. That figure
  is interim until Phase 2 computes it from `@rido/pricing` directly.
- Copy follows `brand/brand-guide.md`: plain verbs, sentence case, active voice. Buttons name what
  happens ("Get a rido", not "Submit").
- **Never surface a raw Supabase auth error to a user.** Pass it through
  `authErrorMessage()` in `src/lib/auth-errors.ts` — raw strings are off-voice and can reveal
  whether an account exists. Add new cases there, not inline in a component.
- **Login never creates accounts** (`shouldCreateUser: false`). Account creation is an explicit
  act at `/signup`, which verifies the email before the account is usable — drivers are
  compliance-gated, so an account existing should always be someone's deliberate decision.
