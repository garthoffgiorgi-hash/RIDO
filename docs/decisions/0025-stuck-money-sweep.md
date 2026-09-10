# ADR-0025 — A scheduled sweep retries what completion swallowed, and never touches a terminal row

**Status:** Accepted
**Date:** 2026-09-10

## Context

`apps/web/src/lib/rides/settlement.ts` names its own gap outright: `settleCompletedRide()` calls
`captureRideCharge()` then `payoutRide()`, swallowing either failure into `console.error` so a
completed ride never turns into a failed one on the driver's screen. *"With no sweep and no
alerting, a swallowed failure here is invisible until someone looks at the ledger. That is a known
gap, not an accident."* ADR-0016 named the payout half of this explicitly, in its own "Out of
scope, tracked" section: *"A periodic sweep that retries every `pending` row on a schedule...
remains a real gap for a driver who never revisits Connect onboarding after their first failed
payout."* This ADR is that sweep, on both ledgers — `ride_charges` (money in) and `driver_payouts`
(money out).

**The schema anticipated this before either gap was named.** `ride_charges` shipped with
ADR-0016's attempt-claim columns (`attempt_count`, `settling`, `settling_since`) from its first
migration, and `ride_charges_unsettled_idx on (created_at) where status in ('authorizing',
'authorized')`. `driver_payouts_unsettled_idx`'s own comment reads *"Serves the payout runner's
'what still needs sending' query"* — a sweep was the intended consumer before one existed.

## Decision

**A Route Handler in `apps/web`, triggered by Vercel Cron, not a Supabase Edge Function.** The
retry functions this needs — `captureRideCharge()` and a new `settlePayoutForSweep()` — live in
`apps/web/src/lib/payments/server.ts` and `apps/web/src/lib/payouts/server.ts`, reaching Stripe
only through `apps/web/src/lib/stripe/server.ts`. Porting that to Deno would duplicate the one
place ADR-0006 keeps Stripe-calling code. The shape matches the Stripe webhook route exactly: a
thin handler importing no vendor SDK, calling into `apps/web/src/lib/`.

**Auth is a bearer secret**, the same posture the webhook route already takes toward an
unauthenticated caller — proving identity with something only the real caller holds, not a
session. `Authorization: Bearer ${CRON_SECRET}`, checked first, 401 on mismatch; Vercel sends this
header automatically once `CRON_SECRET` is set as an env var. `apps/web/src/proxy.ts` excludes
`/api/cron` from its matcher, mirroring the existing `api/stripe` exclusion.

**What counts as stuck, and the line that must not move:**

| Ledger | Swept | Threshold | Never swept |
|---|---|---|---|
| `ride_charges` | `status = 'authorized'`, ride `completed` | 15 min past `completed_at` | `'authorizing'` (logged only), `'failed'` |
| `driver_payouts` | `status = 'pending'` | 30 min past `updated_at` | `'failed'`, `'paid'` |

**`'failed'` is deliberately excluded from both, and this is the decision most likely to be
"fixed" backwards later.** `settle()`'s own docstring draws the line: *"`pending` — owed, not
sent... none is an error state a person needs to look at. `failed` — tried, and refused terminally.
Something needs a human."* `captureCharge()` draws the identical line on the charge side. A sweep
that auto-retried `'failed'` rows would erase that distinction silently — the same failure mode
ADR-0016 fixed on the *capture* side, where a stable idempotency key made a retryable failure look
permanently stuck. The fix here is the opposite shape: leaving a genuinely terminal row alone
rather than making a transient one retryable. Both ledgers exist so a human can tell "still trying"
from "needs you"; an automated process must not blur that line back together.

**Charges stuck at `'authorizing'`** — a 3DS challenge the rider never finished, or a webhook that
never arrived — are a different, unhandled problem: there is no valid capturable authorization yet.
The existing index already covers this status, so the sweep queries it too, purely for visibility
(logged, never acted on) rather than silently missing a category of stuck money.

**Thresholds are operational headroom, not business rules**, the same framing ADR-0016 gives its
own two-minute claim-staleness window. 15 minutes for charges is margin over a transient failure
plus its own retry — capture is synchronous inside `completeRide()`, so this is never waiting on a
webhook. 30 minutes for payouts is generous specifically because a `pending` row for a driver who
hasn't finished Connect onboarding is *expected* to sit that way by design (`settle()`'s own
docstring), and re-sweeping it costs a claim RPC, not a Stripe call — `canReceiveTransfers` is
checked locally first.

**Ordering: charges swept to completion, then payouts, in one invocation.** Preserves ADR-0017's
capture-before-payout on the rare row stuck on both ledgers for the same ride, without forcing
every candidate through `settleCompletedRide`'s full two-step shape.

**The orchestration is pure and tested, not a bare script.** `sweepStuckMoney()`
(`apps/web/src/lib/ops/stuck-money.ts`) takes its I/O as injected `SweepSteps` — the same shape
`settleCompletedRide()` already uses — so ordering, counting, and "one row failing must not stop
the rest" (the property `settlePendingPayoutsForDriver`'s own docstring already promises) are
provable without Postgres or Stripe. The impure wrapper, `apps/web/src/lib/ops/sweep.ts`, supplies
the real queries and calls; it carries no logic of its own to get wrong.

**No new retry mechanism.** ADR-0016's claim already serializes concurrent attempts per row;
Stripe's per-attempt idempotency key already prevents a duplicate transfer or capture. Reading a
batch and calling the existing claim-gated functions is already safe across overlapping sweep runs
— no additional locking is added.

## Consequences

- A driver's payout, or a rider's capture, that a transient failure stranded now clears on its own
  within the sweep's cadence rather than waiting for someone to notice the ledger or for the driver
  to happen to revisit Connect onboarding.
- No new money math anywhere. `captureRideCharge()` is unchanged; `settlePayoutForSweep()` is
  `retryPayout()` with its two session-bound lines removed, calling the same `settle()`.
- A `'failed'` row on either ledger still requires a human — `/drive`'s existing retry affordance,
  or direct intervention. The sweep does not make that state disappear on its own, by design.
- The repo's first scheduled job, and its first endpoint authenticated by a bearer secret rather
  than a session or a vendor signature. `apps/web/vercel.json` is new; `CRON_SECRET` is a new
  required env var.
- The `SweepReport` a run returns is the only alerting that exists. Logging is still the whole
  story past this point — no paging, nothing has asked for it, and it is not this pilot's problem
  yet.

## Supersedes

Nothing. Fulfills the gap ADR-0016 named and deferred, and extends ADR-0017's capture-before-payout
ordering to the retry path rather than only the synchronous one.
