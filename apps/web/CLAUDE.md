# apps/web — CLAUDE.md

Next.js (App Router) + TypeScript + Tailwind. On Vercel, **Root Directory is `apps/web`**.

## Brand

Tokens come from `brand/design-system.md`, mapped **once** into `tailwind.config.ts`.
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
- **There is no `src/lib/pricing/`.** Money math is `packages/pricing`, imported as
  `@rido/pricing`. If you're reaching for arithmetic on a fare here, you're in the wrong file.
- `src/types/database.types.ts` is generated. Regenerate after every migration; never hand-edit.

## Rules

- Server Components by default. `"use client"` needs a reason you could state out loud.
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
