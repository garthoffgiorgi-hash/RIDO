# ADR-0019 — The driver controls their own queue

**Date:** 2026-09-02
**Status:** Accepted

## Context

`/drive` gives a driver exactly one lever: Accept. Every active driver sees every open request,
always, and the only way to refuse one is to not tap it. Two controls have been deliberately absent,
and this repo recorded *why* in two places:

> No online/offline toggle (**availability means little while drivers pull from a list rather than
> dispatch pushing to them**), no MTD tier-progress visualization, no decline.
> — `0013-driver-accepts-one-row-one-update.md`

> Not built: the online/offline toggle …, month-to-date earnings and tier-progress visualization,
> and decline (**there's no reason yet to refuse one request in favor of scanning for another**).
> — `../../brand/design-system.md`

Both were right when written, and both are weaker now. `/drive` is no longer a proving surface: a
driver accepts real rides through it and is paid real money for them (ADR-0015, ADR-0017). The
marketing site has been promising the toggle since launch — *"Go online when you want. Flip on,
drive on your terms. No quotas, no forced hours, no penalties"* — which the product cannot currently
honour. And `../../brand/design-system.md` has specified the control all along: *"Driver
online/offline as a clear switch; online = Signal."*

The pull-model argument in particular deserves a straight answer rather than a silent reversal. It
is still true that nothing pushes work at a driver, so an offline driver and a driver who simply
closed the tab are operationally identical today. What availability adds now is not dispatch
mechanics but **intent, stated once and honoured by the server** — and a column that exists before
the matching query does, so proximity dispatch inherits a working answer to "who wants work right
now" rather than having to invent one and backfill it.

## Decision

### 1. Availability is a column on `drivers`, and the driver writes it themselves

`accepting_rides boolean not null default true`, added to the **existing** column-level UPDATE
grant that `20260821120200_create_drivers.sql` created for exactly this class of column.

That grant list is the whole reason a driver can change their own phone number but not their own
`background_check_status`. The payouts migration recorded the test for membership: the `stripe_*`
columns stay out because they are *"facts about an external system that a driver must not be able to
assert about themselves."* Availability is the mirror image — a statement of intent that **only**
the driver can ever truthfully make.

That gives the general rule this decision contributes:

> **One writer forever → column grant. Possibly-many writers → service role.**

Because availability has exactly one writer by definition, the grant is the right mechanism, and it
buys a guarantee the service role cannot: the database itself ensures a driver can only ever flip
*their own* flag, even if `setAcceptingRides()` is later refactored and forgets to scope its `where`.

**The name is not `is_online`.** House style carries no `is_` prefix (`training_completed`,
`fee_active`, `stripe_payouts_enabled`), and more importantly "online" is a UI word that would
promise more than the column delivers: an offline driver here is not invisible, not unreachable, and
not off the board. `accepting_rides` says the one thing that is actually true, and stays true after
dispatch exists.

### 2. It defaults to `true`, and dispatch is when to revisit that

Opt-in has safety value when being opted *in* does something to you — a notification, an obligation,
a queue you get pushed work from. None of those exist: being "online" today does nothing but un-grey
a button on a page the driver is already looking at.

So `default false` would buy no safety and cost a silent regression — every existing driver's Accept
button stops working, with no notification, until they find a control they have never seen. `default
true` is a catalog-only change with no table rewrite, and it makes the deployment
behaviour-preserving: this feature only ever *removes* capability, and only when a driver asks it to.

The honest cost: `true` on a driver who has not opened the app in a month claims an availability that
isn't real. **That claim currently has no reader** — nothing consumes the flag except that driver's
own accept path. The moment dispatch exists it gains one, and that is the moment to revisit this
default, not now.

### 3. Offline blocks accepting. It does not hide the board, and it does not touch RLS

An offline driver still sees every open request — they can judge whether demand is worth coming
online for. Accept is what gets refused.

The consequence worth stating plainly: **`rides_select_open_requests_as_active_driver` does not
change, at all.** Availability lives entirely outside RLS.

### 4. Availability gates taking new work, never finishing committed work

A driver may go offline mid-ride; it means "send me nothing else," not "abandon this rider." So the
check belongs in `canAcceptRide()` and **nowhere else** — explicitly not in `canStartTrip()`, and not
in the completion path. That is true by accident today, because neither consults the driver's
availability. This makes it true on purpose.

### 5. A decline is a per-driver row, and it is permanent

`ride_declines (driver_id, ride_id, declined_at)`, composite primary key, driver first. Declining
hides that request **from that driver only** — it stays in the open pool for everyone else, and
nothing about the ride row changes. There is no expiry and no sweep: a re-decline is
`on conflict do nothing`, the same idempotence idiom `queue_driver_payout` uses.

Unlike availability, this one goes through the **service role**, applying the rule from §1 in the
other direction: a decline has plausible future writers that are not the driver — auto-decline on a
dispatch timeout, an admin clearing a driver's declines, a "decline everything while offline"
convenience. Granting `authenticated` INSERT now would have to be walked back later, and it would be
this repo's first authenticated write grant on a rides-adjacent table, against `apps/web/CLAUDE.md`'s
standing rule that every `rides` write goes through `src/lib/rides/`.

Foreign keys **cascade** rather than restrict, which is the `rider_payment_profiles` reasoning: this
is a preference, not a financial record. It is also what keeps an `undeclineRide()` trivially
addable — deleting a preference row is a normal operation in a way that deleting a ledger row is not.

### 6. Neither half is enforced in the database, and that is consistent

Accept writes through the service role, so RLS is bypassed at the write site regardless. But the
stronger argument is that **`drivers.status` — a root-invariant-6 compliance field — is already
enforced only in app code at that same site.** `acceptRide()`'s conditional `UPDATE` predicates on
`status = 'requested' AND driver_id IS NULL` and never references the driver's row at all; the
database's contribution to invariant 6 at accept time is indirect (`drivers_activation_gate` stops a
driver *becoming* active, the open-pool policy stops a non-active driver *seeing* the pool).

