-- 20260902130000_enable_driver_availability.sql, proved rather than assumed.
--
-- Two jobs here. The first is the ordinary one: `accepting_rides` defaults on, a driver can flip
-- their own and nobody else's, and the column-level UPDATE grant that lets them do it did NOT
-- quietly widen to cover `status` or the Stripe columns on the way.
--
-- The second is to pin a PRODUCT decision into the database. ADR-0019 says an offline driver still
-- sees the whole open board — offline blocks accepting, not looking. The obvious "improvement"
-- someone will propose later is one line adding `and accepting_rides` to
-- `rides_select_open_requests_as_active_driver`, which would silently reverse that. The last
-- assertion here is what makes them argue with a failing test instead.
--
-- Note on `lives_ok` in this file: an RLS-refused UPDATE affects zero rows and does NOT throw, so
-- `lives_ok` alone proves nothing about whether a write landed. Every write below is therefore
-- followed by a read of the value it claimed to change — including the ones that set up a later
-- assertion, since a silently-refused setup is exactly how a test passes for the wrong reason.

begin;
select plan(11);

insert into auth.users (id) values
  ('d7000000-0000-0000-0000-000000000001'),  -- Driver A, active and vetted
  ('d7000000-0000-0000-0000-000000000002'),  -- Driver B, active and vetted
  ('d7000000-0000-0000-0000-000000000003');  -- Rider, so there is something on the board

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values
  ('d7000000-0000-0000-0000-000000000001', 'Driver A', 'active', 'passed', 'passed'),
  ('d7000000-0000-0000-0000-000000000002', 'Driver B', 'active', 'passed', 'passed');

create temporary table t_ids (label text primary key, id uuid) on commit drop;
insert into t_ids select 'driver_b', id from drivers where auth_user_id = 'd7000000-0000-0000-0000-000000000002';

insert into rides (rider_id, driver_id, status, fare_cents)
values ('d7000000-0000-0000-0000-000000000003', null, 'requested', 1240);

-- Scaffolding only, so the switched-role queries below can resolve fixture ids.
grant select on t_ids to authenticated;

-- ---- The default -----------------------------------------------------------------------------

-- Not a formality: `default true` is what makes deploying this feature behaviour-preserving for
-- every driver who could already accept. Flipping it to `false` would silently stop every existing
-- driver from working, with no notification (ADR-0019).
select is(
  (select accepting_rides from drivers where auth_user_id = 'd7000000-0000-0000-0000-000000000001'),
  true,
  'a new driver row starts accepting rides, so the feature only ever removes capability'
);

-- ---- A driver writes their own flag, and only that -------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'd7000000-0000-0000-0000-000000000001';

select lives_ok(
  $$ update drivers set accepting_rides = false
       where auth_user_id = 'd7000000-0000-0000-0000-000000000001' $$,
  'a driver may issue an update against their own accepting_rides'
);

select is(
  (select accepting_rides from drivers where auth_user_id = 'd7000000-0000-0000-0000-000000000001'),
  false,
  'and it actually lands — the grant covers this column, so the write is not silently refused'
);

select lives_ok(
  $$ update drivers set accepting_rides = true
       where auth_user_id = 'd7000000-0000-0000-0000-000000000001' $$,
  'and they may turn it back on'
);

select is(
  (select accepting_rides from drivers where auth_user_id = 'd7000000-0000-0000-0000-000000000001'),
  true,
  'which also lands — going offline is not a one-way door'
);

-- The assertion that closes a standing gap: this grant has existed since the first migration with
-- no test and, until ADR-0019, no caller at all.
--
-- `suspended`, deliberately, NOT `active`: on an already-vetted driver both are CHECK-legal, so a
-- failure here can only be the missing column grant (42501). Testing `active` on an unvetted
-- fixture could trip `drivers_activation_gate` (23514) instead and pass for the wrong reason.
select throws_ok(
  $$ update drivers set status = 'suspended'
       where auth_user_id = 'd7000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'a driver still cannot write their own status — availability joined the grant, compliance did not'
);

-- The same guard for the other half of the excluded list. Together these two are the regression
-- test for the migration's stated anti-goal: a future table-level `grant update on drivers to
-- authenticated` would erase both, and would fail here.
select throws_ok(
  $$ update drivers set stripe_payouts_enabled = true
       where auth_user_id = 'd7000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'nor Stripe''s word about their payout account'
);

-- ---- One driver cannot reach another's flag ---------------------------------------------------

-- Zero rows, not an error: the column grant is table-wide, and `drivers_update_own`'s USING clause
-- is what excludes the row. It cannot be verified from inside this session either —
-- `drivers_select_own` hides driver B from any SELECT driver A could run — so the proof is the
-- read after `reset role`.
select lives_ok(
  $$ update drivers set accepting_rides = false
       where id = (select id from t_ids where label = 'driver_b') $$,
  'driver A may issue an update naming driver B, and it simply matches nothing'
);

reset role;

select is(
  (select accepting_rides from drivers where auth_user_id = 'd7000000-0000-0000-0000-000000000002'),
  true,
  'driver B is untouched — RLS scoped driver A''s update to their own row'
);

-- ---- The board stays visible while offline ----------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'd7000000-0000-0000-0000-000000000002';

update drivers set accepting_rides = false
  where auth_user_id = 'd7000000-0000-0000-0000-000000000002';

-- Verifying the precondition, not padding the count. If this write were silently refused, the
-- assertion below would be testing an ONLINE driver's view and would pass meaninglessly.
select is(
  (select accepting_rides from drivers where auth_user_id = 'd7000000-0000-0000-0000-000000000002'),
  false,
  'driver B is genuinely offline before the board is checked'
);

-- THE anti-goal assertion. If someone adds `and accepting_rides` to
-- `rides_select_open_requests_as_active_driver`, this is what fails.
select is(
  (select count(*) from rides where status = 'requested' and driver_id is null),
  1::bigint,
  'an OFFLINE active driver still sees every open request — offline blocks accepting, not looking'
);

reset role;

select * from finish();
rollback;
