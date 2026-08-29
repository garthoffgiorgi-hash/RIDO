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
| `src/lib/<domain>/` | **The vendor boundary.** One module per domain — `auth/`, `maps/`, `fares/`, `rides/` today, `stripe/` to come |
| `src/lib/maps/` | Mapbox. `server.ts` measures a trip and resolves a storable coordinate (`server-only`); `browser.ts` searches places; `map.ts` renders one (`mapbox-gl`, dynamically imported); `route.ts`/`places.ts`/`geocode.ts`/`errors.ts`/`map-geometry.ts` are pure and tested. See **Maps** below |
| `src/lib/fares/` | Reads the active `fare_rate_cards` row and calls `quoteFare()` — the DB half of ADR-0009, same pattern `src/lib/drivers/server.ts` uses for its own table |
| `src/lib/rides/` | Booking: `status.ts` (pure `RideStatus`, `canRiderCancel`), `server.ts` (`quoteRideRequest`, `requestRide`, `cancelRide`, `getActiveRide`, service-role writes). Reached from `(rider)/request/actions.ts`, never imported into a Client Component directly — it carries `import "server-only"` but is not itself `"use server"`. See **Rider/driver** below |
| `src/lib/drivers/` | Whether the signed-in user IS a driver: `status.ts` (pure, `DriverProfile`, `isActiveDriver`) and `server.ts` (`getOwnDriverProfile`). No `role` column — a driver identity is a matching `drivers` row, checked here rather than in a page |
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

## Rider/driver

**No `role` column exists or should be added.** A driver identity is simply a `drivers` row
existing for the signed-in `auth_user_id` — check it with `getOwnDriverProfile()` from
`src/lib/drivers/server.ts`, never a hand-rolled query. A person can hold both identities at
once (there is no self-serve "become a driver" flow yet — the only route in today is an
admin/vetting process under the service role), so a page that needs to know shows or hides
content per identity; it never forces a single choice between them.

`/account` is the one post-login landing page for everyone — `/request` has real
functionality now, but redirecting straight into a live map on every sign-in isn't obviously
right, and `/drive` still has nothing to redirect into, so the split stays deferred. It's
role-aware in its *content* (a rider card always, a driver card if `getOwnDriverProfile()`
returns non-null), not in *where the login redirect sends you*. `/drive` and `/request` are both
auth-gated the same way: `requireUser()` in the page is the boundary, `proxy.ts`'s
`PROTECTED_PREFIXES` is the clean-redirect convenience.

**A rider books through `src/lib/rides/`, never through an RLS write policy.** `rides` grants
`authenticated` no `INSERT`/`UPDATE` at all — `requestRide()` re-measures and re-prices
server-side at confirm and writes through `createServiceRoleClient()`, the same shape
`complete-ride` uses on the driver side. `shownFareCents` is compared, never stored: if the
fresh quote disagrees, nothing is written and the rider re-confirms at the new price. `/request`
is unlinked from anywhere — nothing accepts a requested ride yet. ADR-0012,
`docs/architecture/ride-booking.md`.

## Maps

**The browser may name two places. Only the server may measure the trip between them.** (ADR-0010)

`measureRoute()` in `src/lib/maps/server.ts` is the only function allowed to produce the
`distanceMeters`/`durationSeconds` that reach `quoteFare()` — it carries `import "server-only"`, so
importing it from a client component is a build error. A client-supplied distance or duration is
never an input to a price; a client-supplied *coordinate pair* is fine. Place search
(`browser.ts`) runs client-side on the public token, because search isn't money.

- **Two tokens.** `NEXT_PUBLIC_MAPBOX_TOKEN` is a Mapbox `pk.` token — public by design, restrict
  it by URL. `MAPBOX_SECRET_TOKEN` is `sk.`, server-only, and never `NEXT_PUBLIC_`. They must be
  separate: Mapbox restricts by `Referer`, and a server fetch sends none.
- **Mapbox reports routing failures with HTTP 200** (`code: "NoRoute"`). `response.ok` is not the
  check; `parseDirectionsBody` is.
- **Mapbox returns floats; `quoteFare` throws on them.** The rounding happens once, in
  `parseDirectionsBody`, and is tested. Never round at a call site.
- `map.ts` is **the only file importing `mapbox-gl`** — enforced by `check-context.mjs` rule 7. It
  exports `createRideMap()`, returning an opaque `RideMapHandle` rather than a Mapbox `Map`
  instance, so a caller can't depend on a vendor API detail. Markers are Midnight DOM elements,
  never a recoloured default pin. A GL layer's `line-color` needs a literal colour, so it reads
  `--color-midnight` off `:root` at runtime — the one documented exception to "never a hex in a
  component", and it belongs in `map.ts` alone. `RideMap.tsx` (`src/components/domain/`) is the
  one Client Component allowed to reach it. `/dev/maps` (auth-gated, 404s outside development)
  proves the whole path — search, `measureRoute()`, `quoteFare()`, render — against a real Mapbox
  account. See `docs/architecture/maps.md`.
- **Search Box results are display-only** — they may not be stored at any price. The storable path
  is `geocode.ts` (Geocoding v6, always `permanent=true`), reached through
  `resolveStorableCoordinates()` in `server.ts`. It is **built and switched off**: the pilot stores
  `rides.pickup_address`/`dropoff_address` and defers coordinates to a later backfill. Only the
  `/dev/maps` button calls it, because it is the one call that spends real money.
- `rides.distance_meters`/`duration_seconds` hold the **actual** trip, never the routed estimate —
  duration from `completed_at − started_at`, distance from a GPS trace once the driver app exists.
  The fare is never recomputed from either. (ADR-0011)

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
