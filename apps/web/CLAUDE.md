# apps/web — CLAUDE.md

Next.js (App Router) + TypeScript + Tailwind. On Vercel, **Root Directory is `apps/web`**.

TypeScript is pinned to **6.0.3**, not the npm-latest 7.x: TS 7 went native in July 2026 with no
stable programmatic API, breaking most type-checking tooling until 7.1. Don't bump past 6.x.

## Brand

Tokens are defined **once** in `brand/design-system.md` and mapped once into `src/app/globals.css`'s
`@theme` block — Tailwind v4 is CSS-first, so there is no `tailwind.config.ts`. Use them as classes
(`bg-midnight`, `border-mist`, `text-slate`); **never write a hex value in a component.** Seven of
them: **Midnight** (primary — headers, primary buttons, map markers, wordmark), **Signal** (the one
accent — interactive and live states, focus, the `i`), **Ivory** (canvas), **White** (cards and
sheets), **Mist** (borders and dividers), **Ink** (primary text), **Slate** (secondary text).

- **Sora** for display and the wordmark; **Plus Jakarta Sans** for body and UI.
- **Tabular numerals on every fare, ETA, distance, count and percentage.** Use the shared
  `tabular` utility — don't hand-roll `font-feature-settings` per component.
- White cards on ivory canvas with a 1px Mist border. **Borders and tonal lift, not shadows.**
  This is the signature surface; it does the sleek-but-warm work. Radii: inputs and buttons 12px,
  cards 16–18px, pills 20px+. **Light UI only** — no dark mode unless one is deliberately designed.
- In-app wordmark is lowercase `rido` with a Signal-blue `i`; uppercase `RIDO` is for the app icon,
  splash, favicon, and large standalone marks only. Map markers are **Midnight, never a default red
  pin** — route line Midnight, live driver dot Signal.

## Structure

| Path | Holds |
|---|---|
| `src/app/(marketing)/` · `(rider)/` · `(driver)/` | Route groups, one flow each. No shared layout between rider and driver beyond the root |
| `src/components/ui/` | Brand primitives: `Button`, `Card`, `Input`, `Badge`, `Avatar`, `Sheet`, `FareChip`, `SegmentedControl` |
| `src/components/domain/` | RIDO-specific: `MarketingNav`, `Wordmark`, `RideCard`, `RideMap`, `PlaceSearch`, later `TierProgress` |
| `src/lib/<domain>/` | **The vendor boundary** (ADR-0006, root invariant 7) — one module per domain, each owning its own `result.ts` and its own error translation. The ones that exist today: |
| `src/lib/stripe/` | Stripe. `server.ts` is **the only file importing `stripe`** (`server-only`, pinned API version, client built per call so unrelated routes still build without a key); `account-status.ts` (Connect state machine) and `errors.ts` (vendor error → RIDO voice + retryability) are pure and tested. Knows Stripe, not what RIDO owes |
| `src/lib/payouts/` | What RIDO owes: `getPayoutSummary`, `startConnectOnboarding`, `refreshConnectState`, `payoutRide`, `retryPayout` — service-role reads and writes against the `driver_payouts` ledger. Same vendor/domain split as `maps/` vs `fares/`. See **Payouts** below |
| `src/lib/maps/` | Mapbox. `server.ts` measures a trip and resolves a storable coordinate (`server-only`); `browser.ts` searches places; `map.ts` renders one (`mapbox-gl`, dynamically imported); `route.ts`/`places.ts`/`geocode.ts`/`errors.ts`/`map-geometry.ts` are pure and tested. See **Maps** below |
| `src/lib/fares/` | Reads the active `fare_rate_cards` row and calls `quoteFare()` — the DB half of ADR-0009, same pattern `src/lib/drivers/server.ts` uses for its own table |
| `src/lib/commission/` | Reads what commission looks like *right now* — `getActiveCommissionTiers()`, `getDriverMonthToDateCents(driverId)` — and hands both to `commissionForRide()` (`@rido/pricing`). No arithmetic here, same division `fares/` holds for `quoteFare()`. What powers the driver-facing "you keep $X (Y%)" figure for a ride with no snapshot yet |
| `src/lib/rides/` | Booking, accept, and completion: `status.ts` (pure `RideStatus`, `canRiderCancel`), `accept.ts` (pure `canAcceptRide`), `start.ts` (pure `canStartTrip`), `completion-errors.ts` (pure, `complete-ride`'s HTTP responses → RIDO's voice + retryability), `server.ts` (`quoteRideRequest`, `requestRide`, `cancelRide`, `getActiveRide`, `getRecentlyCompletedRide`, `listOpenRequests`, `acceptRide`, `startTrip` — all service-role writes — and `completeRide`, which calls the deployed `complete-ride` Edge Function instead). Reached from `(rider)/request/actions.ts` and `(driver)/drive/actions.ts`, never imported into a Client Component directly — it carries `import "server-only"` but is not itself `"use server"`. See **Rider/driver** below |
| `src/lib/drivers/` | Whether the signed-in user IS a driver: `status.ts` (pure, `DriverProfile`, `isActiveDriver`) and `server.ts` (`getOwnDriverProfile`). No `role` column — a driver identity is a matching `drivers` row, checked here rather than in a page |
| `src/lib/marketing/` | Published figures, derived from `@rido/pricing` at build time. Not a vendor boundary — a *derivation* boundary, so no page ever types a rate |
| `src/lib/supabase/` | Client construction only (`client.ts` browser, `server.ts` server-only). Domain modules consume it; components don't |
| `src/types/database.types.ts` | Generated. Regenerate after every migration; never hand-edit |

