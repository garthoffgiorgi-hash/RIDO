# Driver payouts — recording a debt, then discharging it

*The third of the money docs. `fare-pricing.md` decides what a ride costs; `ride-completion.md`
decides how that splits and snapshots it; this decides how the driver's half reaches their bank.
Why it's shaped this way: `../decisions/0015-connect-payouts-per-ride.md` and
`../decisions/0016-payout-attempt-claim.md`.*

**Status: built, and blocked on the inbound half in production.** `apps/web/src/lib/stripe/`,
`apps/web/src/lib/payouts/`, the `driver_payouts` table, and `/drive`'s payout card. Transfers
succeed in Stripe test mode today; in production they fail with `balance_insufficient` until rider
charging exists, and the ledger holds every unpaid row until it does.

## The one idea

**Completing a ride records a debt. Paying it is a separate, retryable step.**

Everything else follows. The debt is written by a database trigger inside the completion
transaction, so it cannot be lost to a crash, a network failure or an application bug — a ride is
completed and owed for atomically, or neither. The transfer is then allowed to fail as often as it
likes, because the ledger is what remembers.

## The flow

1. **Onboard.** `/drive` shows "Connect your bank". `startConnectOnboarding()` creates a Stripe
   **Express** account (first time only), stores its id on `drivers.stripe_account_id` through the
   service role, and returns a single-use hosted onboarding link. The driver enters bank details on
   Stripe's page — RIDO never sees, transmits or stores them.
2. **Stripe reports back.** An `account.updated` webhook syncs `stripe_payouts_enabled` and
   `stripe_details_submitted`. The driver's return redirect also re-reads Stripe directly, because
   the webhook and the redirect race and either can arrive first.
3. **A ride completes.** `queue_driver_payout` inserts a `pending` row carrying exactly the ride's
   `driver_payout_cents`. Nothing is computed — the amount is copied from a write-once snapshot.
4. **The transfer fires**, best-effort, right after completion. `settle()` first claims the row
   (`claim_driver_payout_attempt`), which hands back an attempt number folded into Stripe's
   idempotency key — the reason a retry can actually retry, not replay a stale cached response
   (ADR-0016). On success the row becomes `paid` and records the transfer id. On failure it stays
   `pending` (retryable) or becomes `failed` (terminal), and `/drive` shows it either way.
5. **Stripe pays the bank** on its own schedule. RIDO builds no scheduler.

## Ledger states, and why the distinction matters

| Status | Means | Who acts |
|---|---|---|
| `pending` | Owed, not sent | Nobody. Covers "not tried yet", "driver hasn't onboarded", and "failed retryably" |
| `failed` | Tried, terminally refused | A person |
| `paid` | Stripe confirmed it | Nobody. `driver_payouts_transfer_id_iff_paid` guarantees the row carries its receipt |

The `pending`/`failed` split is a product decision, not a technical one. A driver who simply hasn't
linked a bank yet must not be told their earnings "failed" — nothing was attempted, nothing is
wrong, and the money is theirs. Only a genuine terminal refusal gets a word that alarming.

## What guarantees a driver is never paid twice

Three independent mechanisms, any one alone sufficient:

- **Postgres, at the ride level.** `driver_payouts_one_per_ride`, a partial unique index, means a
  ride cannot be owed for twice — whatever the application does with retries or double-taps.
- **Postgres, at the attempt level.** `claim_driver_payout_attempt` lets only one attempt be
  in-flight for a row at a time — a conditional `UPDATE`, `WHERE settling = false`, is the whole
  lock, the same pattern driver accept uses (`supabase/CLAUDE.md`). Two simultaneous `settle()`
  calls for one row: exactly one gets an attempt number, the other gets `null` and never calls
  Stripe. `concurrent-payout-claim.sh` proves this the way `concurrent-accept-ride.sh` proves
  accept.
- **Stripe.** The transfer call passes `<payout id>_<attempt number>` as its idempotency key. Even
  if a claim were somehow issued twice, Stripe would still return the same transfer rather than
  create two.

They are belt and braces on purpose. A duplicated transfer is the only failure in this system that
costs real cash and cannot be undone by a database rollback. (ADR-0016 is why the key needed the
attempt number at all: a payout id alone made Stripe replay a payout's *first* cached response —
including a retryable `balance_insufficient` — for up to 24 hours, so a genuinely new retry could
never actually reach Stripe.)

## Why RIDO absorbs card processing

A driver receives exactly `driver_payout_cents` — the figure already shown to them before they
accepted. Deducting Stripe's cut at payout would make "you keep $X (Y%)" a number no driver ever
actually receives. It also means **no money is computed in the payout path at all**: the amount is
a copy of a copy of a snapshot, and `packages/pricing` is untouched by the entire feature. Full
reasoning, and its pilot scoping: ADR-0015.

## The production gap, and what closed it

This section used to say that nothing charged riders, so RIDO's platform balance was empty and every
production transfer returned `balance_insufficient` — handled explicitly rather than generically,
with the row left `pending` and the driver told their earnings were recorded.

**Rider charging (ADR-0017) is what ends that.** A completed ride now captures the rider's held fare
*before* it transfers the driver's cut, in that order and for exactly this reason: the capture is
what funds the balance the transfer draws on. `balance_insufficient` stops being the expected
outcome and becomes a real signal that something is wrong.

The error case stays in `errors.ts` regardless. A platform balance can still run dry — a burst of
completions against slow-settling captures, a refund, a dispute — and when it does, the honest
"queued, recorded, will be sent" message is still the right thing to show a driver. See
`rider-charging.md` for the inbound half.

## Invariants this flow must preserve

- The amount transferred is exactly the ride's snapshotted `driver_payout_cents`. Nothing deducts,
  rounds, or recomputes it.
- Every completed ride with a non-zero payout has exactly one `driver_payouts` row. A zero-payout
  ride has none — `amount_cents > 0` would reject it, and Stripe rejects zero-value transfers.
- A `paid` row always carries a `stripe_transfer_id`; a non-`paid` row never does.
- A driver can read their own payouts and write none of them. Marking unsent money `paid`, or paid
  money `pending`, is not a permission any driver holds.
- `drivers.stripe_account_id`, `stripe_payouts_enabled` and `stripe_details_submitted` are written
  only by the service role, from Stripe's word — never asserted by a driver.
- The Stripe SDK is imported in exactly one file (`apps/web/src/lib/stripe/server.ts`), enforced by
  `scripts/check-context.mjs` rule 7.
- Every `settle()` call claims the row before touching Stripe and releases it in a `finally`, on
  every exit path. A claim left stuck would strand a payout worse than the bug ADR-0016 fixes.
