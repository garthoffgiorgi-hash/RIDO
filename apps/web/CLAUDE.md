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
| `src/components/domain/` | RIDO-specific: `MarketingNav`, `Wordmark`, `RideCard`, `RideMap`, `PlaceSearch`, `TierProgress` |
| `src/lib/<domain>/` | **The vendor boundary** (ADR-0006, root invariant 7) — one module per domain, each owning its own `result.ts` and its own error translation. The ones that exist today: |
| `src/lib/stripe/` | Stripe. `server.ts` is **the only file importing `stripe`** (`server-only`, pinned API version, client built per call so unrelated routes still build without a key); `account-status.ts` (Connect state machine) and `errors.ts` (vendor error → RIDO voice + retryability) are pure and tested. Knows Stripe, not what RIDO owes |
| `src/lib/payouts/` | What RIDO owes a driver: `getPayoutSummary`, `startConnectOnboarding`, `refreshConnectState`, `settlePendingPayoutsForDriver`, `payoutRide`, `retryPayout` — service-role writes against the `driver_payouts` ledger |
| `src/lib/payments/` | What a rider owes RIDO: `getPaymentProfile`, `startCardSetup`, `recordCardFromSetup`, `authorizeRideCharge`, `captureRideCharge`, `chargeCancellationFee`, `voidRideCharge` against the `ride_charges` ledger; `browser.ts` mounts Stripe Elements. See **Money in and out** |
| `src/lib/maps/` | Mapbox. `server.ts` measures a trip and resolves a storable coordinate (`server-only`); `browser.ts` searches places; `map.ts` renders one (`mapbox-gl`, dynamically imported); `route.ts`/`places.ts`/`geocode.ts`/`errors.ts`/`map-geometry.ts` are pure and tested. See **Maps** below |
| `src/lib/fares/` | Reads the active `fare_rate_cards` row and calls `quoteFare()` — the DB half of ADR-0009, same pattern `src/lib/drivers/server.ts` uses for its own table |
| `src/lib/commission/` | Reads what commission looks like *right now* — `getActiveCommissionTiers()`, `getDriverMonthSummary(driverId)` (the whole `driver_monthly_stats` row; `getDriverMonthToDateCents()` delegates to it), `getDriverTierProgress(driverId)` (assembles both plus `tierPositionFor()` into `TierProgress`'s props) — and hands figures to `commissionForRide()`/`tierPositionFor()` (`@rido/pricing`). No arithmetic here, same division `fares/` holds for `quoteFare()`. Powers the driver-facing "you keep $X (Y%)" figure for a ride with no snapshot yet, and the MTD tier-progress card |
| `src/lib/rides/` | Booking, accept, and completion: `status.ts` (pure `RideStatus`, `canRiderCancel`), `accept.ts` (pure `canAcceptRide`), `start.ts` (pure `canStartTrip`), `completion-errors.ts` (pure, `complete-ride`'s HTTP responses → RIDO's voice + retryability), `realtime-event.ts` (pure, channel status → refetch or not), `realtime.ts` (**browser-side**, `subscribeToRide` (ADR-0020) and `subscribeToOpenRequests` (ADR-0021) behind the opaque `RideSubscription` — the one exception to this module being server-only), `server.ts` (`quoteRideRequest`, `requestRide`, `cancelRide`, `getActiveRide`, `getRecentlyCompletedRide`, `listOpenRequests`, `acceptRide`, `declineRide`, `startTrip` — all service-role writes — and `completeRide`, which calls the deployed `complete-ride` Edge Function instead). Reached from `(rider)/request/actions.ts` and `(driver)/drive/actions.ts`, never imported into a Client Component directly — it carries `import "server-only"` but is not itself `"use server"`. See **Rider/driver** below |
| `src/lib/drivers/` | Whether the signed-in user IS a driver, and whether they're taking work: `status.ts` (pure, `DriverProfile`, `isActiveDriver`) and `server.ts` (`getOwnDriverProfile`, `setAcceptingRides` — the app's only write to `drivers`, and the only one anywhere that goes through RLS rather than the service role, per ADR-0019's column grant). No `role` column — a driver identity is a matching `drivers` row, checked here rather than in a page |
| `src/lib/marketing/` | Published figures, derived from `@rido/pricing` at build time. Not a vendor boundary — a *derivation* boundary, so no page ever types a rate |
| `src/lib/supabase/` | Client construction only (`client.ts` browser, `server.ts` server-only). Domain modules consume it; components don't. `client.ts` was dead code until `src/lib/rides/realtime.ts` became its first consumer |
| `src/types/database.types.ts` | Generated. Regenerate after every migration; never hand-edit |

`src/proxy.ts` refreshes the session cookie and bounces anonymous visitors off `PROTECTED_PREFIXES`
as a real 307. Named `proxy.ts` / `proxy()` — Next.js 16 deprecated `middleware`. It runs on nearly
every route, so **without `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` set, every page 500s**, by design.
Its matcher **excludes `api/stripe`**: a webhook has no cookies and no session to refresh.

`error.tsx` · `global-error.tsx` · `not-found.tsx` · `loading.tsx` sit at the app root. `loading.tsx`
puts every route behind Suspense, turning a page-level `redirect()` into a streamed 200 plus a
client navigation — which is why the auth gate is *also* in `proxy.ts`. **`requireUser()` in the
page remains the security boundary**; the proxy list only buys a clean status, so a miss fails safe.

**There is no `src/lib/pricing/`.** Money math is `@rido/pricing`; arithmetic on a fare here is a bug.

## Auth

`src/lib/auth/` is the boundary and the reference implementation of ADR-0006: `browser.ts`
(client operations), `server.ts` (`server-only` — session reads, email-link completion,
sign-out), `errors.ts` (vendor error → RIDO voice), `result.ts` (`AuthResult`).

- Routes: `/login` (sign-in only), `/signup` (**the only place accounts are created**),
  `/auth/confirm` (exchanges an email `token_hash` for a session — every email-link flow needs
  it), `/auth/signout` (POST only, so an `<img>` tag can't log people out), `/account`.
- Both surfaces take email **or** phone. Phone is passwordless — the SMS code is the credential, so
  there is deliberately no phone+password combination; numbers normalise to E.164 via
  `src/lib/phone.ts`. A phone-only account has **no** `email`, so anything rendering identity handles both.
- **Dashboard configuration is required and fails silently without it** — email templates,
  redirect allowlist, custom SMTP, SMS provider. See `docs/architecture/auth-setup.md`.
- `.env.local` (gitignored) holds every key — copy `.env.example`. Never create or edit it
  through GitHub's web UI — that path ignores `.gitignore` and commits the secret.

## Rider/driver

**No `role` column exists or should be added.** A driver identity is simply a `drivers` row existing
for the signed-in `auth_user_id` — check it with `getOwnDriverProfile()` from
`src/lib/drivers/server.ts`, never a hand-rolled query. A person can hold both identities at once
(there's no self-serve "become a driver" flow — the only route in is admin/vetting under the service
role), so a page shows or hides content per identity; it never forces a choice between them.

`/account` is the one post-login landing page for everyone — deferred deliberately: both `/request`
and `/drive` are real now, but dropping someone straight into a live map or a dispatch board on
every sign-in isn't obviously right either. It's role-aware in its *content* (rider card and payment
card always, driver card if `getOwnDriverProfile()` returns non-null), not in *where login sends
you*. Both are auth-gated the same way: `requireUser()` in the page is the boundary, `proxy.ts`'s
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
calls the deployed `complete-ride` Edge Function, **forwarding the driver's own access token**, not
the service-role key, which would make `authorizeCompletion` skip its checks (invariant 6).
**Availability gates new work, never committed work** — only `canAcceptRide()` reads it, so a driver
may go offline mid-ride (ADR-0019). ADR-0013, ADR-0014, `ride-booking.md`, `ride-completion.md`.

## Money in and out

**Completing a ride records a debt; moving money is a separate, retryable step.** The
`driver_payouts` row is written by a trigger inside the completion transaction — no code here
decides whether it exists. So `captureRideCharge()` and `payoutRide()` are both best-effort, and
**neither may turn a completed ride into a failed one.** ADR-0015, ADR-0017,
`docs/architecture/payouts.md`, `docs/architecture/rider-charging.md`.

- **Capture before payout, in that order.** The capture funds the platform balance the transfer
  draws on; reversed, it is the `balance_insufficient` rider charging exists to end.
- **Neither `src/lib/payouts/` nor `src/lib/payments/` does arithmetic on money.** A payout is the
  ledger's copy of the ride's write-once `driver_payout_cents`; a capture is the stored
  `rider_total_cents`; a hold is `holdAmountCents()`'s. RIDO absorbs card processing, so nothing is
  netted. `@rido/pricing` is imported by neither — that would be the bug.
- **`rider_total_cents` is what the rider pays, `fare_cents` what commission splits.** Equal until a
  pass-through exists. Render the first to a rider; the second is the driver's business.
- **Two vendor files, one rule.** `src/lib/stripe/server.ts` is the only file importing `stripe`;
  `src/lib/payments/browser.ts` the only one importing `@stripe/stripe-js` (mounted per `map.ts`'s
  opaque-handle precedent — **not** the React bindings, which would put vendor components in JSX).
  Both return app-shaped results, so retryability comes from the *original* Stripe error.
- **A hold is placed on a ride that already exists.** `requestRide()` inserts first, authorizes
  second, and **cancels the row back if the authorization fails** — a stranded `'requested'` ride
  would block the rider from booking anything (`rides_one_active_per_rider`).
- **Cancellation: capture the fee, flip the status, send the payout — all three, in order.**
  `cancelRide()` calls `payoutRide()` itself, since unlike a completed ride, nothing else ever will. ADR-0018.
- **The webhook reads the raw body** (`await request.text()` — a parsed body can't be
  signature-verified) and every handler writes **state, not deltas**, which is why no processed-event
  table exists. The first delta-applying handler needs one.
- **Stripe's word, not the user's.** The `drivers.stripe_*` columns and every
  `rider_payment_profiles` column sit outside the `authenticated` `UPDATE` grant. Onboarding links
  and SetupIntent secrets are single-use — one per attempt, never cached.
- Deleting the two temporary `types.ts` bridges is a live follow-up — `supabase/CLAUDE.md` has the detail.

## Maps

**The browser may name two places. Only the server may measure the trip between them.** (ADR-0010)
`measureRoute()` in `src/lib/maps/server.ts` is the only function allowed to produce the
`distanceMeters`/`durationSeconds` that reach `quoteFare()`; it carries `import "server-only"`, so
importing it from a client component is a build error. A client-supplied distance or duration is
never an input to a price; a client-supplied *coordinate pair* is fine. Place search (`browser.ts`)
runs client-side on the public token, because search isn't money.

- **Two tokens, never one:** `NEXT_PUBLIC_MAPBOX_TOKEN` (`pk.`) and `MAPBOX_SECRET_TOKEN` (`sk.`, never `NEXT_PUBLIC_`) — Mapbox restricts by `Referer`, a server fetch sends none.
- **Never trust `response.ok`, never round at a call site.** Mapbox reports routing failures with
  HTTP 200 (`code: "NoRoute"`) and returns floats `quoteFare` throws on; `parseDirectionsBody` handles both, once, tested.
- `map.ts` is **the only file importing `mapbox-gl`** (rule 7) and returns an opaque
  `RideMapHandle`, never a Mapbox `Map`, so no caller can depend on a vendor detail. Its
  `--color-midnight` read off `:root` is the one documented exception to "never a hex in a
  component". `RideMap.tsx` is the only Client Component allowed to reach it.
- **Search Box results are display-only** — never stored at any price. The storable path
  (`geocode.ts`, Geocoding v6, `permanent=true`, via `resolveStorableCoordinates()`) is built and
  **switched off**: the pilot stores addresses and defers coordinates to a backfill.
- `rides.distance_meters`/`duration_seconds` are the **actual** trip, never the routed estimate;
  fare is never recomputed from either. `duration_seconds` is trigger-derived from `completed_at −
  started_at`; `distance_meters` needs a GPS trace. (ADR-0011, ADR-0014)
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
