# ADR-0008 — Ride completion is a bounded critical section

**Date:** 2026-08-25
**Status:** Accepted

## Context

`ride-completion.md` specified the completion flow as four steps that "must all run inside ONE
held-open transaction" — the phrasing in `reserve_driver_month`'s own header. When we came to
build it, two constraints made that specification unbuildable as written, and a third made it
worth deciding something broader.

**1. supabase-js cannot hold a transaction open.** Every call auto-commits over PostgREST. The
lock `reserve_driver_month` takes would be released before `commissionForRide` ran, and the
protection it exists for would evaporate. Keeping the specified shape would mean a raw Postgres
driver and a connection string inside an Edge Function — a second data path, with its own pooling
story, for one function.

**2. The `rides` CHECK constraint makes steps 3 and 4 one step.** `rides_commission_present_iff_completed`
requires `status` and all three commission columns to be consistent within a single statement.
"Snapshot, then mark completed" cannot be executed as two UPDATEs in any order.

**3. Edge Functions have a hard 2-second CPU-time limit.** Not wall clock — actual compute. And
this function runs while holding a lock on the driver's month row, so time spent inside it
serializes that driver's other completions. Meanwhile the direction of travel for RIDO is toward
spatial-temporal optimization: demand prediction, matching, dynamic pricing. Deciding where that
work runs *before* anyone tries to add it to the completion path is cheaper than discovering the
limit in production.

## Decision

**The completion path is a bounded critical section, and heavy computation lives outside it.**

Concretely:

- **The transaction moves into the database.** `apply_ride_commission(...)` takes the already
  computed commission as arguments, calls `reserve_driver_month` as its first statement, and
  performs the single UPDATE the constraint requires. The critical section is pure SQL.
- **Correctness under concurrency is compare-and-swap, not a held lock across the client.** The
  caller reads the driver's month-to-date position, rates the ride against it, and passes that
  position back; under the lock the function re-checks it and refuses if it changed. The caller
  re-rates and retries, bounded at three attempts.
  **The lock is still required.** Two concurrent completions for one driver write two *different*
  `rides` rows — Postgres has no write conflict to serialize them, so both would find their
  expectation satisfied and both would commit a commission rated from the same stale position.
  `reserve_driver_month` is what makes the second caller block and then observe the first's
  committed figure.
  `year_month` is part of the compared tuple, so a ride finishing across a month boundary
  conflicts and re-rates rather than being charged against the wrong month.
- **Nothing may go between the lock and COMMIT** but the month-to-date re-read, the comparison,
  and the UPDATE. This is enforced by location rather than by review: a network call or an
  optimizer cannot be written inside a SQL function.
- **The Edge Function is split into a pure core and a thin shell.** `core.ts` has no Supabase
  import and no clock; it can be called by a worker, a batch re-simulation over historical rides,
  or a pricing experiment. `index.ts` is the only file that knows HTTP exists.
- **We record the data an optimizer will need, now.** PostGIS is enabled and `rides` carries
  indexed pickup/dropoff geographies, `started_at`, `distance_meters` and `duration_seconds`.
  These are cheap to add and impossible to backfill — a coordinate never written down is gone.
- **We do not choose an optimizer host yet.** The trigger for that decision is stated instead:
  **when a computation needs more than the ride being completed, or exceeds roughly 1s of CPU, it
  moves out of the request path** — first to a `pg_cron`/`pgmq` worker reading the rows this
  schema makes queryable, then to a dedicated service if that stops being enough.
- **`EdgeRuntime.waitUntil()` is the post-commit async seam**, not an optimizer host. It shares
  the same CPU budget and its container can be recycled: a place to hand work off, never to do it.

## Consequences

**Good.** No second data path — supabase-js is still the only database client in the function. The
critical section is small, auditable, and testable in SQL. Retries are safe because nothing is
written until the check passes, and completion is idempotent: replaying a completed ride returns
its existing snapshot rather than re-rating it. The 2s CPU budget stays essentially untouched,
which is the property that keeps completions fast while an optimizer grows elsewhere.

**Costs.** Commission is computed against a figure read before the lock, so a conflict is a normal
outcome rather than an error — callers must handle it. Under sustained concurrent completions for
one driver, a caller could in principle exhaust its three attempts and get a 409; that requires
one driver finishing three rides in the same instant, and the response is safe to retry because
nothing was written. And there is now a rule that has to be *kept*: the critical section is only
bounded as long as nobody puts work inside it.

**Supersedes nothing.** ADR-0002 (bracketed per-ride commission) and its snapshot-and-never-recompute
rule are unchanged — this decides how that rule is executed safely, not what it is.
`../architecture/ride-completion.md` is rewritten to match.
