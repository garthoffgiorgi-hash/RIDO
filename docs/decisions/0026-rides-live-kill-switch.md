# ADR-0026 — A fail-safe switch stops the app from operating as a TNC before it's licensed to

**Status:** Accepted
**Date:** 2026-09-10

## Context

The owner wants the public app — marketing, signup, login, `/account` — live on a real domain now.
Two items on `docs/roadmap.md`'s "Blocked on people, not code" table are still open: a commercial
TNC insurance quote, and the Prop 22 × "drivers set fares" classification question, both requiring
a broker and a CA transportation attorney respectively. `docs/compliance/ca-tnc.md` flags both
"urgent" under its own "Two professional flags (do not wing these)" section, and RIDO holds no
CPUC TNC permit today — the doc only describes one as something RIDO "should" apply for.

**This ADR is an engineering gate, not a legal determination, and every artifact it produces says
so.** Setting `RIDES_LIVE=true` asserts nothing about permit or insurance status; it only stops
enforcing a block that exists today. Whether flipping it is actually safe to do is a call for the
same two people already on the roadmap's blocked table — this decision does not, and cannot,
resolve that question in code.

**The scope is three actions, not two.** `ca-tnc.md`'s insurance table has a "Period 1" tier —
*"App on, no ride accepted"* — carrying its own required coverage ($50k/$100k/$30k + $200k excess).
A driver merely going **online** may itself be the regulatory trigger, independent of whether a
ride is ever dispatched. So this gate covers booking, accepting, and going online — not just the
two that move money.

## Decision

**`RIDES_LIVE`, a plain server env var, exact-match `"true"` to enable, everything else disabled.**
Same family as `CRON_SECRET`/`STRIPE_WEBHOOK_SECRET` (ADR-0025) — a value that gates a code path
and must fail toward refusal — not the family `commission_tiers`/`fare_rate_cards` belong to.
Those are business config expected to change routinely and must be tunable without a deploy; this
is a legal gate expected to flip exactly once, deliberately, where getting it wrong means operating
without a permit. A DB-backed flag is one `UPDATE` away from an accident — a console query, a seed
script, a migration default. An env var forces a deliberate, logged, human act — a dashboard edit
or a deploy — with no legitimate way to happen by accident.

```ts
export function parseRidesLive(rawValue: string | undefined): boolean {
  return rawValue === "true";
}
```

Unset, `""`, `"false"`, `"0"`, `"TRUE"`, trailing whitespace — everything but the exact literal
resolves to disabled. This is the same posture `apps/web/src/app/api/cron/sweep-stuck-money/route.ts`
already takes toward `CRON_SECRET`: *"a missing secret must never degrade into an open endpoint"* —
here, a missing or malformed flag must never degrade into live rides.

**Three gates, placed after `requireUser()` in each, matching this repo's existing security-boundary
ordering rather than reordering it to save a cheap session lookup:**

- `requestRide()` (`apps/web/src/lib/rides/server.ts`) — a new `"not_live"` `RequestRideOutcome`
  variant, checked before any read or write. Confirmed safe: the function's first side effect is
  the `rides` INSERT; everything before it is a read.
- `acceptRide()` (same file) — `return failed(RIDES_NOT_LIVE_MESSAGE)` through the existing
  `RidesResult<null>` shape five other functions in the file already share. No dedicated
  discriminant: the case is already fully covered by the page-level swap below, and widening a
  shared result type for one already-covered case would be the "bolted on awkwardly" this repo's
  own conventions warn against.
- `setAcceptingRides()` (`apps/web/src/lib/drivers/server.ts`) — refuses only `accepting === true`
  when rides aren't live, the Period-1 trigger named above. Going offline (`accepting === false`)
  is **never** blocked; a driver must always be able to take themselves off the board, the same
  "availability gates new work, never committed work" principle ADR-0019 already established.

**Nothing else needs gating.** `startTrip`, `completeRide`, `cancelRide`, `declineRide`, and
`quoteCancellation` all require a `rides` row already `requested`/`accepted`/`in_progress` — rows
that can only exist if `requestRide`/`acceptRide` already ran while the flag was on. A ride already
in flight when the flag flips off can still be finished, deliberately: stranding a rider mid-trip
over a legal flag flip is worse than letting an already-accepted ride complete.

**Quoting stays ungated at the function level.** `quoteRideRequest()` is read-only — no DB write, no
Stripe call — and isn't one of the three actions that constitute operating. It becomes unreachable
through the real page anyway once the UI swap below removes its only public caller, which is the
conservative outcome without conflating "showing a price" with "operating" at the architecture
level.

**UI swapped at the existing decision point, not wrapped around it.** `(rider)/request/page.tsx`
and `(driver)/drive/page.tsx` each already decide what to render for a signed-in user; when
`!ridesAreLive()`, that decision resolves to a `RidesNotLiveCard` instead of the booking sheet or
the dispatch board. The compliance-status card, `TierProgress`, and `PayoutCard` on `/drive` stay
visible regardless — vetting and historical payout data are not new dispatch, and the owner
explicitly wants the vetting flow to remain public.

## Consequences

- The public app — marketing, signup, login, `/account`, driver compliance vetting — can go live
  on the real domain today with zero risk of a real ride being booked, accepted, or a driver going
  online, as long as `RIDES_LIVE` is left unset.
- Flipping it live is a single env var change with no other code path affected, and reverting it is
  equally immediate — no migration, no data cleanup, since no gated action leaves a partial write
  behind (confirmed: every gate sits before the function's first write).
- This does **not** make RIDO legally compliant to operate, and nothing in the code, this ADR, or
  any UI copy claims it does. The decision to flip `RIDES_LIVE=true` still requires the same
  sign-off `docs/roadmap.md`'s "Blocked on people, not code" table already names: the commercial-TNC
  insurance broker, and the CA transportation/employment attorney (`ca-tnc.md`'s "Two professional
  flags" section names the identical two).
- A driver's compliance vetting (background check, vehicle inspection) can proceed and complete
  while rides are gated off — vetting is not itself a Period-1 trigger, only going online is.

## Supersedes

Nothing. Extends the fail-safe posture ADR-0025 established for `CRON_SECRET` to a different kind
of gate, and the "availability gates new work, never committed work" principle ADR-0019 established
for `accepting_rides`.
