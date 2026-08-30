# Ride completion — the critical path

*Moved out of the schema doc because it's the one flow where a mistake corrupts the accounting
record. Tables: `data-model.md`. The rule being implemented:
`../decisions/0002-bracketed-per-ride-commission.md`. Why it's shaped this way:
`../decisions/0008-completion-is-a-bounded-critical-section.md`. Why the app calls it the way it
does: `../decisions/0014-app-calls-complete-ride.md`.*

**Status: built, and finally called.** `supabase/functions/complete-ride/`, the
`apply_ride_commission` / `driver_month_to_date` / `active_commission_tiers` migrations, and — new
— `apps/web/src/lib/rides/server.ts`'s `completeRide()`, the first call this app has ever made to
a deployed Edge Function.

## The flow

The Edge Function does the reading and the rating. The database does the writing, inside one
transaction it controls. Nothing is ever rated from a client-supplied fare.

0. **The app forwards the driver's own access token as the bearer**, rather than calling with the
   service-role key. `resolveCaller` (below) accepts either, but a service-role caller skips the
   ownership and compliance checks entirely — forwarding the driver's token is what keeps those
   checks the real gate instead of moving them, untested, into the app. ADR-0014.
1. **Resolve the caller** — the driver who owns the ride, or the service role. A driver must be
   `status = 'active'`, which the `drivers_activation_gate` constraint already makes unreachable
   without both compliance checks passed. Identity is checked before ride state, so a refusal
   never reveals anything about a ride the caller can't read.
2. **Load the ride** and take `fare_cents` **from our own row** — the request body carries only a
   ride id. `rides` has no `INSERT`/`UPDATE` grant for `authenticated` at all, which is what makes
   that a guarantee rather than a convention.
3. **Read the active tiers** (`active_commission_tiers()`) and the driver's month-to-date position
   (`driver_month_to_date()`). Both filter on a day boundary in `America/Los_Angeles`, in SQL, so
   the timezone isn't re-derived per runtime.
4. **Rate the ride** with `commissionForRide` from `@rido/pricing` — bracketed from the driver's
   MTD position, so a ride straddling a band boundary is split at the boundary, not rated
   wholesale. The function implements none of this itself.
5. **Apply it** via `apply_ride_commission(...)`, which does the whole write as one transaction:
   lock the ride, lock the month (`reserve_driver_month`), re-check the position, and update.

Steps 3–5 repeat on a conflict, up to three attempts.

## Why a single UPDATE, not "snapshot then complete"

`rides_commission_present_iff_completed` requires `status` and all three commission columns to be
consistent within one statement. There is no ordering of two UPDATEs that satisfies it — the
snapshot and the status change are one step, enforced by the database.

`bump_monthly_stats` then fires inside that same transaction and rolls the ride into
`driver_monthly_stats`.

## Concurrency: compare-and-swap over a held lock

The commission is computed **before** any lock is held, so it may be stale by the time it's
written. `apply_ride_commission` therefore takes the `(year_month, gross_fare_cents)` the caller
rated against, re-reads them under the lock, and refuses if either moved — returning the current
figures so the caller can re-rate without another round trip.

**The lock is still load-bearing, even though it currently has nothing to lock against.** Two
concurrent completions for one driver would update two *different* `rides` rows, so Postgres would
have no write conflict to serialize them on its own; both would pass their own check and both
would commit a commission rated from the same stale position. `reserve_driver_month` is what would
make the second caller block and then see the first's committed figure.

That scenario is currently unreachable, though, and it's worth being precise about why:
`rides_one_active_per_driver` (ADR-0013) means a driver holds at most one live
(`'accepted'`/`'in_progress'`) ride at a time, and a second ride can only become `'accepted'` for
that driver *after* the first has already completed — which, transactions being atomic, means the
first's MTD bump has already committed by then. Two of one driver's rides can no longer be racing
toward completion at the same instant, through any real code path. The two-connection script that
used to prove this (`concurrent-apply-ride-commission.sh`) is retired for exactly that reason — its
own setup (two simultaneously `'accepted'` rides for one driver) is now illegal, and no rewrite of
it can recreate a state the schema itself forbids. The lock stays anyway: it becomes load-bearing
again the moment a future feature relaxes `rides_one_active_per_driver` — driver ride-queuing,
should that ever ship, is exactly such a feature. Full account: ADR-0014.

Because `year_month` is part of the compared tuple, a ride finishing across a month boundary
conflicts and re-rates rather than being charged against the wrong month.

Retries are safe: nothing is written until the check passes. Replaying a completed ride returns
its existing snapshot (`already_completed`) rather than re-rating it.

## What must never go inside the critical section

Between `reserve_driver_month` and COMMIT: the month-to-date re-read, the comparison, the UPDATE.
Nothing else. The lock covers that driver's whole month row, so anything slow there serializes
their completions behind it.

This is enforced by *location*, not by review — that window is inside a SQL function, where a
network call or an optimizer cannot be written. The Edge Function around it has a **2-second
CPU-time budget** (not wall clock; I/O wait doesn't count), and `commissionForRide` uses a
vanishing fraction of it. Heavy spatial-temporal computation belongs outside the request path
entirely — see ADR-0008 for the trigger that decides when and where.

## Why there is no reconciliation job

Per-ride bracketing against a running MTD total is mathematically identical to re-bracketing the
whole month at month-end. Each dollar is charged at its band's rate either way. So there is no
batch job, no month-end re-rating, and no window where a driver's stated payout differs from
their actual one.

Worked check — at $1,001 of month-end fares: $1,000 × 20% + $1 × 12% = $200.12. Same figure
whether computed ride-by-ride or in one pass at month end. (The cent-level caveat once each ride
is rounded: `packages/pricing/CLAUDE.md`.)

## `started_at` and `duration_seconds`

Outside the critical section, additive to it: `rides_started_at_present_iff_in_progress` requires
`started_at` whenever `status = 'in_progress'`, and says nothing about `'completed'` — a ride may
still complete straight from `'accepted'` with no `started_at` at all, exactly as
`COMPLETABLE_STATUSES` has always allowed. A `BEFORE UPDATE OF status` trigger
(`set_ride_duration`), firing on the same `'completed'` transition `bump_monthly_stats` watches,
derives `duration_seconds` (ADR-0011: `completed_at − started_at`) when both timestamps exist and
leaves it `null` otherwise. Neither lives inside `apply_ride_commission` — that function is the
critical section, and a non-money column is not its responsibility to compute. ADR-0014.

## Invariants this flow must preserve

- `commission_cents + driver_payout_cents === fare_cents`, exactly. No rounding drift.
- A completed ride's commission fields are **never** rewritten — not by a tier change, not by a
  backfill, not by a correction. A correction is a new adjustment row, not an edit.
- `fare_cents` is never taken on trust from a client.
- Money stays in integer cents from the database through the function to the response.
- A driver may complete only their own ride, forwarding their own token — never the service-role
  key, which would bypass that check entirely (ADR-0014).
- `duration_seconds` is only ever set from `started_at`/`completed_at`; never invented when
  `started_at` is absent.
