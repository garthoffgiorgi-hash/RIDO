# ADR-0016 — A payout retry needs a claim, not just a stable idempotency key

**Date:** 2026-09-01
**Status:** Accepted
**Supersedes:** ADR-0015 §4's idempotency-key claim (the payout row's id alone is Stripe's
idempotency key)

## Context

ADR-0015 §4 made the payout row's id Stripe's whole idempotency key
(`rido_payout_<payout id>`), stable across every call for that row, so that two simultaneous
`settle()` calls — a retry racing the original attempt, two server instances, a double-tap —
would collapse into one Stripe transfer. That reasoning is correct as far as it goes: it does
stop a duplicate transfer.

What it misses is what Stripe actually does with an idempotency key: it caches the **entire
response** — success or failure — for at least 24 hours, and replays it verbatim on any later
request using the same key and parameters, regardless of what has changed on either side since.
`balance_insufficient` is `apps/web/src/lib/stripe/errors.ts`'s first-class, expected-in-production
case (ADR-0015's own Consequences section: "transfers fail until rider charging ships"), and it is
classified `retryable`. But with a stable key, the *first* attempt's `balance_insufficient` was
cached, and every later retry — regardless of platform balance, driver Connect status, anything —
got that same cached failure replayed back rather than a fresh evaluation.

This was not theoretical. Confirmed against a real Stripe test account during manual verification
of ADR-0015: funding the platform's available balance to $2,050 did not clear two rows stuck
`pending` on `balance_insufficient`. Only a brand-new `driver_payouts` row — a fresh id, and
therefore a fresh key — ever succeeded. The two poisoned rows would have stayed stuck for up to 24
hours regardless of anything the application, `settlePendingPayoutsForDriver`, or a human did.

This directly breaks the promise `docs/architecture/payouts.md` and the driver-facing copy make: a
queued payout "will be sent automatically" once retried. `balance_insufficient` is the *expected*
production state until rider charging ships — meaning, unfixed, almost every driver's first payout
would have poisoned itself on day one.

## Decision

**The idempotency key gains a second half that changes on every genuine attempt: `<payout
id>_<attempt number>`.** The attempt number comes from `claim_driver_payout_attempt(payout_id)`
(`20260901130000_add_payout_attempt_claim.sql`), a `SECURITY DEFINER` function that atomically:

1. Refuses if the row is already `paid` — nothing left to attempt.
2. Refuses if another attempt is already in flight (`settling = true` and not stale) — this is
   the exclusivity ADR-0015 §4 was protecting, preserved.
3. Otherwise sets `settling = true`, stamps `settling_since`, increments `attempt_count`, and
   returns the new count.

`settle()` calls it first, wraps the entire existing attempt in `try`/`finally`, and always calls
the matching `release_driver_payout_attempt(payout_id)` on the way out — win, lose, or an early
return — clearing `settling` so the next genuine retry can claim.

**The exclusivity mechanism is the same one `supabase/CLAUDE.md` already documents for driver
accept**: one conditional `UPDATE`, `WHERE settling = false` (or stale) is the entire lock. The
claim touches exactly one row, so Postgres's row-level locking serializes two simultaneous callers
without any compare-and-swap function — the second blocks on the first's row lock, then
re-evaluates its `WHERE` against whatever the first committed, and finds no match.
`concurrent-payout-claim.sh` proves this the same way `concurrent-accept-ride.sh` proves it for
accept: two connections racing one row, asserting the loser genuinely blocked and got `null`
rather than a second attempt number.

**Stale-lock recovery, at two minutes.** Not a business rule — operational headroom against a
crashed or timed-out request that claimed but never reached `finally`. A Stripe transfer call
normally resolves in well under a second; two minutes is generous margin, not a tuning target.
Without this, one abandoned attempt would permanently strand a payout, which is worse than the bug
this ADR fixes.

## Consequences

- **Duplicate-transfer prevention is now three-deep, not two.** `driver_payouts_one_per_ride`
  (a ride is owed for once), the claim (only one attempt number is ever in flight for a row at a
  time), and Stripe's own idempotency key (even a claim somehow issued twice cannot become two
  transfers). ADR-0015 §4's "prevented twice, in two independent systems" becomes three.
- **A genuinely new retry is now genuinely new to Stripe.** The property ADR-0015 §4 was actually
  after — no duplicate transfer — holds exactly as before. What changes is that a *retryable*
  failure can now actually be retried, which was the entire point of the `pending` status existing.
- **`settle()` now does two extra round trips per attempt** (claim, then release) beyond what it
  already did. Negligible next to a Stripe API call, and worth it — the alternative was a payout
  that looks retried but structurally cannot be.
- No money math changes. `attempt_count` is not a cents value; nothing here reads or writes
  `amount_cents`, `commission_cents`, or `driver_payout_cents`. Root CLAUDE.md invariant 5 holds.

## Out of scope, tracked

A periodic sweep that retries every `pending` row on a schedule, independent of a driver landing on
`?onboarding=return` — `settlePendingPayoutsForDriver` still only fires from that one entry point.
This ADR fixes *whether* a retry can succeed; *when* a retry is attempted is unchanged and remains
a real gap for a driver who never revisits Connect onboarding after their first failed payout.
