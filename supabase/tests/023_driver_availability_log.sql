-- 20260907120000_create_driver_availability_log.sql — the history behind drivers.accepting_rides.
--
-- Two jobs here. The first is that the log is COMPLETE and APPEND-ONLY: a driver row logs the state
-- it starts in, every real change appends exactly one row, a non-change appends none, an unrelated
-- profile edit appends none, and the driver whose history it is cannot insert, edit or delete a
-- single row of it.
--
-- The second is the one that would break loudly in production if it regressed. The trigger writes
-- into a table `authenticated` has no INSERT grant on, so it only works because it is SECURITY
-- DEFINER — and the failure mode is not a missing log row, it is the Online/Offline toggle throwing
-- 42501 for every driver. Assertions 3 and 4 are that pair: the toggle still works, AND the row
-- landed. Drop `security definer` and 3 fails before 4 is ever reached.
--
-- Every denial below runs under `set local role authenticated` and is paired with a positive
-- control, the way 009_driver_accept.sql pairs its two halves — without the pair, a blanket denial
-- (the RLS equivalent of the table not existing) passes the same assertions.

begin;
select plan(16);

insert into auth.users (id) values
  ('f1000000-0000-0000-0000-000000000001'),  -- Driver A: the toggle driver
  ('f1000000-0000-0000-0000-000000000002'),  -- Driver B: the read-isolation control
  ('f1000000-0000-0000-0000-000000000003');  -- Driver C: synthetic history, for the durations

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values
  ('f1000000-0000-0000-0000-000000000001', 'Driver A', 'active', 'passed', 'passed'),
  ('f1000000-0000-0000-0000-000000000002', 'Driver B', 'active', 'passed', 'passed'),
  ('f1000000-0000-0000-0000-000000000003', 'Driver C', 'active', 'passed', 'passed');

create temporary table t_ids (label text primary key, id uuid) on commit drop;
insert into t_ids select 'driver_a', id from drivers where auth_user_id = 'f1000000-0000-0000-0000-000000000001';
insert into t_ids select 'driver_b', id from drivers where auth_user_id = 'f1000000-0000-0000-0000-000000000002';
insert into t_ids select 'driver_c', id from drivers where auth_user_id = 'f1000000-0000-0000-0000-000000000003';

-- Scaffolding only, so the switched-role queries below can resolve fixture ids.
grant select on t_ids to authenticated;

