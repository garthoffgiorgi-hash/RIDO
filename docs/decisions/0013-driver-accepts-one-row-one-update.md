# ADR-0013 — Driver accepts: one row, one conditional UPDATE

**Date:** 2026-08-30
**Status:** Accepted

## Context

A rider can book a ride (ADR-0012). Nothing can accept one. `complete-ride` has been built,
tested, and deployed since ADR-0008 and has still never been exercised against a real ride,
because nothing ever produces an `'accepted'` row for it to finish.

Exploration before any code was written turned up a blocker that made this more urgent than "the
next feature": **a driver could not see an unassigned ride at all.** `rides_select_own_as_driver`
reads `driver_id in (select id from drivers where auth_user_id = auth.uid())`. With `driver_id`
now nullable (ADR-0012), that expression evaluates to `NULL` for every open request — SQL's
three-valued logic, not a bug in the policy — and RLS treats anything that isn't `TRUE` as a
refusal. `002_rides_rls_isolation.sql` never caught it because every existing fixture binds a
driver at insert. So the rides the booking flow creates were, by construction, invisible to every
driver until this migration.

Three more gaps, all real: nothing had ever written `accepted_at`; there was no index on `status`,
so listing open requests would be a seq scan; and nothing stopped one driver from holding two
`'accepted'` rides at once — no mirror of `rides_one_active_per_rider` existed on the driver side.

Scope is **accept only** — a list of open requests showing what the driver would keep, and the
accept itself. No online/offline toggle (availability means little while drivers pull from a list
rather than dispatch pushing to them), no MTD tier-progress visualization, no decline, no
`accepted → in_progress` transition, no proximity or matching.

## Decision

### 1. A PERMISSIVE policy opens the pool to active drivers; two indexes serve it

```sql
create policy rides_select_open_requests_as_active_driver
  on rides for select to authenticated
  using (
    driver_id is null and status = 'requested'
    and exists (select 1 from drivers where auth_user_id = (select auth.uid()) and status = 'active')
  );
```

PERMISSIVE, so it ORs with `rides_select_own_as_rider` and `rides_select_own_as_driver` rather than
narrowing either — an active driver sees their own rides *and* the open pool. It deliberately
exposes every open request to every active driver: that is what a dispatch board is, and at pilot
volume it's correct. Proximity filtering isn't possible anyway — `pickup_geog` is null on every
row, ADR-0011's deferral. `rides_open_requests_idx` (partial, on `requested_at`, matching the idiom
the geog and completed_at indexes already use) serves the policy's own query.

`rides_one_active_per_driver` — a unique index on `driver_id` where `status in ('accepted',
'in_progress')` — is the driver-side mirror of `rides_one_active_per_rider`. It is total, not
partial-on-a-nullable-key: `rides_driver_present_unless_pending` already guarantees `driver_id` is
never null in either status it covers.

### 2. Accept is one conditional UPDATE. No lock, no CAS, no new SQL function.

ADR-0008 needed a compare-and-swap and a held lock because completing a ride touches *two* rows —
the ride and the driver's month rollup — and nothing else serializes two different rides against
each other. Accept touches **one row**:

```sql
update rides set driver_id = $1, status = 'accepted', accepted_at = now()
where id = $2 and status = 'requested' and driver_id is null
```

Postgres makes this atomic on its own: two drivers racing the same ride serialize on the row lock
their UPDATEs both need. The loser's statement blocks until the winner commits, then re-evaluates
its `WHERE` clause against the committed row, matches nothing, and returns zero affected rows —
no error, no retry loop, no lock acquired by application code. Reaching for ADR-0008's machinery
here would be copying a solution to a problem this doesn't have. Proved by
`supabase/tests/concurrent-accept-ride.sh`: two real connections race one ride under a held-open
transaction, and the loser both returns zero rows and genuinely blocked rather than losing the race
by luck.

