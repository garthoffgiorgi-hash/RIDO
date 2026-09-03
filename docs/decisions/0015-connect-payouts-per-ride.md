# ADR-0015 — Connect payouts, per ride, against a ledger

**Date:** 2026-09-01
**Status:** Accepted

## Context

A ride now completes and snapshots `commission_cents` and `driver_payout_cents` onto its row
(ADR-0014). **That figure has never been paid to anyone.** It was a statement of what a driver had
earned, not a debt: there was no `paid_at` anywhere in the schema, no ledger, no balance, no payout
table. `drivers.stripe_account_id` had sat unreferenced since the first migration, and
`src/lib/stripe/` held one empty `.gitkeep`.

Four facts shaped what follows.

**Nothing charges the rider.** No Stripe dependency, no payment env var, no PaymentIntent, no
charge — before this change the only outbound HTTP host in the codebase was `api.mapbox.com`.
`rides.fare_cents` is a price nobody has paid. That is not incidental to a payouts feature: a
Connect transfer draws on a platform balance, and RIDO's is empty.

**The commission columns cannot carry payout state.** They are write-once, guarded by
`rides_prevent_commission_rewrite`, and bound by `rides_commission_sums_to_fare`. Adding a "paid"
marker among them would mean loosening a constraint that exists to protect the accounting record.
`driver_monthly_stats` is worse: `commission_cents + payout_cents = gross_fare_cents` means
`payout_cents` can never be decremented as it is settled, and that table feeds the commission tier
lookup — paying a driver would become coupled to rating their next ride.

**Open Question 3 had no answer and no default.** `tools/pilot-model` models
`passProcessingToDrivers` as a live boolean with both branches implemented, precisely so the
question could be explored rather than assumed. But the "pass it on" branch only zeroes RIDO's
cost; it never deducts anything from a driver's payout, so no arithmetic for that world exists
anywhere. The decision had to be made before payout code could be written.

**Prop 22's floor is assessed on a two-week aggregate** (`packages/pricing/src/earnings-floor.ts`),
which per-ride payment cannot know at the time it pays. `docs/README.md` Open Question 2 names
"payout design" as one of the things it blocks, and it is still an attorney's call.

## Decision

### 1. RIDO absorbs card processing. Open Question 3 is closed.

A driver receives **exactly `driver_payout_cents`** — the figure already snapshotted on their ride
and already shown to them at completion. Stripe's ~2.9% + $0.30 is a RIDO cost line, which is what
`tools/pilot-model` already models when `passProcessingToDrivers` is false.

Three reasons, in order of weight:

- **It keeps the promise the brand is built on literally true.** "You keep $X (Y%)" is shown before
  a driver accepts. If processing were deducted at payout, that figure would be a number no driver
  ever actually receives, and the one place RIDO cannot afford to be approximately honest is the
  driver's own take.
- **It requires no new money math.** The payout is a *copy* of a snapshot. `packages/pricing` is
  untouched by this entire change. The alternative needs a new deduction, a new snapshot column to
  keep it reconcilable, and a collision with `commission_cents + driver_payout_cents = fare_cents`,
  which is a database CHECK and an exact invariant.
- **The pilot is the wrong moment to shave a driver's take** to save a percentage point, when
  driver acquisition is the whole strategy.

This is a **pilot-scoped decision**, recorded the way ADR-0003 records the flat fee: the steady-state
question — whether the economics still work absorbing processing at volume — stays open, and
`monetization.md` continues to refuse to publish a processing-adjusted figure until it is answered.

### 2. A ledger, written by the database, not by application code

`driver_payouts` records what is owed. A row is created by `queue_driver_payout`, an `AFTER UPDATE
OF status` trigger firing on exactly the transition `bump_monthly_stats` already watches — so the
debt is recorded **inside the completion transaction**. A ride is completed and owed for
atomically, or neither happens.

That inversion is the entire robustness argument: **completing a ride records a debt; paying it is a
separate, retryable step.** If recording were application code's job, a crash between "ride
completed" and "payout queued" would lose a driver's money with nothing to reconcile against. It is
a local INSERT with no network call, so it does not violate ADR-0008's rule about what may sit
inside the critical section.

Status semantics are deliberate:

| Status | Means |
|---|---|
| `pending` | Owed, not sent. Covers "not tried yet", "driver hasn't onboarded", and "failed in a way that will clear". None of these needs a person |
| `failed` | Tried, refused terminally. Needs a person |
| `paid` | Stripe confirmed it, and the row carries the transfer id proving so |

A driver who hasn't finished onboarding leaves rows `pending`, never `failed` — nothing was
attempted and nothing is wrong. `driver_payouts_transfer_id_iff_paid` refuses `paid` without a
transfer id, so no code path can mark money sent without evidence.

`ride_id` is **nullable**. Every payout today is for one ride, enforced by a partial unique index,
but the Prop 22 top-up is by statute attributable to no single ride, and `data-model.md` records
that ride-completion.md's "a correction is a new row, not an edit" rule has had nowhere to write
to. A null `ride_id` is the home for both. Nothing creates one yet.

### 3. Per ride, on completion. No scheduler.

