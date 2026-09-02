# Rider charging — holding a card, then taking the fare

*The fourth of the money docs. `fare-pricing.md` decides what a ride costs, `ride-completion.md`
decides how that splits, `payouts.md` gets the driver's half out — this gets the rider's half in.
Why it's shaped this way: `../decisions/0017-rider-charging.md` and
`../decisions/0018-late-cancellation-fee.md`.*

**Status: built, and verified live against real Stripe test keys.** `apps/web/src/lib/payments/`,
the `ride_charges` ledger, `rider_payment_profiles`, the card form on `/account` and in the booking
sheet. This is the half that funds the platform balance every driver transfer draws on — before it,
every production payout failed `balance_insufficient` by construction. A saved card, a buffered
hold, a 3DS challenge, a decline, a captured fare, and a captured cancellation fee have all now run
end to end with a real driver transfer landing on the far side of the two captures.

## The one idea

**A hold is placed on what the ride will cost. A capture takes what it did cost.**

Everything follows from that gap. The hold goes on at booking, when only an estimate exists, so it
is deliberately a little larger than the quote. The capture happens at completion, when the real
figure is known, and takes only that. What was held and not taken is released.

## The flow

1. **A card, once.** `startCardSetup()` creates a Stripe Customer on first use and returns a
   SetupIntent client secret. Stripe's iframe collects the card in the browser; RIDO receives a
   PaymentMethod reference and mirrors brand/last4/expiry for display. **The card number never
   reaches this app** — the same trade Connect Express makes for bank details.
