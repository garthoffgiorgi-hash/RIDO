# RIDO — Build Roadmap

*The one doc that describes **current repo state**. Everything else here describes intent; this
describes fact. **If it disagrees with the filesystem, the filesystem wins — fix this file in the
same commit that proves it wrong.***

**Last verified: 2026-09-02** (branch `claude/intelligent-fermat-2xkydc`)

## TL;DR

**The money loop — both directions — is built, live, and verified against real Stripe test keys.**
`requested → accepted → in_progress → completed` runs end to end (a rider books at `/request`, a
driver accepts, starts and completes at `/drive`, which calls the `complete-ride` Edge Function),
and completion **records a debt and pays it**: a `driver_payouts` ledger row written by trigger
inside the completion transaction, then a Stripe Connect transfer to the driver's own connected
account (ADR-0015). A rider saves a card, booking places a buffered hold on it, and completing the
ride captures the fare *before* transferring the driver's cut — which is what funds the platform
balance every transfer draws on (ADR-0017). A late cancellation captures a fee from that same hold
and pays it to the driver in full (ADR-0018).

**Proved end to end by a human against real Stripe test keys**, not just locally: a saved card, a
buffered hold, a 3DS challenge resolved inline, a declined card canceling the ride cleanly, a
captured fare followed by a real driver transfer, and a captured cancellation fee followed by its
own real transfer. Manual verification surfaced and fixed three real gaps along the way — a
`PaymentIntent` left to the Dashboard's payment-method config instead of pinned to card, a 3DS
authorization with no path back to `authorized` once the webhook wasn't handling
`payment_intent.amount_capturable_updated`, and a cancellation-fee payout that was recorded but had
no caller that would ever actually send it. All three are fixed and shipped; none needed a new ADR
— each was a gap in implementing an already-decided design, not a new decision.

Still missing: dispatch/proximity, realtime on the driver's *open pool* (both live-ride surfaces are
realtime as of ADR-0020; the board is a whole-table subscription deferred there on purpose), and
cash rides — deliberately deferred, because cash inverts the flow into a driver-owes-RIDO debt that
needs its own design.

## What exists (verified, not assumed)