`acceptRide()` (`apps/web/src/lib/rides/server.ts`) reads the ride's current state through the
**service role** first — not RLS, since an already-taken ride is invisible to the losing driver
under the new policy, and a useful refusal message needs to tell "taken" apart from "does not
exist." `canAcceptRide()` (`apps/web/src/lib/rides/accept.ts`, pure, mirrors the shape of
`supabase/functions/complete-ride/core.ts`'s `authorizeCompletion` without importing it — its ownership check is
backwards for accept, where the ride has no driver yet) turns that into a fast, friendly refusal.
That read-then-decide is advisory: two drivers can both pass it in the same instant. What actually
decides the race is the UPDATE's `WHERE` clause. Zero rows updated despite an `allowed` decision
means the read was already stale — surfaced as "Another driver already accepted this ride," the
same message `ride_taken` produces.

### 3. Reads are RLS; the write is the service role. Same posture as booking.

`listOpenRequests()` reads through the RLS-scoped client — the new policy is what makes this return
anything at all for an active driver, and nothing for a pending or suspended one.
`rides` gets **no new `authenticated` write grant.** Accept goes through
`createServiceRoleClient()`, the posture ADR-0012 set for booking and `supabase/CLAUDE.md`'s
standing note that driver accept "decides its own write path rather than inheriting one."

### 4. "You keep $X (Y%)" is computed live, not read from a snapshot

A requested ride has no commission snapshot — that's written at completion (ADR-0008) — so
`apps/web/src/lib/commission/` reads what the database says is in force (`active_commission_tiers()`,
granted to `authenticated` for exactly this reason) and this driver's month-to-date gross
(`driver_monthly_stats`, read directly through RLS rather than the service-role-only
`driver_month_to_date()` RPC, whose own migration comment explains why a driver calling it for
someone else's id would silently get `0`), then hands both to `commissionForRide` — the same
function `complete-ride` uses. Every candidate in the open pool is priced against the **same**
current MTD figure, read once: they're alternatives a driver is choosing between, not a sequence
where accepting one changes what the next is worth.

## Consequences

- **The RLS-NULL trap is worth naming for the next nullable column.** A policy of the form
  `column in (subquery)` silently refuses every row where `column IS NULL`, because SQL's
  three-valued logic makes the comparison neither `TRUE` nor `FALSE` — and RLS treats anything
  short of `TRUE` as a refusal. It will not show up in tests unless a fixture actually leaves that
  column null; `002_rides_rls_isolation.sql` didn't, until this migration's own driver-accept
  fixtures did.
- **`complete-ride` is finally exercisable end to end.** Nothing before this PR ever produced an
  `'accepted'` row through the app; a driver can now accept a real booked ride and hand it to the
  completion path this repo has carried tested-but-unused since ADR-0008.
- Two dead type overrides (`RidesInsert`, `RidesUpdate`) and their casts are removed from
  `apps/web/src/lib/rides/server.ts` — `database.types.ts` was regenerated in an earlier commit,
  and both existed only to bridge a staleness gap that no longer exists.
- **Folded in:** `PlaceSearch` gains an `initialQuery` prop, seeded once (at mount, from whatever
  ride was already active) rather than kept in sync — the fix for a reported bug where canceling a
  ride *after* a page reload lost the typed addresses, because a reload rebuilds React state from
  the database, which stores address strings and deliberately no coordinates (ADR-0011). One tap
  re-selects; the coordinates genuinely cannot be restored, which is the honest ceiling here, not a
  workaround.

## Out of scope, tracked

Online/offline toggle · MTD tier-progress visualization · realtime updates (the rider sees an
accept on reload, not live) · dispatch/matching and proximity (`pickup_geog` is null on every row,
ADR-0011) · `started_at` and the `accepted → in_progress` transition · driver decline · Stripe.

## Supersedes

Nothing. Extends ADR-0008 (contrasts the one-row conditional UPDATE with completion's two-row
compare-and-swap), ADR-0011 (pickup/dropoff coordinates stay deferred), and ADR-0012 (mirrors its
RLS-reads/service-role-writes posture for the accept half of the same lifecycle).