2. **Booking places a hold.** `requestRide()` writes the ride row first (the charge's foreign key,
   the PaymentIntent's `transfer_group` and its metadata all need the id), then authorizes
   `holdAmountCents({ riderTotalCents, bufferBps })` against the saved card, on-session.
3. **The bank may ask a question.** A `requires_action` result comes back with a client secret and
   the browser finishes the 3DS challenge in the sheet — the rider is on screen, which is the whole
   reason authorization is on-session. **Resolving the challenge is not the same as recording it.**
   `completeAuthorization()` talks to Stripe directly from the browser and never calls this app back,
   so the row stays `authorizing` until Stripe's own `payment_intent.amount_capturable_updated`
   webhook event reconciles it to `authorized` — the only thing that ever does, on this path.
4. **Completion captures.** `completeRide()` → `captureRideCharge()` → `payoutRide()`. The capture
   funds the balance the transfer draws on, which is why it runs first.
5. **Or a cancellation releases, or takes a fee.** Free before a driver accepts, and for a grace
   window after; past that, the fee is a **partial capture of the same hold** (ADR-0018), and
   `cancelRide()` calls `payoutRide()` itself right after — nothing else in the app would ever send
   that payout on its own; see `payouts.md`.

## Charge states, and what each means

| Status | Means | Who acts |
|---|---|---|
| `authorizing` | An authorization is in flight, or is waiting on a 3DS challenge | Nobody yet |
| `authorized` | The hold is in place. Money is reserved, not taken | Nobody |
| `captured` | Taken, with the PaymentIntent id proving it | Nobody |
| `voided` | Released in full, nothing taken | Nobody |
| `failed` | The card refused, terminally | The rider — a different card |

`ride_charges_captured_iff_settled` makes a `captured` row carry both its amount and its receipt,
and forbids a non-captured row from claiming either. It is the charge-side mirror of
`driver_payouts_transfer_id_iff_paid`, doing the same job: no code path can record money as taken
without the evidence that it was.

**There is no `kind` column.** A cancellation fee captures part of the same hold a fare would have,
so what a captured row *was for* depends only on how the ride ended — and `rides.status` already
says that, in one place, with nothing to drift.

## What guarantees a rider is never charged twice

Three independent mechanisms, any one sufficient:

- **One live charge per ride.** `ride_charges_one_live_per_ride`, a partial unique index on the
  unsettled statuses, so a `failed` authorization can be superseded by a new row while two live
  holds for one ride stay impossible.
- **One attempt at a time.** `claim_ride_charge_attempt()` — a conditional `UPDATE` where
  `settling = false` is the whole lock, the same shape driver accept uses. Two concurrent captures
  of one charge: exactly one gets an attempt number, the other gets `null` and never calls Stripe.
  `concurrent-charge-claim.sh` proves it with two real connections.
- **Stripe's idempotency key**, `rido_charge_<id>_<attempt>` / `rido_capture_<id>_<attempt>`. The
  attempt number is what makes a *genuine* retry genuinely new — a stable key would make Stripe
  replay its first cached response for 24 hours (ADR-0016, learned the expensive way).

## The buffer, and why it currently does nothing

`fare_rate_cards.authorization_buffer_bps` holds a little above the quote. **Nothing reprices a fare
at completion** — `apply_ride_commission` reads the ride's stored `fare_cents` and never writes it —
so the capture always equals the quote and the buffered portion is always released.

It ships anyway because a hold cannot be raised after the fact. The only way to hold more is to void
and re-authorize, which means a fresh card interaction with a rider whose ride has just ended. The
day repricing-from-actuals lands, every hold already in flight must already have been big enough.

## Failure modes, each with a resting place

| Case | What happens |
|---|---|
| Card declined at booking | The ride row is canceled back, so no dead `'requested'` ride blocks the rider from trying again. They are told plainly, and a decline is **not** retryable — recovery is a different card |
| 3DS required | Finished in the sheet by `completeAuthorization()`. On-session is what makes this a dialog rather than a later mystery |
| Capture fails at completion | The ride stays completed. The charge stays `authorized` and retryable, the payout stays `pending`. Nothing is lost and nothing is falsely marked paid |
| Hold expires (~7 days) | Stripe voids it and sends `payment_intent.canceled`; the row becomes `voided`. A ride that sat a week unfinished is an operations problem, now a visible one |
| Ride accepted, never completed | The hold sits until Stripe expires it. No sweep is built — tracked, like the payout sweep |
| Rider cancels in the grace window | Full void, no fee, no payout row |
| Webhook arrives out of order | Every handler writes current state, not a delta, and never walks a `captured` charge backwards |

## Testing this against real Stripe

Five things cost real time to discover, so they are written down.

**Funding a test platform balance.** The dashboard's **"Add funds" button does not credit a balance
that transfers can draw on.** Create a real test charge instead:

```
stripe charges create --amount=5000 --currency=usd --source=tok_bypassPending
```

Stripe's own `balance_insufficient` error points at this, and the symptom without it is a payout
that keeps failing while the dashboard shows thousands available.

**Use the app's own key.** The Stripe CLI authenticates separately from `.env.local`, so
`stripe charges create` can fund a *different* account than the one the app charges against. Check
with `curl https://api.stripe.com/v1/account -u sk_test_...:` and compare the account id.

**`supabase db push` never runs a seed, on a hosted project.** `authorization_buffer_bps`,
`cancellation_fee_cents` and `cancellation_grace_seconds` all land as `0` from their migration —
"policy off" is what a zero means, on purpose, so a market that hasn't decided still takes bookings
(`getPaymentPolicy`). Only `supabase/seed/fare_rate_cards.sql`'s `on conflict ... do update` sets
the real values, and `[db.seed]` in `supabase/config.toml` fires **only** on a local
`supabase db reset` — never against a linked remote project. The symptom is exactly what it looks
like: a hold with no buffer above the quote, and a late cancellation that stays free. Paste the
seed file into the Supabase Studio SQL Editor (or `psql "$SUPABASE_DB_URL" -f
supabase/seed/fare_rate_cards.sql`) to apply it — safe to re-run, since it only ever touches those
three columns on the row it already knows about.

**A capture funds Stripe's *pending* balance first, same delay as live mode.** A `4242…` capture is
real and correct the moment it happens — Stripe still won't let a transfer draw on it until the
normal payout-settlement window elapses, in test mode exactly as in live. That is not
`balance_insufficient` from an empty balance (the case `tok_bypassPending` above exists for); it's
`balance_insufficient` from a balance that is real but not yet available, and nothing here should
"fix" it. Every ride- or cancellation-triggered payout now calls `payoutRide()` itself once
(completion, or a captured cancellation fee), and `retryPayout()` is available by hand from
`/drive` for a `failed` row — but a merely `pending` one has no automatic retry loop behind it
(`settlePendingPayoutsForDriver()` only fires on the driver's Connect onboarding-return leg, not on
every page load — see `payouts.md`), so a payout stuck this way clears once you retry it, or once
`payoutRide()` is called again for that ride.

**`stripe listen` can be authenticated to a different account than your app's key, silently.** The
symptom is total silence: no forwarded events at all, not even a failed-delivery line, because
Stripe never sends a CLI session watching the wrong account anything to forward. `stripe config
--list` shows the CLI's current `account_id`; compare it against the `"id"` from the `curl` command
above. If they differ, `stripe login` again and pick the correct workspace in the browser account
switcher before approving — accounts under one login don't share CLI sessions automatically.

## Invariants this flow must preserve

- The rider is charged `rides.rider_total_cents` — what they agreed to, and what commission was
  computed against. Nothing recomputes it at capture time.
- `rider_total_cents >= fare_cents`, always. Commission still splits `fare_cents` alone, so
  `rides_commission_sums_to_fare` is untouched by anything here.
- No money is computed in `src/lib/payments/`. The hold comes from `@rido/pricing`, the capture
  amount from a stored column, the fee from the rate card.
- A payment failure never turns a completed ride into a failed one.
- A rider reads their own charges and writes none of them.
- The card number never reaches RIDO's server, database, or logs.
- `@stripe/stripe-js` is imported in exactly one file (`apps/web/src/lib/payments/browser.ts`) and `stripe`
  in exactly one other (`apps/web/src/lib/stripe/server.ts`), enforced by `scripts/check-context.mjs` rule 7.
