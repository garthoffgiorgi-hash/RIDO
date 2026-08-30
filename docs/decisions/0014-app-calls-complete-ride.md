# ADR-0014 — The app calls `complete-ride`; it doesn't re-orchestrate it

**Date:** 2026-08-31
**Status:** Accepted

## Context

A rider can book (ADR-0012) and a driver can accept (ADR-0013). Nothing moves a ride past
`'accepted'`. `complete-ride` has been built, tested under both Node and Deno, and deployed since
ADR-0008 — and the app has never called it once. Nothing in this repo has ever invoked an Edge
Function at all.

This is the change where RIDO computes real money for the first time outside a test: a commission
snapshot on a real `rides` row, rolled into `driver_monthly_stats` by a trigger that has never
fired outside `pg_prove`. Everything downstream — Stripe payouts, driver earnings, the tier-progress
UI — is blocked until a ride can actually reach `'completed'`.

Scope is `accepted → in_progress → completed`, driven from `/drive`, plus the rider-side states
that close the loop visually.

## Decision

### 1. `started_at` gets a truth; `duration_seconds` gets derived

`started_at` has existed on `rides` since `20260825120000` and nothing had ever written it. A new
constraint, `rides_started_at_present_iff_in_progress`, requires it whenever
`status = 'in_progress'` — and deliberately says nothing about `'completed'`, because
`apply_ride_commission` has always accepted a ride straight from `'accepted'`
(`COMPLETABLE_STATUSES` in `core.ts`), and constraining that here would break a path the function
still legitimately allows.

`duration_seconds` (ADR-0011: `completed_at − started_at`) was underivable until `started_at`
could be written. A `BEFORE UPDATE OF status` trigger, firing on the same `'completed'` transition
`bump_monthly_stats` watches, sets it when both timestamps exist and leaves it `null` otherwise —
kept out of `apply_ride_commission` on purpose, since that function is the critical section
(ADR-0008) and does not grow a responsibility for a non-money column.

Neither change touches `apply_ride_commission`, `active_commission_tiers`,
`driver_month_to_date`, or any index — `COMPLETABLE_STATUSES` already spans `'accepted'` and
`'in_progress'` identically, and so do both partial unique indexes on `rides`. No SQL function
changed, and `complete-ride` needed no redeploy.

### 2. The app forwards the driver's own token. It does not re-orchestrate the rating.

The app already has both inputs `complete-ride` needs (`src/lib/commission/` reads tiers and
month-to-date) and could call `apply_ride_commission` directly. That was rejected: it would be a
**second orchestration of the critical accounting path** — read tiers, read MTD, rate,
compare-and-swap, retry on conflict — that must forever agree with the one already written and
tested in `complete-ride`. One of the two would eventually drift, and the artifact of that drift
is a permanently wrong number in the accounting record.

So `completeRide()` (`apps/web/src/lib/rides/server.ts`) POSTs to the deployed function,
**forwarding the signed-in driver's own access token as the bearer.** That choice is deliberate:
`resolveCaller` in `db.ts` also accepts the service-role key, but a `service_role` caller makes
`authorizeCompletion` **skip the ownership and driver-active checks entirely** (`core.ts:70-72`) —
which would move root `CLAUDE.md` invariant 6 out of a tested pure function and into new, untested
app code. Forwarding the driver's token keeps `authorizeCompletion` the real gate, exactly where
ADR-0008 put it.

`requireUser()`'s own `getUser()` call already verifies the session against the auth server;
`completeRide()` then calls `getSession()` **only** to lift that already-verified session's
`access_token` for forwarding — it does no further security work of its own, and `complete-ride`
re-verifies the token independently (`admin.auth.getUser(token)`) regardless of how it arrived.
Worth stating plainly: `getSession()` reads the session cookie without re-checking it against the
auth server, which is exactly why every other call site in this codebase uses `getUser()` instead.
Using it here is safe only because a verified `getUser()` call already happened first in the same
request and the receiver re-verifies anyway — not a precedent for reaching for `getSession()`
elsewhere.

### 3. Two shapes of HTTP 409, told apart by what they say, not their status code