-- Driver C's history, written directly as the table owner at explicit past timestamps. It has to be
-- written this way: now() is TRANSACTION time, so every trigger-written row inside this pgTAP
-- transaction shares one timestamp and every interval derived from them would be zero.
-- C's own insert-trigger row sits at now() and is excluded from every window below by `changed_at
-- < p_to`.
insert into driver_availability_log (driver_id, accepting_rides, changed_at) values
  ((select id from t_ids where label = 'driver_c'), true,  now() - interval '8 hours'),
  ((select id from t_ids where label = 'driver_c'), false, now() - interval '5 hours'),
  ((select id from t_ids where label = 'driver_c'), true,  now() - interval '2 hours');

-- ---- The log has a floor, not a gap ------------------------------------------------------------

-- Without the INSERT trigger a driver who never touches the toggle has no history at all, and every
-- window over them is indistinguishable from "not yet created".
select is(
  (select count(*) from driver_availability_log
     where driver_id = (select id from t_ids where label = 'driver_a')),
  1::bigint,
  'creating a driver logs the state their availability starts in'
);

select is(
  (select accepting_rides from driver_availability_log
     where driver_id = (select id from t_ids where label = 'driver_a')),
  true,
  'and it records ADR-0019''s shipped default rather than an invented one'
);

-- ---- The toggle still works, and the row lands -------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

-- THE load-bearing pair. This is the assertion that fails — 42501, for every driver in production —
-- if anyone drops `security definer` from log_driver_availability().
select lives_ok(
  $$ update drivers set accepting_rides = false
       where auth_user_id = 'f1000000-0000-0000-0000-000000000001' $$,
  'a driver can still go offline with the logging trigger attached'
);

reset role;

select is(
  (select count(*) from driver_availability_log
     where driver_id = (select id from t_ids where label = 'driver_a')),
  2::bigint,
  'and the trigger wrote into a table authenticated has no INSERT grant on — SECURITY DEFINER'
);

select is(
  (select accepting_rides from driver_availability_log
     where driver_id = (select id from t_ids where label = 'driver_a')
     order by changed_at desc, accepting_rides asc limit 1),
  false,
  'the appended row records the state AFTER the change'
);

-- ---- What must NOT append ----------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

-- setAcceptingRides() does not read the current value first, so a double-tapped switch issues this
-- exact statement twice. The trigger's `when` clause is what keeps that one event instead of two.
update drivers set accepting_rides = false
  where auth_user_id = 'f1000000-0000-0000-0000-000000000001';

-- A profile edit must not churn the log either. Both assertions below are guarding the SAME
-- mechanism — the `when` clause — which is worth being explicit about: the trigger's `update of
-- accepting_rides` list looks like what keeps this edit out, but it is not observable from table
-- contents at all. Widening it to a bare `after update` leaves every assertion in this file
-- passing, because `when` filters the row anyway. Removing `when` fails both of these.
update drivers set phone = '+16195550100'
  where auth_user_id = 'f1000000-0000-0000-0000-000000000001';

reset role;

select is(
  (select count(*) from driver_availability_log
     where driver_id = (select id from t_ids where label = 'driver_a')),
  2::bigint,
  'setting accepting_rides to the value it already held appends nothing'
);

select is(
  (select count(*) from driver_availability_log
     where driver_id = (select id from t_ids where label = 'driver_a')),
  2::bigint,
  'and neither does editing an unrelated column on the same row — the log tracks one column'
);

-- ---- Append-only, from the subject's own side --------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ insert into driver_availability_log (driver_id, accepting_rides)
       select id, true from drivers where auth_user_id = 'f1000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'a driver cannot write their own availability history directly'
);

select throws_ok(
  $$ update driver_availability_log set accepting_rides = true $$,
  '42501',
  null,
  'nor edit it — an append-only log that its subject can rewrite is not a log'
);

select throws_ok(
  $$ delete from driver_availability_log $$,
  '42501',
  null,
  'nor delete from it'
);

-- ---- Reads are scoped to the owning driver -----------------------------------------------------

-- The positive control for the assertion below it: without this pair, a policy that hid EVERY row
-- would pass the isolation check just as well.
select is(
  (select count(*) from driver_availability_log),
  2::bigint,
  'a driver reads their own availability history'
);

select is(
  (select count(*) from driver_availability_log
     where driver_id = (select id from t_ids where label = 'driver_b')),
  0::bigint,
  'and cannot reach another driver''s'
);

-- ---- driver_online_seconds() -------------------------------------------------------------------

-- C was online from −8h to −5h (3h, wholly inside), offline −5h to −2h, and online from −2h with no
-- closing event. The window ends at −1h, so the open interval contributes 1h, not the 2h it would
-- if it ran to now(). 3h + 1h = 14400s.
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000003';

select is(
  driver_online_seconds(
    (select id from t_ids where label = 'driver_c'),
    now() - interval '10 hours',
    now() - interval '1 hour'
  ),
  14400::bigint,
  'closed intervals count whole, and an interval still open at the window''s end clamps to it'
);

-- The control for the line above: same driver, same window, asked by someone else.
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

select is(
  driver_online_seconds(
    (select id from t_ids where label = 'driver_c'),
    now() - interval '10 hours',
    now() - interval '1 hour'
  ),
  0::bigint,
  'SECURITY INVOKER means the log''s own RLS is the whole access check — another driver sees 0'
);

reset role;

-- The window now OPENS mid-interval: C's −8h..−5h online run is only 1h inside it. 1h + the same
-- clamped 1h at the far end = 7200s. This is what proves greatest(changed_at, p_from) clamps rather
-- than counting an already-open interval whole.
select is(
  driver_online_seconds(
    (select id from t_ids where label = 'driver_c'),
    now() - interval '6 hours',
    now() - interval '1 hour'
  ),
  7200::bigint,
  'an interval already open when the window opens is clamped to p_from, not counted whole'
);

-- B has only their creation row, at now(), which no window ending in the past includes.
select is(
  driver_online_seconds(
    (select id from t_ids where label = 'driver_b'),
    now() - interval '10 hours',
    now() - interval '1 hour'
  ),
  0::bigint,
  'a driver with no history in the window contributes 0, not a fabricated default or a null'
);

select * from finish();
rollback;