`src/proxy.ts` refreshes the Supabase session cookie on every request and bounces anonymous
visitors off `PROTECTED_PREFIXES` as a real 307. Named `proxy.ts` / `proxy()`, not
`middleware.ts` / `middleware()` — Next.js 16 deprecated the old name. It runs on nearly every
route, so **without `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` set, every page 500s** — by design; a
missing Supabase config fails loud, not silently. Its matcher **excludes `api/stripe`**: a webhook
arrives with no cookies and must not have a session refresh attempted on it.

`error.tsx` · `global-error.tsx` · `not-found.tsx` · `loading.tsx` sit at the app root. `loading.tsx`
puts every route behind a Suspense boundary, which turns a page-level `redirect()` into a streamed
200 plus a client navigation — that's why the auth gate is *also* in `proxy.ts`. **`requireUser()`
in the page remains the security boundary**; the proxy list only buys a clean HTTP status, so
forgetting an entry there fails safe.

**There is no `src/lib/pricing/`.** Money math is `packages/pricing`, imported as `@rido/pricing` —
reaching for arithmetic on a fare or a payout here means you're in the wrong file.

## Auth

`src/lib/auth/` is the boundary and the reference implementation of ADR-0006: `browser.ts`
(client operations), `server.ts` (`server-only` — session reads, email-link completion,
sign-out), `errors.ts` (vendor error → RIDO voice), `result.ts` (`AuthResult`).

