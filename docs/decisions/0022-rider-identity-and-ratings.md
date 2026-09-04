# ADR-0022 — Rider identity, cross-party visibility, and ratings

**Status:** Accepted
**Date:** 2026-09-04

## Context

`rides.rider_id` references `auth.users` directly, and nothing in the app reads `auth.users`. All
thirteen RLS policies in the schema are `_select_own`; there is no cross-party visibility anywhere
in RIDO. Concretely: a driver is told to drive to an address and collect somebody — `getDriverActiveRide`
selects no rider-identifying column at all. A rider's sheet renders the literal string "Your driver
is on the way" — `getActiveRide` doesn't even select `driver_id`. `brand/design-system.md`'s rider
blueprint names a driver card at the `matched` state; it has never been buildable. `rate`, the last
unbuilt state in that blueprint, has nowhere to write a rating and nobody to attach one to.

This surfaced from a signup bug (email templates never pointed at `/auth/confirm` — fixed
separately, dashboard config) that exposed the real gap underneath it: **RIDO never asks anyone
their name.** `/signup` passes no `options.data`, so even `auth.users.raw_user_meta_data` is empty.

A broader audit — every business doc, the roadmap's unbuilt-feature list, and the design system's
UI blueprints — turned up a long list of data RIDO doesn't collect that the business would use:
driver online-hours, cancellation reasons, quote/funnel data, per-transaction cost capture, Prop
22's engaged-time/engaged-mile inputs, a market dimension, GPS. This ADR designs the **whole**
target model so those additions have an agreed shape, but implements only the piece blocking a
real product gap today: **who are the two people in this ride, and can they rate each other.**

## Decision

### 1. Three tiers, one design, staged delivery

**Tier 1 — identity and ratings (this ADR implements it).** A rider profile, a safe public
projection of a driver, cross-party visibility scoped to a live ride, and two-directional ratings.

**Tier 2 — marketplace telemetry (designed here, built later).** No new PII, nothing that
conflicts with ADR-0011's Mapbox-storage restrictions:
- An append-only driver availability log. `drivers.accepting_rides` is a current-value boolean
  with no history — "hours online" is unanswerable, and so is which insurance period
  (`docs/compliance/ca-tnc.md`) applied at a given moment, since that doc defines the three
  periods entirely in terms of driver app-state over time.
- A quote/funnel log and ride cancellation reasons. Today a rider cancellation is indistinguishable
  from "no driver ever came" — `docs/business/market-viability.md` names "does rider liquidity
  show up" as the #2 thing to validate, and nothing answers it.
- A `market` column. The flat fee is documented as "a state per driver/market"
  (`docs/business/monetization.md`) but only `fare_rate_cards` carries one today.
- `arrived_at` on `rides` — free, RIDO's own clock, and the blueprint's `arrived` state needs it.
- Per-transaction cost capture (Stripe fees, Mapbox calls) so the platform-level cost lines the
  pilot model treats as sliders become measurable instead of assumed.

**Tier 3 — compliance and Prop 22 data (designed here, partly blocked).**
- Engaged time is recoverable **today** and isn't recorded: Prop 22's window is
  `completed_at − accepted_at`; the stored `duration_seconds` is `completed_at − started_at` — the
  column comment in `20260828120000_add_ride_addresses.sql` already says so.
- Engaged miles do not exist and are genuinely blocked on the driver app (ADR-0011 §3). Worth
  restating precisely because it's easy to over-read ADR-0011 as "no location data, ever": that ADR
  restricts *Mapbox-derived* coordinates under Mapbox's terms. **RIDO's own GPS trace is
  unencumbered** — the restriction was never about location data in general.
- The statutory rates (`hourlyFloorCents`, `perEngagedMileCents`) have no table. They're a literal
  in `scripts/calibrate-fares.ts` and prose in `docs/business/fare-pricing.md` — two copies, no
  effective-dating — despite `packages/pricing/src/earnings-floor.ts`'s own header saying they
  "will change, and that should never mean editing this file." They want a seeded, effective-dated
  table shaped like `commission_tiers`.
- Two-week period bucketing (only monthly exists) and a shortfall/top-up ledger (the seam exists —
  `driver_payouts.ride_id` is nullable for exactly this, ADR-0015 §2 — nothing writes it).
- Driver vetting detail `/drivers` already promises: insurance carrier/policy, licence number, DOB,
  VIN, odometer (the 50k-mile inspection rule), driving-hours accumulation (the 10-hour cap).

None of tiers 2 or 3 is built here. They're recorded so the next PR that touches this territory
inherits a decided shape instead of re-deriving one.

### 2. A public-profile table, not policy access to `drivers`

`drivers` holds `stripe_account_id`, `stripe_payouts_enabled`, `background_check_status`,
`dmv_check_status`. **Postgres RLS is row-level — it cannot restrict columns on SELECT.** Any
policy letting a rider read their driver's row leaks all of it, permanently, the day someone adds a
column to `drivers` without re-auditing every policy that touches the table. A separate table is
the only option safe *by construction*.

This is not a duplicated fact, because the facts genuinely differ in lifecycle:

