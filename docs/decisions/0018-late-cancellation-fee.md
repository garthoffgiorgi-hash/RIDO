# ADR-0018 — A rider may cancel late, for a fee the driver keeps

**Date:** 2026-09-02
**Status:** Accepted

## Context

`canRiderCancel()` returned `true` only for `'requested'`, and its docstring said why:

> Only `'requested'`: this PR builds no driver-side accept, so nothing here ever produces
> `'accepted'` or `'in_progress'` yet — drawing the line anywhere past `'requested'` would be
> designing for a state nothing can reach. **Once accept exists, whether a rider can still cancel
> after a driver has committed is a real product decision (a fee? a driver notification?) that
> belongs with that PR, not assumed here.**

Accept shipped in ADR-0013. Rider charging ships in ADR-0017. This is that PR and this is that
decision.

Two things make it worth deciding now rather than later. A driver who accepts starts *driving* —
toward a pickup they may never make, on their own fuel and time, with no way to earn from the trip
they turned down to take it. And a fee is newly cheap to charge: ADR-0017 places a hold on the
rider's card at booking, so a cancellation fee is a **partial capture of money already reserved** —
no second card interaction, no new PaymentIntent, no chance of a decline at the awkward moment.

## Decision

### 1. Free while `requested`, free for a grace window after `accepted`, chargeable after

- `'requested'` → free. Nobody was dispatched and nobody drove anywhere; there is nothing to
  compensate.
- `'accepted'`, inside `fare_rate_cards.cancellation_grace_seconds` → free. A mistap should not
  cost money.
- `'accepted'`, past the window → the fee.
- `'in_progress'` → the fee, with no grace at all. The rider is in the car; there is no version of
  this where the driver's time was not spent.
- `'completed'` / `'canceled'` → refused, as before.

The window is measured against `rides.accepted_at`, which already exists — no new timestamp, no
timer to run, nothing scheduled. The rule lives in `cancellationOutcome()`
(`apps/web/src/lib/rides/cancellation.ts`), pure and tested, and **takes `now` as an argument** so
the boundary is testable to the second. The grace boundary is inclusive: if the window is thirty
seconds, the thirtieth second is still inside it, because charging *at* the stated limit would make
the stated limit a lie.

### 2. The driver keeps 100%

RIDO takes nothing. The fee compensates a driver for time already spent, and RIDO did not spend it.

This also keeps the accounting simple in a way worth naming: because RIDO takes no cut, **a canceled
ride writes no commission columns at all**, so it never has to argue with
`rides_commission_present_iff_completed` — the constraint that forbids exactly those columns on a
ride that did not complete. `queue_cancellation_payout()` inserts a `driver_payouts` row for the
full captured amount, copied, with no arithmetic anywhere. "Driver keeps 100%" is expressed by the
*absence* of a calculation rather than by a multiplication by one.

### 3. Capture, then cancel — in that order

`queue_cancellation_payout()` fires on the transition into `'canceled'` and reads the captured
charge to decide what the driver is owed. So `cancelRide()` captures the fee *first* and flips the
status *second*. Reversing them would pay nobody, silently. It is the one place in the payment path
where statement order is load-bearing, and it is commented as such in both the migration and the
caller.

### 4. The fee is data, not code

`fare_rate_cards.cancellation_fee_cents` and `cancellation_grace_seconds`, beside the four fare
values, per-market and tunable without a deploy. Both default to `0`, which means the policy is off
until a market's seed turns it on — a market that has not decided charges nothing rather than
something arbitrary. `cancellationOutcome()` collapses a zero fee to `free` rather than reporting a
fee of nothing, so no rider ever sees a confirmation dialog about being charged $0.00.

## Consequences

- **A rider can now cancel a ride a driver already accepted, which they could not before.** This is
  new capability, not only new billing, and `/request` renders Cancel at every live status rather
  than only `'requested'`. What changes past the grace window is the *confirmation*, which names the
  amount and says where it goes.
- **A canceled ride can now owe a driver money**, so `driver_payouts` rows are no longer exclusively
  produced by completion. `driver_payouts_one_per_ride` still holds: a ride is either completed
  (fare payout) or canceled (fee payout), never both.
- **A terminal capture failure refuses the cancellation** rather than cancelling for free. A rider
  told they would be charged, and then not charged, is a promise broken in the other direction. A
  *retryable* failure cancels anyway with nothing captured — trapping a rider in a ride they want
  out of because Stripe is having a moment is worse than losing a fee.
- **The 100% split is provisional, and expected to move.** See below.

### The split is a policy, and it is going to be revisited

RIDO absorbs Stripe's processing on every authorization (ADR-0015 resolved that for fares), and a
cancellation fee is the obvious place to recover some of it — or simply to earn on a real cost the
platform bears. **Keeping some or all of the fee as a platform fee is on the table**, and this ADR
records that explicitly so the next person does not read the current split as settled.

What that means for whoever changes it:

- **`queue_cancellation_payout()` is the only thing that decides where a captured fee goes.**
  Changing the policy should be one migration replacing one function, not a hunt through the
  payment path. Nothing else in `src/lib/payments/` or `src/lib/rides/` knows about the split.
- **No configurable split was built.** No `cancellation_fee_driver_share_bps`, no branch for a case
  that does not exist. The repo's standard for a forward seam is that its absence would force a
  restructuring — and this one wouldn't: adding a column and editing one function is a normal day.
- **The constraint story is the part that will not be obvious.** Driver-keeps-100% is precisely what
  lets a canceled ride skip the commission columns. A split has to decide whether
  `rides_commission_present_iff_completed` bends to admit a snapshot on a canceled ride, or whether
  RIDO's share is recorded somewhere else entirely — `ride_charges` already holds the captured
  total, and the difference between it and the payout is derivable without loosening anything. That
  second option is probably the right one, and it is written down here so the question is answered
  before it is asked under time pressure.

Recorded as an open question in `docs/README.md`, beside insurance and Prop 22.

## Out of scope, tracked

A driver-side notification when a rider cancels · a rider-facing cancellation history · repeat-
canceller policy of any kind · refunding a fee that was charged in error (which, per ADR-0017, would
be a new `ride_charges` row rather than an edit) · any fee for a driver who cancels, which is a
different question about a different party's obligations.

## Supersedes

Nothing. Answers the question `canRiderCancel()`'s docstring deferred to this PR, and supersedes
that function's role as the authority on cancellation — it survives as a display-only "is this
free" helper, with `cancellationOutcome()` as the server-side rule. Builds directly on ADR-0017's
hold, and on ADR-0013, which created the `'accepted'` state this decision is about.
