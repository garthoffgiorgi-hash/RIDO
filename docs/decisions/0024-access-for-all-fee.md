# ADR-0024 — The CA accessibility fee is itemised to the rider, snapshotted, and never commissionable

**Status:** Accepted
**Date:** 2026-09-10

## Context

`roadmap.md`'s Phase 4 has carried one open checkbox — "CPUC fee and airport surcharges as
first-class line items — no schema exists for either" — since before any of the money loop was
built. Establishing what those fees actually are corrected the premise in three ways, and the
corrections are the reason this ADR exists at all rather than being a small feature.

1. **The 0.33% this repo has quoted since the first compliance pass was wrong at any date.** The
   CPUC user fee (PUCTRA) for charter-party carriers including TNCs is **0.1% of gross intrastate
   revenue**, plus a minimum $10/quarter or $25/year, reset annually by resolution.
2. **That fee is not per-ride.** It is assessed on aggregate quarterly revenue *with a minimum
   floor that dominates at pilot volume* — 0.1% does not exceed $10/quarter until quarterly gross
   passes $10,000. Modelling it as a per-ride line item would produce a number that is wrong in
   the direction of looking precise.
3. **The genuinely per-trip fee was absent from our docs entirely:** SB 1376's **Access for All**
   fee, **$0.10 on every completed TNC trip**, collected from the rider and remitted quarterly.

Figures and sources: `../compliance/ca-tnc.md`.

**The seam this fills was designed three ADRs ago and deliberately left empty.**
`packages/pricing/src/fare.ts` already carries `FareLineItem` and an empty `lineItems` array whose
own comment names "a CPUC surcharge" as the intended first case; ADR-0017 added
`rides.rider_total_cents` with `check (… >= fare_cents)` and recorded that the two would diverge
"when CPUC and airport pass-throughs land"; ADR-0009 already split "the commissionable fare" from
"pass-throughs" in what a quote means. This ADR is the landing, not a restructuring.

## Decision

**The rider pays the fee and sees it.** A quote renders the fare, a labelled `CA accessibility fee
(SB 1376)` row, and a total; the rider agrees to the total before booking.

**The fee is never commissionable, and that is a correctness property rather than a preference.**
`commissionForRide()` splits `fare_cents` alone and `rides_commission_sums_to_fare` binds
`fare_cents` alone. Folding the $0.10 into the fare instead would silently make a driver pay
commission on a tax and take part of the remittance out of their payout — the one failure mode
`FareLineItem`'s original comment was written to prevent.

### The amount lives on `fare_rate_cards`, per market

A new `access_for_all_fee_cents` column, seeded at `10`. `cancellation_fee_cents` is the same shape
— flat, per-trip, per-market, conditional on an outcome — and the card already owns effective
dating (`(market, effective_from)`, `active`, `active_fare_rate_card()`), so a rate change is a
seed change, exactly as a repricing is. Per-market is not a compromise here: SB 1376 attaches to
trips originating in California, and `market` is a sound proxy for that at a single-market pilot.

A dedicated `regulatory_fees` table would duplicate that effective-dating machinery, add a join to
the quote path, and need its own RLS, seed and pgTAP — for one row. **The revisit trigger is
specific:** the second per-trip regulatory fee whose scoping key is *not* `market` — a geofence,
like an airport — is what buys the table, because a column on the market's card cannot express it.

### The ride snapshots it, at request time

`rides.access_for_all_fee_cents`, `bigint not null default 0`, written by `requestRide()` alongside
`fare_cents` and `rider_total_cents`. Deriving it as `rider_total_cents - fare_cents` is correct
only while there is exactly one pass-through and becomes quietly wrong the day there are two.
`0` is a *true* historical fact for pre-existing rides — they were booked before the fee existed
and were not charged it — so the default needs no backfill.

**Because the snapshot is written at request time it exists on cancelled rides too**, where the
rider never actually paid it: a cancellation captures the cancellation fee alone and never the
rider total. So the fee is *owed* only on completed trips, and **every remittance query filters
`status = 'completed'`**. Summing the column without that filter overstates what RIDO owes. This is
stated on the column comment, because it is the mistake the schema cannot prevent.

### The constraint is `>=`, deliberately not `=`

```sql
check (rider_total_cents is null
       or rider_total_cents >= fare_cents + access_for_all_fee_cents)
```

Strict equality would encode "there is exactly one pass-through" into the schema and make the
airport surcharge a migration that drops and recreates this constraint — precisely the coupling the
empty `lineItems` array exists to avoid. The `>=` form is monotone in the number of pass-throughs,
needs no migration for the second one, and still catches the real bug: a fee snapshotted onto the
ride but left out of what the rider was charged.

### `quoteFare()` takes the fee as data and knows nothing about the CPUC

An optional `accessForAllFeeCents` on `FareQuoteInput` — **not** on `FareRateCard`, which
`apps/web/src/lib/fares/server.ts` already documents as staying "the four values that decide a price". A
pass-through does not decide a price. Zero or absent produces no line item at all, so a market
that owes nothing renders no row and `riderTotalCents === fareCents` remains true as the explicit
no-pass-through case.

### The rider's price guard now compares the total

ADR-0012's rule is that a rider is never charged a number they never saw. The number they see is
now the total, so `requestRide()` compares `riderTotalCents` rather than `fareCents`. Strictly
stronger: it also refuses a booking if the fee itself moved between quote and confirm.

### Live at $0.10 immediately — the pilot-waiver pattern deliberately does not apply

ADR-0003 sets the flat fee to $0 through the pilot because that fee is **RIDO's own revenue**, and
RIDO may choose to forgo its own money. The Access for All fee is not RIDO's to waive: it is
collected on behalf of a state fund. A $0 seed here would ship a code path nothing ever executes
and would misrepresent an obligation as a policy toggle.

### Explicitly not built

- **The PUCTRA 0.1% user fee.** Aggregate, quarterly, floor-dominated at pilot volume. It needs no
  schema at all — it is a report over `rides`, derivable when the first return is due. Its revenue
  base (full fare vs RIDO's commission) is an open question for counsel, recorded in
  `../compliance/ca-tnc.md`.
- **The airport surcharge.** Per-trip but geofenced, and `pickup_geog` is NULL on every row because
  ADR-0011 defers permanent geocoding for the pilot. It is not merely unbuilt; it is currently
  **undetectable**, and San Diego International's amount is unverified besides.

## Consequences

- `rider_total_cents` and `fare_cents` diverge for the first time. Every rider-facing amount must
  now be sourced deliberately: the booking sheet, the live ride and the trip-complete summary show
  the **total**; the driver's "you keep $X (Y%)" and payout still show and split the **fare**, and
  are arithmetically unchanged by this ADR.
- The Stripe hold and capture required **no change**. `holdAmountCents()` already took
  `riderTotalCents`, and `captureRideCharge()` already read `rider_total_cents` — both written that
  way by ADR-0017 in anticipation of exactly this.
- `check:calibration` must report the same discount as before, because the fee is not fare. If that
  number moves, the fee leaked into `fare_cents` — it is the sharpest tripwire on this change.
- RIDO now holds money it owes a third party, on a quarterly cycle, with no remittance workflow
  built. The obligation is recorded and the data is queryable; nothing pays it automatically.
- The offset SB 1376 allows — reducing what is owed by quarterly spending on wheelchair-accessible
  service — is not modelled. It reduces a remittance RIDO does not yet make.

## Supersedes

Nothing. Fills the seam ADR-0009 and ADR-0017 left open and extends ADR-0015's "no money math in
the payment path" to a pass-through: the fee is read from a seeded column and copied, never
computed from a rate at a call site.
