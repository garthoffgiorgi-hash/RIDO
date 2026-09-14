-- 20260914120000_create_waitlist_signups.sql — a table with no policy at all, on purpose.
--
-- The property under test is the one the migration's own comment claims: neither `anon` nor
-- `authenticated` can reach this table AT ALL, not even to see it deny them a row. That is a
-- stronger claim than "RLS hides every row", and the way to prove it is the same 42501
-- permission-denied error `driver_availability_log`'s append-only assertions use — a role with no
-- GRANT cannot even attempt the statement, so every one of these throws before RLS is consulted.
--
-- The positive control is `service_role`, which the app's own writer (src/lib/waitlist/server.ts)
-- runs as — without it, a blanket denial to every role, the table simply not existing, would pass
-- every assertion below just as well.

begin;
select plan(9);

-- ---- The app's own writer can do its job ---------------------------------------------------

select lives_ok(
  $$ insert into waitlist_signups (email, interest) values ('rider@example.com', 'rider') $$,
  'service_role can insert a signup'
);

select is(
  (select count(*) from waitlist_signups where email = 'rider@example.com'),
  1::bigint,
  'and the row is really there'
);

select throws_ok(
  $$ insert into waitlist_signups (email, interest) values ('rider@example.com', 'driver') $$,
  '23505',
  null,
  'a second signup with the same email is rejected at the constraint, not silently duplicated'
);

select throws_ok(
  $$ insert into waitlist_signups (email, interest) values ('bad@example.com', 'passenger') $$,
  '23514',
  null,
  'an interest outside rider/driver/both is rejected — this is the backstop, not the only check'
);

-- ---- anon has no grant on this table at all --------------------------------------------------

set local role anon;

select throws_ok(
  $$ select * from waitlist_signups $$,
  '42501',
  null,
  'anon cannot even attempt to read the table — no GRANT, not just an RLS denial'
);

select throws_ok(
  $$ insert into waitlist_signups (email, interest) values ('anon@example.com', 'rider') $$,
  '42501',
  null,
  'anon cannot insert either — the write goes through the service role from a Server Action'
);

reset role;

-- ---- authenticated has no grant either — signing up later reads nothing about who joined ------

-- No real auth.users/JWT fixture needed: no policy on this table ever consults auth.uid(), so
-- the role alone (its GRANTs, or lack of them) is the entire thing under test.
set local role authenticated;

select throws_ok(
  $$ select * from waitlist_signups $$,
  '42501',
  null,
  'a signed-in user cannot read who joined the waitlist, including their own past signup'
);

select throws_ok(
  $$ insert into waitlist_signups (email, interest) values ('authed@example.com', 'driver') $$,
  '42501',
  null,
  'nor insert directly — the same write path as anon, service role only'
);

select throws_ok(
  $$ delete from waitlist_signups $$,
  '42501',
  null,
  'nor delete'
);

reset role;

select * from finish();
rollback;