| Area | State |
|---|---|
| Repo structure | Scoped `CLAUDE.md` per domain, ADRs, canonical-source map (`docs/README.md`) |
| Drift guard | `scripts/check-context.mjs` — reference resolution, size budgets, ADR citations, pricing-literal leakage |
| CI | `.github/workflows/ci.yml` — drift check, seed-vs-generated-tiers check, Biome, `packages/pricing` under **both** Node and Deno, the Edge Function under both, plus `apps/web` and `tools/pilot-model` lib tests. Green. |
| `apps/web` | Next.js 16 / React 19 / TS 6.0.3 / Tailwind v4. Builds and serves. Brand tokens in `src/app/globals.css` `@theme`. |
| Marketing pages | `/`, `/drivers`, `/about` — **real UI**, built from `brand/exports/2026-08-07-landing-pages-v1.md` |
| `/login`, `/signup` | **Working** — password, email link, or phone SMS code. Verified end to end against a real Supabase project (sign-up → email → `/account`). |
| `/account` | **Role-aware.** Shows a rider card to everyone, a **payment card** (brand/last4/expiry, add or replace), and a driver card (compliance status included) to anyone with a `drivers` row. No `role` column — verified against real RLS that a rider-only user reads zero `drivers` rows and a dual-role user reads only their own. |
| `/request` | **Built, rider side, full lifecycle.** Map-first, a bottom sheet with a real `quoteRideRequest()`/`requestRide()`/`cancelRide()` write path — `src/lib/rides/`, auth-gated, unlinked from anywhere. Shows "Your driver is on the way" once accepted, "You're on your way" once in progress, and a dismissable trip-complete summary once the ride finishes (`getRecentlyCompletedRide()`). **A card is collected inline on a first ride** and a hold is placed at booking, with the hold disclosed rather than discovered. Cancel now renders at every live status — free before a driver accepts and for 30s after, then a fee, confirmed by name and amount first (ADR-0018). **Realtime** — accept, start, completion and an external cancellation all land without a reload, over a Supabase `postgres_changes` subscription whose payload is deliberately discarded in favour of refetching through the existing server read (ADR-0020). ADR-0012, ADR-0014, ADR-0017, ADR-0020, `architecture/ride-booking.md`. |
| `/drive` | **Built, driver side, full lifecycle, and now paid.** The compliance-status card, a **payout card** (`PayoutCard` — Connect onboarding CTA, or paid-to-date plus anything pending or failed with a retry), plus either the open-request dispatch board (`listOpenRequests()`/`acceptRide()`, `RideCard`, "you keep $X (Y%)" computed live via `commissionForRide`) or the driver's own current ride (`getDriverActiveRide()`, `CurrentRidePanel`) with **Start trip** and **Complete ride**, the latter calling the deployed `complete-ride` Edge Function and then chaining a best-effort `payoutRide()`. `rides_one_active_per_driver` makes the two views mutually exclusive. Accept and start are both one race-proof conditional `UPDATE`, not a lock — ADR-0013, ADR-0014, ADR-0015. **The driver controls their own queue (ADR-0019):** an Online/Offline toggle above both panels (`AvailabilityToggle`, writing `drivers.accepting_rides` through the column grant, not the service role) and a per-driver Decline on each request, which hides it from that driver permanently while leaving it in the pool for everyone else. Offline blocks accepting without hiding the board, and never blocks finishing a ride already accepted. The **current-ride card is realtime** (ADR-0020), so a rider cancelling mid-ride says so on the driver's screen unprompted; the open-pool board is not, and still refreshes only on reload, an accept attempt, or a toggle. No MTD tier-progress visualization. `architecture/ride-booking.md`, `architecture/ride-completion.md`, `architecture/payouts.md`. |
| Maps | **Built end to end.** `apps/web/src/lib/maps/` — `measureRoute()` (server-only, secret token) turns two coordinates into the integer distance and duration `quoteFare()` needs; `searchPlaces()`/`describePlaceAt()` (browser, public token) turn typed text into coordinates; `map.ts` renders a map (`mapbox-gl`, the only file importing it, dynamically loaded) via an opaque `RideMapHandle` — no vendor type crosses into `RideMap.tsx`. `/dev/maps` (auth-gated, 404s outside development) proves search → measure → quote → render against a real Mapbox account. `geocode.ts` (Geocoding v6, always `permanent=true`) is the storable-coordinate path, **built and switched off** — ADR-0011 defers permanent geocoding for the pilot. Pure request-building, response-parsing, and map geometry are tested (77 tests). ADR-0010, ADR-0011, `architecture/maps.md`. |
| UI primitives | `src/components/ui/` — `Button`, `Card`, `Input`, `Badge`, `Avatar`, `FareChip`. Domain: `MarketingNav`, `MarketingFooter`, `Wordmark`. |
| Marketing figures | `apps/web/src/lib/marketing/figures.ts` — every commission figure **derived** from the seeded tiers via `@rido/pricing` at build time. `mock-data.ts` keeps only illustrative copy |
| `tools/pilot-model` | **Runnable** (`npm run model`) — Vite + React + recharts workspace. Integer cents throughout, calls `@rido/pricing`; 24 tests on `../tools/pilot-model/src/model.ts`. Full monthly P&L now — driver *and* rider acquisition cost, Mapbox and card-processing as sliders (not constants), an adjustable horizon, one-click CSV export |
| Icons | `lucide-react`, per the design system's documented substitution |
| `packages/pricing` | **Implemented and tested.** Fare quoting (`quoteFare`) and the Prop 22 floor alongside the commission math. Bracketed commission, tier validation, flat-fee resolution. 95 tests passing identically under **both** Node and Deno. Exact integer arithmetic throughout — no floating-point value anywhere in the path. Reproduces all three figures the docs published by hand ($200.12 at $1,001; $488/$3,112/13.56% at $3,600). |
| Brand | `design-system.md`, `brand-guide.md`, two Design export bundles with handoff notes |
| Supabase | **Project live, schema applied to it.** Twenty-two migrations (`drivers`, `subscriptions`, `rides`, `driver_monthly_stats`, `commission_tiers`, PostGIS + ride geography, plus the `rido_year_month`/`reserve_driver_month`/`bump_monthly_stats`/`apply_ride_commission`/`active_commission_tiers`/`driver_month_to_date` functions, plus `fare_rate_cards`, `active_fare_rate_card`, the `rides` address columns, `driver_id` nullable + `rides_one_active_per_rider` + `canceled_at`, the driver-accept policy + `rides_open_requests_idx` + `rides_one_active_per_driver`, `rides_started_at_present_iff_in_progress` + the `set_ride_duration` trigger, `driver_payouts` + the `queue_driver_payout` trigger + the two `drivers.stripe_*` state columns, `claim_driver_payout_attempt`/`release_driver_payout_attempt` + the three `driver_payouts` attempt-claim columns, `rider_payment_profiles`, the `ride_charges` ledger + its own attempt claim, `rides.rider_total_cents`, the three `fare_rate_cards` payment columns + `queue_cancellation_payout`, and — new — `drivers.accepting_rides` joining the column-level UPDATE grant, plus the `ride_declines` table), RLS on every table, eighteen pgTAP files plus four standalone concurrency proofs — all green against a real Postgres. `commission_tiers` seeded. **All migrations are applied to the live project, and `database.types.ts` has been regenerated against them.** `apps/web/src/lib/payouts/types.ts` and `apps/web/src/lib/payments/types.ts` were documented temporary hand-written bridges pending exactly that regeneration — deleting them (and switching their callers to `@/types/database.types`) is now a live, actionable follow-up rather than a future one. |
| `complete-ride` | **Built, tested, and finally called.** `supabase/functions/complete-ride/` — pure `core.ts` (authorization + rating, 19 tests under **both** Node and Deno), `db.ts` (the only SDK importer), `index.ts` (HTTP, bounded compare-and-swap retry). Deployed since ADR-0008; as of ADR-0014, `apps/web/src/lib/rides/server.ts`'s `completeRide()` is the app's first-ever call to a deployed Edge Function, forwarding the signed-in driver's own token so `authorizeCompletion` stays the real gate. |
| Rider charging | **Built, closes the loop, and verified live.** `apps/web/src/lib/payments/` is the domain (`getPaymentProfile`, `startCardSetup`, `recordCardFromSetup`, `authorizeRideCharge`, `captureRideCharge`, `chargeCancellationFee`, `voidRideCharge`), `browser.ts` the only file importing `@stripe/stripe-js` — mounting Stripe Elements per `map.ts`'s opaque-handle precedent, no React bindings, **the card number never reaches RIDO**. Booking places a hold (`holdAmountCents`, buffered by `authorization_buffer_bps`), completion captures the fare *before* the driver transfer, and a late cancel captures a fee that goes to the driver whole. The `ride_charges` ledger mirrors `driver_payouts` down to ADR-0016's attempt claim — applied from the start this time. **No money math in it:** the hold comes from `@rido/pricing`, the capture from a stored column. **Proved end to end against real Stripe test keys**: a saved card, a buffered hold, a 3DS challenge, a decline canceling the ride cleanly, a captured fare, and a captured cancellation fee — the last two each followed by a real driver transfer. ADR-0017, ADR-0018, `architecture/rider-charging.md`. |
| Stripe / payouts | **Built, funded by rider charging, and verified live.** `apps/web/src/lib/stripe/` is the vendor boundary — `server.ts` is the only file in the repo importing `stripe` (pinned API version, per-call client), with pure tested `account-status.ts` and `errors.ts` beside it (20+ tests, including the card-decline family ADR-0017 added). `apps/web/src/lib/payouts/` is the domain: Connect Express onboarding, `payoutRide()`, `retryPayout()`, `settlePendingPayoutsForDriver()`, and the `/drive` summary — `cancelRide()` now also calls `payoutRide()` itself after a captured cancellation fee, a real gap found and fixed during this pass (nothing else was ever going to send that payout). `apps/web/src/app/api/stripe/webhook/route.ts` is the repo's first `api/` route — raw-body signature verification, now handling `account.updated`, `payment_intent.amount_capturable_updated` (the 3DS-authorization reconciliation ADR-0017 anticipated but didn't originally implement), `payment_intent.succeeded`, `payment_intent.payment_failed`, and `payment_intent.canceled` — excluded from the `proxy.ts` matcher. **No money math anywhere in it:** the transferred amount is a copy of the ride's snapshotted `driver_payout_cents`, so `packages/pricing` is untouched. **Proved end to end against real Stripe test keys**: a completed ride's captured fare funding a real driver transfer, and a captured cancellation fee doing the same. Since ADR-0016 a retry of a failed row can also actually succeed once the balance is funded, rather than Stripe replaying its first cached failure for 24 hours — and a captured charge still funds Stripe's *pending* balance first, with the same settlement delay as live mode, so a payout genuinely stuck on `balance_insufficient` right after a ride resolves on its own once that clears. ADR-0015, ADR-0016, `architecture/payouts.md`. |
| Fare pricing | **Built.** `quoteFare` + a per-market `fare_rate_cards` table, seeded for San Diego and calibrated to sit ~15% under a modelled UberX fare. `npm run calibrate` prints the report; `npm run check:calibration` fails in CI if the discount drifts or a driver would earn less than on an incumbent. ADR-0009. |
| Prop 22 floor | `packages/pricing/src/earnings-floor.ts` — per-trip diagnostic plus the two-week aggregate the statute actually uses. Nothing enforces it yet; there is no payout run to enforce it in. |
| Ride spatial-temporal data | PostGIS enabled; `rides` carries generated `pickup_geog`/`dropoff_geog` (GiST-indexed), four lifecycle timestamps, `distance_meters`, `duration_seconds`, `pickup_address`/`dropoff_address`, and partial indexes on completed rides. **ADR-0011 decides what each holds:** the timestamps are RIDO's own clock and carry no vendor restriction (the temporal half of a demand heatmap, free from the first ride); the addresses are stored and the coordinates deferred to a backfill; `distance_meters`/`duration_seconds` are the *actual* trip, never the routed estimate. `requested_at`/`accepted_at`/`started_at`/`completed_at` are all written now, through the real lifecycle; `duration_seconds` is derived by trigger on completion when `started_at` exists. `distance_meters` and the pickup/dropoff coordinates still write nothing — both need a GPS trace or permanent geocoding, neither of which exists yet. |

