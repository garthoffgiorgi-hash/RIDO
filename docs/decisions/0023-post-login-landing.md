# ADR-0023 — A sign-in lands where the ride is, not where the identity is

**Status:** Accepted
**Date:** 2026-09-08

## Context

Every sign-in has landed on `/account`, for everyone, always, since before `/request` or `/drive`
did anything. The deferral was recorded in three places, in escalating detail. Root `CLAUDE.md`:

> Post-login redirect still always lands on `/account` — both `/request` and `/drive` have real
> functionality now, but landing a rider straight into a live map, or a driver straight into a
> dispatch board, on every sign-in isn't obviously right either.

`apps/web/CLAUDE.md`, sharper about the shape of the refusal:

> `/account` is the one post-login landing page for everyone — deferred deliberately … Role-aware
> in *content* …, not in *where login sends you*.

And the original reasoning, sitting in `apps/web/src/app/account/page.tsx`'s own docstring:

> neither `/request` nor `/drive` has real functionality yet, so there's nowhere more specific to
> send anyone.

That reasoning is now false — both have had real functionality since ADR-0012/0013/0014, and both
have been realtime since ADR-0020/0021 — but the *objection* underneath it was never really about
functionality. It was about **guessing**: routing a rider into a map or a driver into a dispatch
board because of who they are, rather than what they're doing. That objection is still correct,
and this ADR does not reverse it. It answers it.

**A structural fact makes the identity-split reading unavailable regardless.**
`apps/web/CLAUDE.md`'s rule: "No `role` column exists or should be added … a page shows or hides
content per identity; it never forces a choice between them." A person can be a rider and a driver
at once. "Route a driver to `/drive`, a rider to `/request`" has no defined answer for that person
— it would need the tiebreak this ADR needs anyway, just for a weaker reason.

## Decision

**A plain sign-in lands on the surface where a live ride is happening, else `/account` — today's
behaviour, unchanged.** A ride in flight is a *fact* about what someone is doing right now, not a
guess about which identity they favour. That is the entire difference between this and the
identity split the objection above already ruled out, and it is why this ADR can answer that
objection rather than quietly reverse it.

```
explicit `next` present?  → that destination, always
driver side has a live ride ('accepted' | 'in_progress')?  → /drive
rider side has a live ride ('requested' | 'accepted' | 'in_progress')?  → /request
otherwise  → /account
```

**Driver side wins the rare both-at-once tiebreak.** A passenger waiting on you is the higher
obligation than your own ride finishing itself out.

### Where the decision lives, and why not the obvious places

**Not `proxy.ts`.** It performs zero database reads today — only the session-refresh
`supabase.auth.getUser()` call its own header warns not to reorder anything around. A ride check
there would be paid on every navigation under `PROTECTED_PREFIXES`, not once at sign-in.

**Not `/account`.** It must stay directly visitable and stay the chooser it already is — the one
surface that shows a rider card, a name card, a payment card, and a driver card together. Folding
the landing decision into it would conflate "the page you can always reach" with "the page you're
sent to once."

**A new Route Handler, `/auth/landing`, not a Server Component calling `redirect()`.** A page-level
redirect sits behind the root `loading.tsx` and streams as a 200 plus a client-side navigation —
the exact failure `proxy.ts`'s own header names as its reason for existing. This is that same fix
applied to the authenticated side: every place that used to send someone straight to `/account`
(`login`, `signup`, the email-link path through `/auth/confirm`) now sends them here instead, and
this is the one place that decides.

**Two narrow reads, not the two reads `/request` and `/drive` already have.** `getActiveRide()` and
`getDriverActiveRide()` are shaped for *rendering* — a driver card, a rider card, a live commission
figure computed against month-to-date — 2 and up to 4 round trips respectively, nearly all of which
a routing decision would discard. `hasActiveRiderRide()`/`hasActiveDriverRide()`
(`apps/web/src/lib/rides/server.ts`) select `id` alone. Each carries its own explicit ownership
filter (`rider_id`/`driver_id`), not `status` alone — `rides_select_open_requests_as_active_driver`
is PERMISSIVE and exposes every unassigned `requested` row to any active driver, so a read that
forgot the filter would risk answering the routing question with a stranger's ride. `driver_id`
comes from `drivers.id`, not `auth.uid()`, so the driver side costs a profile read first: 1 query
for a rider, up to 3 for a dual-identity driver. `rides_one_active_per_rider` and
`rides_one_active_per_driver` guarantee each side returns at most one row.

### The prerequisite this depended on

`/drive` had no navigation at all before this — no link to `/account`, none to `/request`, no
sign-out; its only `href` sat inside the non-driver empty state. Sending more people there directly
would have stranded more of them. Fixed first, in its own PR: a static `AppTopBar` in a new
`(driver)/layout.tsx`, and `RiderTopBar` refactored into a thin wrapper over the same component so
`/request`'s fixed, floating bar is unchanged.

### `next` still wins, and the interaction is deliberate

`proxy.ts`'s anonymous bounce, and the login↔signup cross-links, both still carry `?next=`
end to end — that plumbing predates this ADR and is untouched. An explicit `next` overrides the
ride check outright: someone who was headed somewhere specific gets there, whether or not a ride
happens to be live. `/auth/landing`'s own default (`apps/web/src/lib/auth/browser.ts`'s `DEFAULT_NEXT`) is
`/auth/landing` itself — so an email-confirmation link with nothing more specific requested still
resolves through the ride check on arrival, rather than hardcoding `/account` a second time.

## Consequences

- A rider mid-ride, or a driver mid-ride, signs back in on the surface their ride is actually
  happening on. Everyone else's sign-in is unchanged.
- `apps/web/src/lib/auth/landing.ts`'s `landingPath()` is pure and tested independent of the two
  reads that feed it — the policy and the I/O are two different kinds of correctness, tested
  separately.
- `apps/web/src/app/account/page.tsx`'s docstring, and the three deferral passages quoted above, no longer describe
  the filesystem. Corrected in the same commit as this ADR, per root `CLAUDE.md`'s rule.
- No schema change, no migration. Every fact this reads already existed; only the query shape is
  new.
- The rider↔driver *switcher* this ADR does not build — a direct `/request` ↔ `/drive` toggle —
  remains a separate, undecided product question. `/account` is still the only place that shows
  both identities together.

## Supersedes

Nothing. Extends the "no `role` column, never forces a choice" rule `apps/web/CLAUDE.md` and
ADR-0022 already state, applying it to a decision (where sign-in lands) rather than reversing it.