- Routes: `/login` (sign-in only), `/signup` (**the only place accounts are created**),
  `/auth/confirm` (exchanges an email `token_hash` for a session — every email-link flow needs
  it), `/auth/signout` (POST only, so an `<img>` tag can't log people out), `/account`.
- Both surfaces take email **or** phone. Phone is passwordless — the SMS code is the credential, so
  there is deliberately no phone+password combination; numbers normalise to E.164 via
  `src/lib/phone.ts` (a bare 10-digit number is assumed US). A phone-only account has **no**
  `email`, so anything rendering an identity handles both.
- **Dashboard configuration is required and fails silently without it** — email templates,
  redirect allowlist, custom SMTP, SMS provider. See `docs/architecture/auth-setup.md`.
- `.env.local` (gitignored) holds every secret — Supabase, `MAPBOX_SECRET_TOKEN`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; copy `.env.example`. Never create or edit it
  through GitHub's web UI — that path ignores `.gitignore` and commits the secret.

## Rider/driver

**No `role` column exists or should be added.** A driver identity is simply a `drivers` row existing
for the signed-in `auth_user_id` — check it with `getOwnDriverProfile()` from
`src/lib/drivers/server.ts`, never a hand-rolled query. A person can hold both identities at once
(there's no self-serve "become a driver" flow — the only route in is admin/vetting under the service
role), so a page shows or hides content per identity; it never forces a choice between them.

`/account` is the one post-login landing page for everyone — deferred deliberately: both
`/request` and `/drive` are real now, but dropping someone straight into a live map or a dispatch
board on every sign-in isn't obviously right either. It's role-aware in its *content* (a rider card
always, a driver card if `getOwnDriverProfile()` returns non-null), not in *where login sends you*.
Both are auth-gated the same way: `requireUser()` in the page is the boundary, `proxy.ts`'s
`PROTECTED_PREFIXES` is the clean-redirect convenience.

**Every `rides` write goes through `src/lib/rides/`, never an RLS write policy** — `authenticated`
has no `INSERT`/`UPDATE` on the table at all, so both sides write through
`createServiceRoleClient()`. `requestRide()` re-measures and re-prices server-side at confirm;
`shownFareCents` is compared, never stored, so a moved price means nothing is written and the rider
re-confirms. ADR-0012, `docs/architecture/ride-booking.md`.

**A driver accepts through the same module, same posture.** `listOpenRequests(driver)` reads the
open pool through a PERMISSIVE policy written for it — the pre-existing driver policy silently hid
every unassigned ride, because a *nullable* `driver_id` in `IN (subquery)` is SQL `NULL`, not
`FALSE`. `acceptRide()` and `startTrip()` pre-flight-check with pure `canAcceptRide()`/
`canStartTrip()`, then write one conditional `UPDATE … WHERE status = …` — no lock, no CAS: they
touch one row, so Postgres's row-level locking is the whole mechanism. `completeRide()` instead
calls the deployed `complete-ride` Edge Function, **forwarding the driver's own access token**,
never the service-role key, which would make `authorizeCompletion` skip its checks entirely
(invariant 6). `getDriverActiveRide(driver)` is the read `/drive` needs to survive a reload.
ADR-0013, ADR-0014, `ride-booking.md`, `ride-completion.md`.

## Payouts

**Completing a ride records a debt; paying it is a separate, retryable step.** The `driver_payouts`
row is written by a trigger inside the completion transaction — no code here decides whether it
exists — so `payoutRide()` is best-effort by design, and a payout failure must never turn a
completed ride into a failed one. ADR-0015, `docs/architecture/payouts.md`.

- **Nothing in `src/lib/payouts/` does arithmetic on money.** The amount transferred is read off the
  ledger row, which the trigger copied from the ride's write-once `driver_payout_cents`; RIDO
  absorbs card processing, so nothing is netted out either. `@rido/pricing` isn't imported here at
  all — importing it would be the bug.
- **`src/lib/stripe/server.ts` is the only file importing `stripe`** — rule 7, same as `map.ts` for
  `mapbox-gl`. It returns app-shaped results (`StripeResult`, `TransferOutcome`), so retryability
  comes from the *original* Stripe error, never from re-reading a message we already translated.
- **The webhook route reads the raw body.** `src/app/api/stripe/webhook/route.ts` calls
  `await request.text()` — a body through `.json()` can no longer be signature-verified. It handles
  `account.updated` only, which writes state rather than deltas and so is idempotent by nature;
  that is why there's no processed-event table. The first non-idempotent handler needs one.
- **Connect state is Stripe's word, not the driver's.** `stripe_account_id`,
  `stripe_payouts_enabled` and `stripe_details_submitted` sit outside the `authenticated` column
  `UPDATE` grant, written only through the service role. Onboarding links are single-use and
  short-lived — create one per attempt, never cache one.
- `src/lib/payouts/types.ts` is a **temporary** hand-written bridge; delete it the moment
  `npm run types:generate` runs against the pushed migration.

## Maps

**The browser may name two places. Only the server may measure the trip between them.** (ADR-0010)
`measureRoute()` in `src/lib/maps/server.ts` is the only function allowed to produce the
`distanceMeters`/`durationSeconds` that reach `quoteFare()`; it carries `import "server-only"`, so
importing it from a client component is a build error. A client-supplied distance or duration is
never an input to a price; a client-supplied *coordinate pair* is fine. Place search (`browser.ts`)
runs client-side on the public token, because search isn't money.

- **Two tokens, never one.** `NEXT_PUBLIC_MAPBOX_TOKEN` is `pk.`; `MAPBOX_SECRET_TOKEN` is `sk.`
  and never `NEXT_PUBLIC_`. Mapbox restricts by `Referer`, and a server fetch sends none.
- **Never trust `response.ok`, never round at a call site.** Mapbox reports routing failures with
  HTTP 200 (`code: "NoRoute"`) and returns floats that `quoteFare` throws on. `parseDirectionsBody`
  handles both, once, tested.
- `map.ts` is **the only file importing `mapbox-gl`** (rule 7) and returns an opaque
  `RideMapHandle`, never a Mapbox `Map`, so no caller can depend on a vendor detail. Its
  `--color-midnight` read off `:root` is the one documented exception to "never a hex in a
  component". `RideMap.tsx` is the only Client Component allowed to reach it.
- **Search Box results are display-only** — never stored at any price. The storable path
  (`geocode.ts`, Geocoding v6, `permanent=true`, via `resolveStorableCoordinates()`) is built and
  **switched off**: the pilot stores addresses and defers coordinates to a backfill.
- `rides.distance_meters`/`duration_seconds` are the **actual** trip, never the routed estimate;
  fare is never recomputed from either. `duration_seconds` is trigger-derived from
  `completed_at − started_at` (null if `started_at` never was); `distance_meters` needs a GPS
  trace. (ADR-0011, ADR-0014)
- Which products and why, rate limits, token setup, `/dev/maps`: `docs/architecture/maps.md`.

## Rules

- Server Components by default. `"use client"` needs a reason you could state out loud.
- **Never call a vendor SDK from a component, page, or route handler** — go through
  `src/lib/<domain>/`. A component calling `supabase.auth.*` is a bug even when it works: it puts a
  rule somewhere it can drift. Operations return app-shaped results, so a component *cannot* render
  a raw vendor error; new behaviour is a new function there. Route handlers are no exception — the
  Stripe webhook verifies through the lib, importing no SDK itself. (ADR-0006)
- **Login never creates accounts.** `shouldCreateUser: false` is set once inside
  `src/lib/auth/browser.ts`; callers don't pass it, so they can't forget it. Account creation is an
  explicit, verified act at `/signup` — drivers are compliance-gated, so an account existing is
  always someone's deliberate decision.
- **Pure logic in `src/lib/` ships with tests** — phone normalisation, error mapping, redirect
  guards. They take arguments and return values; there's no setup cost. (ADR-0007)
- `params` and `searchParams` in page/layout components are **Promises**, not plain objects
  (`const { id } = await params`). Easy to get wrong copying older Next.js examples.
- The service-role client is importable **only** from `src/lib/supabase/server.ts`, which carries
  `import "server-only"`. It must never be reachable from a client component.
- **Calling a deployed Edge Function is a server-only `fetch`**, in the domain's `server.ts`, never
  a component. Forward the user's own access token as the bearer, not the service-role key — the
  latter skips a function's own ownership/compliance checks. `completeRide()` is the reference. (ADR-0014)
- Components receive **cents**, formatted at the very edge with `Intl.NumberFormat`. Every fare,
  payout or percentage shown to a driver comes from a **snapshotted `rides` row**, the
  `driver_payouts` ledger, or `@rido/pricing` — never from arithmetic inline in JSX. The
  driver-facing **"you keep $X.XX (Y%)"** is the product's core promise made visible: if it can't
  be sourced from one of those three, **don't render a number.**
- Marketing/aggregate percentages come from `src/lib/marketing/figures.ts`, which derives every one
  by running `@rido/pricing` over the seeded tiers at build time. **Never type a rate or a
  percentage into a page or into `mock-data.ts`** — that file is for genuinely illustrative copy
  (testimonials, requirements, contact), and a commission figure appearing there is a bug. To
  change one, edit `supabase/seed/commission_tiers.sql` and run `npm run generate:tiers`; see
  `docs/business/changing-rates.md`.
- Copy follows `brand/brand-guide.md`: plain verbs, sentence case, active voice. Buttons name what
  happens ("Get a rido", not "Submit"). Marketing CTAs: "Get a rido" → `/login`, "Drive with rido"
  → `/drivers`, except **on** `/drivers`, where it's the conversion CTA and goes to `/signup`.
