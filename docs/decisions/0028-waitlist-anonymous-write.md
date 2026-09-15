# ADR-0028 — Anonymous writes go through the service role, with zero grants as the RLS

**Status:** Accepted
**Date:** 2026-09-14

## Context

`RIDES_LIVE` gates booking/accepting/going-online behind compliance sign-off (ADR-0026), but
marketing can start now — a waitlist is where that traffic lands: an email and whether someone
wants to ride, drive, or both. Every existing write in this schema is either identity-gated by
`requireUser()` before it reaches the service role (`rides`, `riders`, `drivers`), or written by a
signed-in role's own narrow column grant (`drivers.accepting_rides`). A waitlist signup has
neither: it happens *before* an account exists, by definition, so there is no session to check
and no owning row to scope a policy to.

## Decision

**`waitlist_signups` carries RLS enabled but zero `CREATE POLICY` statements, and zero `GRANT` to
`anon` or `authenticated`.** The write goes through `createServiceRoleClient()` from
`apps/web/src/lib/waitlist/server.ts`, called from a Server Action with no `requireUser()` — there is
nobody to require. No grant at all is a *stronger* guarantee than an RLS policy that denies every
row: a role with no table-level privilege cannot query the table at all, versus a role that can
open a connection to it and get told no by a policy. `service_role` alone is granted `SELECT,
INSERT` (`supabase/CLAUDE.md`'s post-April-2026 explicit-grant rule, same as every other table).

**A duplicate email is success, not an error.** `waitlist_signups_email_unique` rejects the
second insert at the constraint; `joinWaitlist()` catches exactly `23505` and returns `ok: true`
regardless — resubmitting the same email is indistinguishable from the first time, from the
visitor's side. Every other error collapses to one generic message; there is nothing more
specific worth telling a visitor about their own waitlist signup failing.

**Email is normalised (trimmed, lowercased) in `apps/web/src/lib/waitlist/validate.ts` before it ever
reaches the database**, so the unique constraint is case-insensitive in effect without a `citext`
dependency — the same "normalise once, trust the schema after" shape `apps/web/src/lib/phone.ts` already
uses for `toE164()`.

## Consequences

- This is the first table in the schema with no RLS policy of any kind — `driver_availability_log`
  and the ledgers still let their own subject read a row; this lets nobody read anything except
  the service role. Worth naming explicitly so a future reviewer doesn't read the empty policy
  list as an oversight.
- A signed-in user who joined the waitlist before creating an account has no way to see that they
  did, through this table or any API surface — by design, not a gap. If a future feature ever
  wants to show someone "you're already on the list," it needs its own explicit read path (a
  Server Action checking by the signed-in user's own email, still through the service role), not a
  grant on this table.
- `apps/web/src/lib/waitlist/server.ts` casts past the generated `Database` type until the migration is
  pushed live and `database.types.ts` regenerated — the same two-step dance (and the same
  narrow-cast bridge, retired once types catch up) every prior migration in this repo has gone
  through.

## Supersedes

Nothing. Extends the service-role-write posture ADR-0012/ADR-0013 established for `rides` to a
case with no signed-in party to gate it on at all.