A transfer fires right after a ride completes, best-effort, from the same server action. Stripe's
own payout schedule then moves it to the driver's bank. This avoids building a batch runner, a
sweep query and its concurrency story — and Stripe charges nothing per transfer to a connected
account.

**A payout failure never turns a completed ride into a failed one.** The ride is finished either
way, the snapshot is written either way, the debt is recorded either way. The action swallows the
payout outcome and the ledger remembers.

### 4. Duplicate transfers are prevented twice, in two systems

> **The idempotency-key claim below is superseded by ADR-0016.** A payout id alone as the key
> made Stripe replay a payout's first cached response — including a retryable
> `balance_insufficient` — for up to 24 hours, so a retry could never actually retry. The
> exclusivity argument (two simultaneous attempts on one row yield one transfer) still holds; the
> key itself is now `<payout id>_<attempt number>`, the second half supplied by
> `claim_driver_payout_attempt`.

Paying a driver twice is the one failure here that costs real cash and cannot be undone by a
database rollback. So: `driver_payouts_one_per_ride` (a partial unique index) means a ride cannot
be owed for twice, and the transfer call passes the **payout row's id as Stripe's idempotency key**,
so even two simultaneous attempts on one row yield one transfer. Two independent systems, either of
which alone would be sufficient.

### 5. Express accounts; Stripe hosts onboarding

Connect **Express**, not Standard or Custom: Stripe hosts the onboarding form and owns identity
verification, bank details and the KYC obligation that comes with them. RIDO never receives,
transmits or stores a bank account number — a whole compliance surface stays out of this codebase.
Connected accounts request the `transfers` capability only; RIDO does not charge riders through
them.

Account state is mirrored onto `drivers.stripe_payouts_enabled` / `stripe_details_submitted` from a
signature-verified `account.updated` webhook, so `/drive` renders without a Stripe round trip.
Neither column joins the `authenticated` UPDATE grant, matching `stripe_account_id`'s existing
posture: a driver asserting their own `payouts_enabled` wouldn't make a transfer succeed, but it
would let the UI promise one.

The webhook is a Next route handler rather than an Edge Function — it needs the `stripe` npm
package and no import map, and the repo already has route handlers. `apps/web/src/proxy.ts` excludes
`api/stripe` from session refresh: the endpoint authenticates by signature, and attaching
`Set-Cookie` to a response only Stripe reads is meaningless.

## Consequences

- **In production, transfers fail until rider charging ships.** Stripe returns
  `balance_insufficient`, which `apps/web/src/lib/stripe/errors.ts` treats as a first-class case
  with its own message — the row stays `pending`, the driver is told their earnings are recorded,
  and nothing is lost. This is the honest cost of building the halves in sequence, and the ledger
  is what makes it survivable. Test mode has no such limit, so the path is provable now. **A retry
  of this exact case could not actually succeed until ADR-0016** — see the note under §4.
- **`database.types.ts` was stale** against this migration, which adds a table and two columns. A
  narrow, documented bridge file stood in — the same pattern ADR-0012 used and ADR-0014 deleted.
  **Since resolved:** the generated types carry `driver_payouts`, the bridge is deleted, and
  `apps/web/src/lib/payouts/server.ts` derives its row shape from the generator. Only `status` is
  still written by hand, because the column is `text` + CHECK rather than an enum and the generator
  can therefore only type it `string`.
- **Prop 22 enforcement is still not built, and per-ride payment makes its shape clearer**: a
  fortnight's shortfall cannot be known until the fortnight closes, so a top-up must be a separate
  later payout rather than an adjustment to a per-ride one. The nullable `ride_id` is where it will
  land. The legal question — who owes it — remains Open Question 2.
- **The flat-fee subscription is still unbilled**, deliberately. ADR-0003 puts it at $0 for the
  whole pilot, so building Stripe Billing now would mean a webhook set that does nothing
  observable. `monthlyFlatFee()` stays built, tested and unwired.
- **`subscriptions_select_own` now has a test** (`012_subscriptions_rls.sql`), closing a standing
  violation of `supabase/CLAUDE.md`'s "a policy with no test is an assumption" — done now, while
  nothing writes to that table, rather than after a webhook starts.
- When CPUC and airport pass-throughs land, what a rider is charged stops equalling `fare_cents`
  (`FareQuote` already distinguishes `riderTotalCents`, and `rides` has no column for it). The
  payout side is unaffected — pass-throughs are not commissionable and never were a driver's — but
  the charging side will need that column.

## Out of scope, tracked

Rider charging (the next PR, and what makes production transfers succeed) · flat-fee subscription
billing · Prop 22 top-up enforcement · CPUC and airport pass-throughs · refunds and transfer
reversals · instant payouts · a processed-webhook-event table (unnecessary while every handler is
idempotent by nature; the first delta-applying handler needs one).

## Supersedes

Nothing. Answers **Open Question 3** in `docs/README.md`, the first of the three ever resolved.
Extends ADR-0001 (Connect is the second of its two Stripe integrations), ADR-0002 (the snapshot it
mandates is what a payout copies), ADR-0006 (`src/lib/stripe/` is the vendor boundary the SDK is
confined to), and ADR-0014 (the completion path a payout now hangs off).