`supabase/functions/complete-ride/index.ts` returns 409 for two unrelated reasons: a terminal
refusal ("Ride X is `'canceled'` and cannot be completed") and a transient one ("...could not be
completed after 3 attempts — this driver has other completions landing concurrently. Retry.").
The second means every compare-and-swap attempt lost the race and **nothing was written**, so
retrying is not just safe, it's the intended recovery. `apps/web/src/lib/rides/completion-errors.ts`
(`completionErrorMessage`, mirroring `apps/web/src/lib/maps/errors.ts`'s role as a dedicated,
tested mapping file) is what tells them apart — by matching the message content, since the status
code alone can't. Collapsing the two would
either strand a driver on a refusal that will never change, or invite them to hammer one that
won't help.

### 4. The rider side closes visibly; the driver's current ride survives a reload

`getDriverActiveRide()` is the read `/drive` never had — accepting a ride used to exist only in
`OpenRequestsPanel`'s local React state, so a reload lost it. It's priced the same live way
`listOpenRequests` prices the open pool (no snapshot exists before `'completed'`); once
`completeRide()` succeeds, the driver sees the real snapshot the function returned, never a
recomputation of it.

On the rider side, `'in_progress'` reads "You're on your way," and a short trip-complete summary
(`getRecentlyCompletedRide()`, a freshness-windowed read that swallows its own errors into `null`
rather than throwing — it backs a nice-to-have, not the booking gate) replaces the blank "Where
to?" form the moment `getActiveRide()` goes back to `null` on completion. It carries no commission
or payout figures — those are the driver's, never the rider's, to see.

**Folded in:** the Cancel button, still rendered after a driver accepts even though
`canRiderCancel()` has always been `'requested'`-only, always failing with "That ride can no
longer be canceled." It now renders only while `status === 'requested'`. The *product* question —
should a rider be able to cancel on a driver who has already committed, and at what cost — stays
exactly as deferred as ADR-0012 left it.

## Consequences

- **`complete-ride` is finally exercisable end to end.** A driver can now take a real booked,
  accepted ride through to `'completed'` and see the real commission snapshot RIDO has carried
  tested-but-unused since ADR-0008.
- **`concurrent-apply-ride-commission.sh` is retired.** Running the full local verification suite
  surfaced that its own setup — two `'accepted'` rides inserted for the same driver in one
  statement — is now illegal under `rides_one_active_per_driver` (ADR-0013). Tracing it through:
  a driver holds at most one live ride at a time, and a second ride can only become `'accepted'`
  for that driver *after* the first has already left that state — which, because Postgres
  transactions are atomic, means the first ride's completion (MTD bump included) has already fully
  committed by then. **Two rides can no longer be racing toward completion for the same driver, at
  all, through any real code path.** The scenario that script proved is now structurally
  unreachable, not just harder to set up — no rewrite of its fixture can recreate it.
  `reserve_driver_month()`'s lock stays in the database regardless: `005_apply_ride_commission.sql`
  still exercises the CAS function's own logic directly (unaffected, since it never depended on
  two real rides existing), and the lock becomes load-bearing again the instant a future feature
  relaxes `rides_one_active_per_driver` — driver ride-queuing, should that ever ship, is exactly
  such a feature. This is a real gap between an ADR-0008 concurrency claim and an ADR-0013
  constraint that nothing connected at the time; nothing in either PR's own verification caught it
  because neither re-ran the other's concurrency script.
- No SQL function, RLS policy, or index changed. This PR is additive: one constraint, one trigger,
  and everything else is new application code calling what already existed.

## Out of scope, tracked

Driver decline · the cancellation-fee / grace-period feature (needs driver location and, per the
finding above, ride queuing — which would itself require relaxing `rides_one_active_per_driver`
and re-examining this ADR's "unreachable" claim) · realtime (a rider or driver still only learns
of a state change on reload) · dispatch/proximity matching · Stripe payouts · online/offline
toggle · MTD tier-progress visualization.

## Supersedes

Nothing. Extends ADR-0008 (the app finally calls what that ADR built, and this ADR's Consequences
section records where its concurrency claim and ADR-0013's constraint now interact), ADR-0011
(`duration_seconds` becomes derivable), ADR-0012 and ADR-0013 (mirrors their RLS-reads /
service-role-or-forwarded-token-writes posture for the completion half of the same lifecycle).