| Fact | Home | Lifecycle |
|---|---|---|
| Legal name, vetted vehicle, compliance state | `drivers` | Immutable vetting record |
| Display name, vehicle as shown, rating | `driver_public_profiles` | Current presentation |

`driver_public_profiles` is a trigger-maintained projection of `drivers` + `ride_ratings` — the
same pattern `driver_monthly_stats` already is for `rides`: one source of truth, one safe read.

### 3. `rider_profiles`, mirroring `rider_payment_profiles` exactly

Same key shape (`rider_id references auth.users on delete cascade`), same cascade reasoning, same
`select_own` policy shape, same `set_updated_at()` trigger. `display_name` is **nullable** — no
existing account has a name and there's nothing to backfill it from. A null renders as "Your
rider"/"Your driver" in the UI, never a blank, the same discipline root `CLAUDE.md` already applies
to money: don't render a value you can't source.

Created lazily, not by a trigger on `auth.users`. **No migration in this repo touches the `auth`
schema** — no `handle_new_user`, no `alter table auth.*`. The stance is already written down in
`20260902120000_create_rider_payment_profiles.sql`: "auth.users belongs to Supabase, not to us."
`ensureRiderProfile()` follows `startCardSetup()`'s precedent of lazy creation on first real need.

### 4. Cross-party visibility, scoped to a live ride, via `exists`

```sql
create policy rider_profiles_select_as_active_driver
  on rider_profiles for select
  to authenticated
  using (
    exists (
      select 1 from rides r
      join drivers d on d.id = r.driver_id
      where r.rider_id = rider_profiles.rider_id
        and d.auth_user_id = (select auth.uid())
        and r.status in ('accepted', 'in_progress')
    )
  );
```

`driver_public_profiles_select_as_active_rider` mirrors it. **`exists`, never `IN (subquery)`.**
`20260830120000_enable_driver_accept.sql`'s header documents the trap this avoids: a nullable
`driver_id` compared with `IN (subquery)` evaluates to NULL under three-valued logic, and RLS
treats anything that isn't TRUE as a refusal — the exact bug that once made every open request
invisible. `exists` returns a real boolean over an empty set regardless of nullability.

Visibility is bounded to `'accepted'`/`'in_progress'` — the same two statuses
`rides_one_active_per_driver` covers. It ends the moment a ride completes or cancels. There is no
persisted "who has ridden with whom" record; a completed ride's rating is the only trace that
remains, and it identifies people by uuid, not by rendering a name back.

### 5. Ratings write through the service role, like every other write on `rides`

`ride_ratings` gets no INSERT grant to `authenticated` — consistent with every write in this repo
except the two narrow column grants ADR-0019 carved out (`drivers.accepting_rides`,
`rider_profiles`'s own display fields). A trigger enforces the ride is `'completed'` before a
rating can attach to it (a CHECK can't reach across tables); a second trigger maintains the ratee's
aggregate the same way `bump_monthly_stats` maintains `driver_monthly_stats`.

### 6. Privacy posture — named now because tier 1 is what makes it urgent

The repo has **no stated position** on PII, retention, or deletion anywhere. The only
data-minimisation reasoning that exists is the PCI note on card details in `data-model.md`, never
generalised into a rule. Adding names is the moment this stops being theoretical:

- `rides.rider_id` and `ride_charges.rider_id` are `on delete restrict`. **A rider account cannot
  be deleted while any ride exists.** A CCPA deletion request has no answer today, and adding a
  name to the account makes that a sharper problem than an anonymous uuid was.
- `apps/web/src/components/domain/MarketingFooter.tsx` renders "Privacy · Terms" as plain text with
  no routes behind either word.

**Decision:** ship tier 1 anyway. `rider_profiles.display_name` is the same class of fact
`drivers.full_name` already is, and that column has existed since the first migration with the
same `on delete cascade`/`restrict` asymmetry already in place. This ADR does not resolve the
deletion gap — it names it, the way ADR-0015 named the Prop 22 top-up as a seam nothing writes to
yet, so it's a tracked debt rather than a silent one. A real privacy policy, a `/privacy` route, and
a resolution to the deletion-vs-restrict conflict are out of scope here and owed to a future ADR.

## Consequences

- A driver sees who they're picking up; a rider sees who's coming, in what car. The last unbuilt
  rider-blueprint state (`rate`) is now buildable.
- `Avatar` (`apps/web/src/components/ui/Avatar.tsx`), built for a person-card and used only in marketing
  testimonials until now, gets its first real consumer.
- Two new cross-party RLS policies exist in a schema that had none — the first departure from
  "every policy is `_select_own`" apart from the open-pool board (ADR-0013), which is a different
  shape (many-to-one visibility, not paired).
- **No change to `drivers`.** The vetting record is untouched; the profile is additive and derived.
- Tiers 2 and 3 are unbuilt. The next PR that wants driver-hours, cancellation reasons, or Prop 22
  compliance data has a decided shape to build against rather than a blank page.
- The deletion-vs-restrict conflict and the absence of a privacy policy are now a named, tracked
  gap rather than an undiscovered one.

## Supersedes

Nothing.