If app-level enforcement is accepted for the compliance invariant, it is certainly accepted for a
preference flag. `canAcceptRide()` is the right and only place.

**The stale-tab race needs no fix.** `acceptRide()` calls `getOwnDriverProfile()` on every
invocation, which is a fresh read of the whole row — so availability is evaluated at accept time, not
carried from whenever the page rendered. The residual window (going offline in another tab between
that read and the `UPDATE`) is milliseconds wide, and its worst outcome is one ride accepted a moment
after going offline. The identical window already exists for `driver.status`, and this repo shipped
it.

## Consequences

- **Three anti-goals, each of which will look like an improvement later.** Adding `accepting_rides`
  to the open-pool RLS policy is one line that silently reverses §3 — a pgTAP assertion that an
  offline driver still sees every open request pins that decision in the database, where the next
  person has to argue with it. Coupling the flag to `rides_one_active_per_driver` (auto-`false` on
  accept, auto-`true` on completion) would make it mean driver intent and system state at once.
  Adding a defensive ride-status check to `declineRide()` would introduce a failure mode where there
  is currently none — declining a ride another driver just accepted is inert, since the row only
  filters a pool that ride has already left.
- **No concurrency script.** This adds no lock and no claim, so there is no race to prove — unlike
  ADR-0013, ADR-0016 and the completion path, which each have one. Stated here so the absence reads
  as a decision rather than an omission.
- **`drivers.updated_at` now churns with availability**, not just profile edits. Harmless today;
  wrong the day something reads that column as "when did this driver last change their details."
- **`ride_declines` grows without bound.** The only reaper is the cascade from `rides`, and rides are
  never deleted. Irrelevant at pilot volume, and the reason the open-pool read scopes its decline
  lookup to the candidate rides rather than reading a driver's whole history.
- **The decline filter itself gets no automated test.** It is I/O glue in `apps/web/src/lib/rides/server.ts`, which
  ADR-0007 does not require to be tested, and pgTAP cannot see JavaScript. Extracting a pure
  `excludeDeclined()` purely to have something to assert would be a `Set.has` in a wrapper. Named
  here so it reads as a decision.
- **A standing test gap closes on the way.** The column-level UPDATE grant on `drivers` has existed
  since the first migration with no test and no caller — this is the first code to write to that
  table, and `017_driver_availability.sql` is the first proof the grant's shape is what the comment
  claims.
- **Decline is one tap and permanent, with no undo in the product.** The affordance is therefore
  deliberately subordinate — a small ghost control, not a second full-width button under Accept,
  which on a phone would make a mis-tap destroy a driver's access to a ride they wanted.

## Out of scope, tracked

`undeclineRide()` and any decline history a driver can review · auto-decline on a dispatch timeout ·
declines expiring · MTD tier-progress visualization (the third item in ADR-0013's deferral, still
deferred) · dispatch and proximity matching, which is what makes availability load-bearing rather
than advisory · realtime, so a driver still learns the board changed by reloading · a driver-side
"pause for 15 minutes" distinct from going fully offline.

## Supersedes

Nothing outright. Supersedes the scope note in
`0013-driver-accepts-one-row-one-update.md` that deferred both controls, and answers its stated
reasoning rather than reversing it silently — see Context. Extends ADR-0006 (`src/lib/drivers/`
gains its first write) and leaves ADR-0013's accept mechanism, including the conditional `UPDATE`
that decides races between two drivers, entirely unchanged.
