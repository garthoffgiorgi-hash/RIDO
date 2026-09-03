# ADR-0017 — Hold at request, capture at completion

**Date:** 2026-09-02
**Status:** Accepted

## Context

The outbound half of the money loop shipped in ADR-0015: a ride completes, snapshots its
commission, records a debt by trigger, and transfers the driver's cut through Stripe Connect.
**Nothing has ever taken money in.** `rides.fare_cents` was a price nobody paid — no PaymentIntent,
no saved card, no Stripe Customer, no rider-side Stripe at all.

That is not a missing feature so much as a missing half. `apps/web/src/lib/stripe/errors.ts` has a
first-class case for `balance_insufficient` and a file header explaining that it exists because
*every* production transfer returns it: RIDO's platform balance is empty, because nothing funds it.
The payout path works in test mode only because a test balance can be topped up by hand.

Four facts shaped what follows.

**`riderTotalCents` already existed, and was thrown away.** `quoteFare()` has returned
`{ fareCents, lineItems, riderTotalCents, breakdown }` since ADR-0009 — `fareCents` is the
*commissionable* subtotal, `riderTotalCents` is that plus non-commissionable pass-throughs.
`RideQuote` carried it to the client, `RequestPanel` rendered only `fareCents`, and `requestRide()`
discarded it at the insert. The seam for "what the rider is charged" was built and unused.

**The commission invariant is not in the way.** `rides_commission_sums_to_fare` binds
`commission_cents + driver_payout_cents = fare_cents`. Charging `rider_total_cents` leaves that
untouched, because a pass-through is money RIDO merely collects and remits — taking a cut of it
would be taking a cut of someone else's money. ADR-0015's Consequences predicted this column would
be needed and recorded its absence.

**The fare does not move between quote and completion.** `apply_ride_commission` reads
`v_ride.fare_cents` and never writes it; `complete-ride` reads it off the row. `distance_meters`
and `duration_seconds` are recorded but nothing prices from them. The quoted fare *is* the final
fare, today.

**A retry needs a changing idempotency key.** ADR-0016 established this the expensive way: a stable
key makes Stripe replay its first cached response — success or failure — for at least 24 hours, so
a retryable failure could never actually be retried.

## Decision

### 1. Authorize at request, capture at completion

Stripe manual capture (`capture_method: "manual"`). The hold is placed when the rider books and the
money is taken when the ride ends. A rider's funds are reserved for the trip they asked for and
taken only for the trip they got, and an uncaptured hold is released by Stripe on its own if a ride
never finishes.

### 2. Capture the quoted fare, and hold slightly more than it

The rider is charged exactly `rider_total_cents` — the number they agreed to, and the number the
driver's commission was computed against, so the two ledgers cannot disagree.

The hold is larger, by `fare_rate_cards.authorization_buffer_bps`, computed by `holdAmountCents()`
in `@rido/pricing`. **That buffer is unused headroom today**, since the fare does not move
(Context, fact 3) — the buffered portion is always released. It ships anyway because a hold cannot
be raised after the fact: the only way to hold more is to void and re-authorize, which is a fresh
card interaction with a rider whose ride has just ended. The day repricing-from-actuals lands, every
hold already in flight has to have been big enough, and by then it is far too late to widen them.

The buffer is a rate-card column rather than a constant for the reason every other fare value is:
tuning what RIDO holds on a rider's card must not be a deploy.

### 3. A saved card, confirmed on-session

Stripe Customer plus a saved PaymentMethod, collected through Stripe Elements — the card number
reaches Stripe's iframe and never this app. `off_session: false`: the rider is on screen, tapping
the button, so a 3DS challenge is a dialog they answer rather than a failure they discover later.
**This removes the entire class of off-session authentication failures from the booking path.**

Collected in two places, deliberately: `/account` manages the card, and the booking sheet collects
one inline on a rider's first ride. Bouncing a rider to `/account` mid-booking is where this funnel
would leak, and a rider who wants to change a card outside a booking needs somewhere to do it.

### 4. The ride row is written first, then authorized against

`ride_charges.ride_id`, the PaymentIntent's `transfer_group` and its metadata all take the ride id,
so the ride has to exist before the call that references it. It also matches ADR-0015's inversion:
the database records first, and the money moves after.

**If the authorization fails, the ride is canceled right back.** Leaving it `'requested'` would
occupy the rider's one active-ride slot (`rides_one_active_per_rider`) and lock them out of booking
anything at all — stuck behind a ride they never got.

