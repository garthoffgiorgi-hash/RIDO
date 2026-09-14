-- waitlist_signups — pre-launch interest, before RIDES_LIVE and before anyone has an account.
--
-- WHY THIS EXISTS. ADR-0026 gates booking/accepting/going-online behind RIDES_LIVE while
-- compliance clears, but marketing can start now — this is where that traffic lands: an email and
-- which side (rider/driver/both) they're interested in, nothing else.
--
-- WHY ZERO POLICIES. Every other table in this schema pairs RLS with at least a read-own policy;
-- this one has none at all, because there is no signed-in party to scope a policy to — a waitlist
-- signup happens BEFORE an account exists. `authenticated` gets no grant either: someone who later
-- signs up should not be able to read who else joined, or that they joined themselves, through this
-- table. `anon` gets no grant: the write goes through the service role from a Server Action
-- (src/lib/waitlist/server.ts), the same "write through the service role, RLS is not the front door"
-- posture `rides`/`riders`/`drivers` already use — the difference here is there is no `requireUser()`
-- to gate it with, because there is nobody to require. No grant at all is a stronger guarantee than
-- an RLS policy that denies every row: a role with no table-level privilege cannot query it at all.

create table waitlist_signups (
  id uuid primary key default gen_random_uuid(),

  -- Normalised (trimmed, lowercased) before it ever reaches this table — src/lib/waitlist/validate.ts
  -- is the one place that happens, so the unique constraint below is case-insensitive in effect
  -- without a citext dependency.
  email text not null,

  interest text not null check (interest in ('rider', 'driver', 'both')),

  created_at timestamptz not null default now(),

  -- Resubmitting is idempotent from the visitor's side (src/lib/waitlist/server.ts treats a
  -- conflict as success, never an error) — this constraint is what makes that safe rather than a
  -- silent duplicate.
  constraint waitlist_signups_email_unique unique (email)
);

comment on table waitlist_signups is
  'Pre-launch lead capture — an email and a rider/driver/both interest, written only by the '
  'service role. No RLS policy of any kind, and no GRANT to anon or authenticated: nobody is '
  'signed in when this is written, so there is no party to scope a read to, and a later account '
  'should not be able to read who joined via this table. ADR-0028.';

alter table waitlist_signups enable row level security;

-- No CREATE POLICY, deliberately — see the table comment. RLS is still enabled (root CLAUDE.md:
-- "RLS on every table"), it simply has nothing to permit; the enforcement here is the GRANT below.
grant select, insert on waitlist_signups to service_role;