## What does not exist

**Cash rides** — the one payment path deliberately not built. Cash inverts the money flow: the
driver physically holds the fare, so commission becomes a debt *they* owe RIDO, with its own
collection mechanism and its own answer for a driver who never settles. That is a design, not a
flag (ADR-0017's out-of-scope).

Also missing: **flat-fee subscription billing** (`subscriptions` is still a table nothing writes —
deliberate, ADR-0003 puts the fee at $0 for the whole pilot) · refunds, reversals, disputes, and
instant payouts · a sweep for stuck `authorized` charges or expired holds · repricing a fare from
actual distance/duration at completion (which is what would make `authorization_buffer_bps`
load-bearing rather than the forward headroom it is today) · tips · multiple saved cards ·
dispatch/proximity matching (every open request is visible to every active driver — correct at pilot
volume, `pickup_geog` is null on every row regardless, ADR-0011) · realtime on the driver's open
pool (the two single-row live-ride surfaces have it; the board's whole-table subscription is
deferred in ADR-0020) · a driver's live location on the rider's map (no GPS trace exists —
ADR-0011) · push notifications · driver app · MTD tier-progress visualization · un-declining a
request, and declines expiring (ADR-0019 makes both trivially addable and neither is built).

`complete-ride` is **deployed** to the live project (`supabase functions deploy complete-ride
--project-ref <ref> --use-api`) and has now been called by the app end to end, locally verified —
the two migrations that let `/drive` reach it and get paid for it (`in_progress`/`started_at`, then
`driver_payouts`) are still only applied locally, not yet pushed. Deploying the function originally surfaced a real gap: `functions deploy`
needs a `[functions.complete-ride]` entry in `supabase/config.toml` to resolve `@rido/pricing`,
which `deno check`/`deno test` don't need because CI passes `--config` explicitly. Fixed and
documented in `supabase/CLAUDE.md` and ADR-0005 so the next function doesn't rediscover it.

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
✅ **Five tables as migrations** — `drivers`, `subscriptions`, `rides`, `driver_monthly_stats`,
`commission_tiers` (no `riders` table — `rides.rider_id` references `auth.users` directly).
Verified against a real local Postgres: every constraint, trigger, and RLS policy exercised and
passing (`supabase/tests/`, `pg_prove` green), including a standalone proof that the
month-to-date lock actually blocks a concurrent completion rather than racing.
✅ **Pushed to the live project** and **`database.types.ts` regenerated** against the real schema —
all five tables typed, so the Supabase clients' generics are load-bearing rather than decorative.
✅ `commission_tiers` seeded on the live project (three bands).
✅ **Rider/driver distinction** — no `role` column: a driver identity is a matching `drivers` row,
read via `getOwnDriverProfile()` (`apps/web/src/lib/drivers/`). A person can be both at once.
`/account` shows a rider card to everyone and a driver card (with live compliance status) to
anyone with a row; `(driver)/drive` is auth-gated the same way `/account` is and now has real
functionality of its own (the open-request board). Post-login redirect still always lands on
`/account` — deliberately not split yet. Both `/request` and `/drive` have real functionality now,
but landing a rider straight into a live map, or a driver straight into a dispatch board, on every
sign-in isn't obviously right either. Revisit once both sides have opinions worth having.

**Phase 2 — money spine.** ✅ **`packages/pricing` implemented and tested** — bracketed commission
with boundary tests at every tier edge (`$0`, `$999.99`, `$1,000.00`, `$1,000.01`, `$2,999.99`,
`$3,000.00`, `$3,000.01`), spanning rides, monotonicity, and exact `commission + payout === fare`.
The suite is split so a repricing breaks only `commission.seed.test.ts` — see
`business/changing-rates.md`.
✅ `bump_monthly_stats` trigger and `reserve_driver_month` locking (DB side, verified).
✅ **The `complete-ride` Edge Function** — reads the active tiers and the driver's month-to-date
position, rates with `@rido/pricing`, and hands the result to `apply_ride_commission`, which locks,
re-checks that position and writes. The "one held-open transaction" the design called for turned
out to be unbuildable from supabase-js, so the transaction moved into SQL and correctness comes
from compare-and-swap instead (**ADR-0008**). Proved by a two-connection race
(`concurrent-completion.sh`): the lock blocks a second completion rather than letting it read a
stale month-to-date figure. The original two-*ride* race
(`concurrent-apply-ride-commission.sh`, one `applied`/one `conflict`) is retired — its setup is now
illegal under `rides_one_active_per_driver` (ADR-0013 made two of one driver's rides mutually
exclusive, so they can no longer be racing toward completion at all). Full account: ADR-0014.
✅ **Deployed** to the live project, and **actually called by the app.** Driver accept
(ADR-0013) gave `complete-ride` a real path to an `'accepted'` row; ADR-0014's `startTrip()`/
`completeRide()` walk a ride the rest of the way. ✅ **Exercised against the live project** — a real
driver account, a booked ride, an accept, a start, and a completion call against the deployed
function, all verified live (real commission snapshot, real `driver_monthly_stats` row).
✅ **Ride pricing** — `quoteFare`, the `fare_rate_cards` table, and a calibration check in CI
(ADR-0009, `business/fare-pricing.md`). Two findings recorded there rather than discovered later: a
RIDO driver beats an incumbent driver on every trip shape tested even at our worst commission band,
and there is a **low-volume dead zone** once the flat fee turns on — break-even runs from 20 to 94
trips/month across the 35–50% incumbent-take range, and vanishes entirely during the pilot.
⬜ Decide what to do about that dead zone. Needs market research, not code.
⬜ A `quote-ride` Edge Function. **No longer blocked on Mapbox** — `measureRoute()` supplies
distance and duration, and `apps/web/src/lib/maps/route.ts` is Next-free with `.ts`-extensioned
imports so Deno can import it directly. Blocked only on the booking flow now: nothing asks for a
quote.
✅ **The marketing percentage is derived**, not hand-maintained: `supabase/seed/commission_tiers.sql`
→ `scripts/generate-published-tiers.mjs` → `apps/web/src/lib/marketing/figures.ts` →
`commissionForRide`. Verified by repricing the seed and watching every page figure move, including
the CSS bar widths. CI fails if the generated file drifts from the seed. The two hardcoded tier
sentences in `(marketing)/drivers/page.tsx` and the "Drivers keep 87%" in `../brand/` are gone.
✅ **Stripe — both halves, verified live.** Connect Express onboarding, the `driver_payouts` ledger
written by trigger inside the completion transaction, one transfer per completed ride keyed on
`<payout id>_<attempt>`, a signature-verified webhook, and `/drive`'s payout card (**ADR-0015**).
The design's load-bearing property is that it adds *no money math*: the amount transferred is a
copy of the ride's write-once `driver_payout_cents`, so the one thing that could corrupt the
accounting record — a second opinion about what a driver is owed — does not exist in the payout
path. ADR-0015 also **answers the first of the three open questions**: RIDO absorbs card
processing, so a driver receives exactly the figure shown before they accepted.
✅ **A retry actually retries (ADR-0016).** Found during manual verification: a payout id alone as
the idempotency key made Stripe replay a payout's *first* cached response for up to 24 hours, so a
`balance_insufficient` row — the expected production state — could never be retried no matter how
much the platform balance changed. `claim_driver_payout_attempt` now supplies a fresh attempt
number per genuine attempt, proved race-safe by `concurrent-payout-claim.sh`.
✅ **Rider charging — the inbound half, built and verified live (ADR-0017, ADR-0018).** A saved
card, a buffered hold at booking, a fare captured before the driver transfer, and a cancellation
fee captured and paid to the driver whole. Manual verification against real test keys surfaced and
fixed three real gaps, none requiring a new ADR since each was an incomplete implementation of an
already-decided design rather than a new decision: a `PaymentIntent` left to the Stripe Dashboard's
payment-method configuration instead of pinned to `["card"]`; a 3DS-authorized charge stuck at
`authorizing` forever because nothing handled `payment_intent.amount_capturable_updated`; and a
captured cancellation fee whose `driver_payouts` row was recorded but never actually sent, since
`cancelRide()` had no equivalent of `completeRide()`'s post-completion `payoutRide()` call.
⬜ Flat-fee subscription billing — not blocked, just not yet due (ADR-0003: $0 all pilot).
✅ **`gradComm()` is retired.** `tools/pilot-model` is a real workspace (`npm run model`) that
calls `@rido/pricing` instead of re-implementing bracketed commission in floating-point dollars.
The flat fee now turns on at a driver-count threshold — the traction signal ADR-0003 describes —
rather than at a month index. Its arithmetic moved to `../tools/pilot-model/src/model.ts` with 24 tests, and fixing a
display bug on the way: "Driver take-home" was showing RIDO's revenue per driver.

**Phase 3 — surfaces.** ✅ Marketing pages. ✅ The fare a rider is quoted is computable
(`quoteFare` + the seeded card), measurable (`measureRoute` + Mapbox Directions), and renderable
and provable end to end at `/dev/maps`. ✅ **Mapbox** — the vendor boundary, the rendering
(`map.ts`, `RideMap.tsx`), and a proving page are all built and tested against a real account.
✅ **Rider request flow** — `/request` books a real `rides` row through `src/lib/rides/`
(ADR-0012): naming, a server-side quote, price-changed re-confirmation, and a cancelable
'requested' state, behind a new `Sheet` primitive nothing in this repo had built; now shows
"Your driver is on the way" once accepted, "You're on your way" once in progress, and a
trip-complete summary once finished. ✅ **Driver accept** — `/drive` lists the open pool with
"you keep $X (Y%)" per request and a race-proof one-row `UPDATE` to take one (ADR-0013), closing
`matched` in the rider blueprint. ✅ **Ride completion** — `/drive`'s `CurrentRidePanel` carries a
driver's own ride through `'in_progress'` to `'completed'`, making the app's first-ever call to
`complete-ride` (ADR-0014), closing `en route`/`in trip` in the rider blueprint. ✅ **Driver
payouts** — `/drive`'s `PayoutCard` links a bank through Stripe-hosted Express onboarding and shows
what the ledger says is paid, pending, or failed (ADR-0015). ✅ **The driver controls their own
queue** — an Online/Offline toggle and a per-driver Decline, with availability gating new work only
and never a ride already accepted (ADR-0019). ⬜ Dispatch/proximity matching. ⬜ Rest of the driver
view (MTD tier-progress visualization). ⬜ `rate`, the blueprint's last state. ⬜ The rider's payment surface — nothing on
`/request` collects a card, which is the same gap Phase 2's inbound half names.

**Phase 4 — compliance gates.** ✅ Driver activation gated on background check + vehicle
inspection, enforced in the database (a `CHECK` constraint plus RLS) **and now in the app** —
`complete-ride`'s `authorizeCompletion` refuses any driver who isn't `status = 'active'`, which
inherits the constraint's terms rather than restating them. ⬜ CPUC fee and airport surcharges as
first-class line items — no schema exists for either.

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

Question 3 — who absorbs Stripe's ~2.9% + $0.30 — is **answered**: RIDO does, so a driver receives
exactly the `driver_payout_cents` they were shown (ADR-0015). Pilot-scoped the way ADR-0003 scopes
the flat fee; whether it survives at steady-state volume is a live business question, not a blocker.

## Working conventions

- Two parallel tracks: backend (this repo's core) and frontend (marketing/app UI). Both merge to
  `main` via small PRs — keep branches short-lived; this file is the one both touch, so pull
  before pushing.
- Frontend work that needs a backend capability leaves `// TODO(backend):` at the call site **and**
  a bullet here. That's the handoff mechanism — `grep -rn "TODO(backend)" apps/web/` before
  starting Phase 2.
- Before Claude Design mocks a new surface, re-sync its repo connection. The 2026-08-07 bundle
  was generated from a pre-fix snapshot and carried a stale figure into the Rider page.