`transfer_group` is what finally closes a circle ADR-0015 left open: `createTransfer` has set it to
the ride id since that PR, under a comment reading *"groups the transfer with the charge that funded
it, once rider charging exists"*.

### 5. Capture before payout

`completeRide()` → `captureRideCharge()` → `payoutRide()`, in that order, because the capture is
what puts real funds in the balance the transfer draws on. Running them the other way round
guarantees the `balance_insufficient` this whole feature exists to end.

**Neither may turn a completed ride into a failed one.** Both are best-effort in a `try`/`catch`,
exactly as ADR-0015 established for the payout alone: the ride is finished either way, the snapshot
is written either way, and the two ledgers remember what is outstanding.

### 6. A ledger, mirroring `driver_payouts`

`ride_charges` records what was held and what was taken, with the same discipline: `on delete
restrict` foreign keys, a `captured_iff_settled` CHECK so no code path records money as taken
without its receipt, a partial unique index permitting one live charge per ride while letting a
failed authorization be superseded by a new row, and ADR-0016's attempt-claim applied **from the
start** rather than retrofitted after an incident.

It has **no `kind` column**. A late cancellation captures part of the same hold, so whether a
captured row was a fare or a fee depends only on how the ride ended — and `rides.status` already
says that, in one place, without a second copy free to drift.

### 7. No processed-event table, and the reason still holds

The webhook gains `payment_intent.succeeded`, `payment_intent.payment_failed` and
`payment_intent.canceled`. Every one writes the intent's **current state** onto the charge row
rather than applying a delta — the same property `account.updated` has, so replaying them out of
order converges. The route's own warning is unviolated and left in place: the first handler that
applies a delta must add one.

## Consequences

- **This is what makes production payouts work.** `balance_insufficient` stops being the expected
  outcome and becomes a real signal.
- **`database.types.ts` was stale** against three migrations, and a narrow, documented bridge file
  stood in — the same stopgap ADR-0012 used and ADR-0014 deleted. **Since resolved:** the generated
  types carry `ride_charges`, `rider_payment_profiles` and the three `fare_rate_cards` payment
  columns; the bridge is deleted and `apps/web/src/lib/payments/server.ts` derives its row shapes
  from the generator, hand-narrowing only the CHECK-constrained `status`.
- **A publishable key now exists.** `.env.example` said one "becomes necessary the day riders are
  charged, and not before"; `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is that day, consumed by exactly
  one file (`apps/web/src/lib/payments/browser.ts`).
- **`@stripe/stripe-js`, not `@stripe/react-stripe-js`.** The React bindings render vendor
  components in JSX, which rule 7 forbids. The browser wrapper follows `apps/web/src/lib/maps/map.ts` instead:
  mount into a container, return an opaque handle, keep every vendor type inside `src/lib/`.
- **The buffer is configured but inert.** Anyone reading the seed will see a real number doing
  nothing; the column comment and this ADR are what stop that looking like a bug.
- **Funding a test balance is not obvious.** The dashboard's "Add funds" button does not credit a
  balance transfers can draw on — a real test charge is required. Recorded in `.env.example` and
  `docs/architecture/rider-charging.md` because it cost hours to discover once already.
- Cash rides are now conspicuously absent, and deliberately so — see below.

## Out of scope, tracked

**Cash rides**, which invert the flow: the driver physically holds the fare, so commission becomes a
driver-owes-RIDO debt with its own collection mechanism and its own answer for a driver who never
settles. That is a design, not a flag, and bolting it on here would have doubled the surface.

Also: refunds, disputes and chargebacks (a refund is a **new** `ride_charges` row, never an edit) ·
a periodic sweep for stuck `authorized` charges or expired holds · repricing the fare from actual
distance and duration at completion, which is what would make the buffer load-bearing · tips ·
multiple saved cards · flat-fee subscription billing (ADR-0003: $0 all pilot) · Prop 22 top-ups ·
CPUC and airport pass-throughs, whose `FareLineItem` seam stays empty but whose landing place is now
`rider_total_cents`.

## Supersedes

Nothing. Completes ADR-0015 (the outbound half, whose `transfer_group` was left waiting for this),
applies ADR-0016 (the attempt claim, from the start this time), consumes ADR-0009's
`riderTotalCents` for the first time, and extends ADR-0006 (`src/lib/payments/` is a new domain
module behind the same vendor boundary). ADR-0018 covers the cancellation half.
