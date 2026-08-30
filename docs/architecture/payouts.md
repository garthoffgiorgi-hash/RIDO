# Driver payouts — recording a debt, then discharging it

*The third of the money docs. `fare-pricing.md` decides what a ride costs; `ride-completion.md`
decides how that splits and snapshots it; this decides how the driver's half reaches their bank.
Why it's shaped this way: `../decisions/0015-connect-payouts-per-ride.md`.*

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
4. **The transfer fires**, best-effort, right after completion. On success the row becomes `paid`
   and records the transfer id. On failure it stays `pending` (retryable) or becomes `failed`
   (terminal), and `/drive` shows it either way.
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

Two independent mechanisms, either sufficient alone:

- **Postgres.** `driver_payouts_one_per_ride`, a partial unique index, means a ride cannot be owed
  for twice — whatever the application does with retries or double-taps.
- **Stripe.** The transfer call passes the payout row's id as its idempotency key, so two
  simultaneous attempts on the same row return the same transfer rather than creating two.

They are belt and braces on purpose. A duplicated transfer is the only failure in this system that
costs real cash and cannot be undone by a database rollback.

## Why RIDO absorbs card processing

A driver receives exactly `driver_payout_cents` — the figure already shown to them before they
accepted. Deducting Stripe's cut at payout would make "you keep $X (Y%)" a number no driver ever
actually receives. It also means **no money is computed in the payout path at all**: the amount is
a copy of a copy of a snapshot, and `packages/pricing` is untouched by the entire feature. Full
reasoning, and its pilot scoping: ADR-0015.

## The production gap, stated plainly

Nothing charges riders yet, so RIDO's platform balance is empty and a production transfer returns
`balance_insufficient`. That case is handled explicitly rather than generically: the driver is told
their earnings are recorded and will be sent, the row stays `pending`, and it is retried. Test mode
has no such limit, which is what makes the path provable before the inbound half exists.

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
