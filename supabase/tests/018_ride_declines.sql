-- 20260902130100_create_ride_declines.sql, proved rather than assumed.
--
-- The property this table exists for is a negative one: declining is ONE driver's opinion and must
-- never look like a withdrawal of the rider's request. So most of what follows checks that
-- declining changed nothing it shouldn't — not the ride's status, not its `driver_id`, and not what
-- any other driver can take.
--
-- The write path runs with the connection's own privileges rather than a switched role, matching
-- `009_driver_accept.sql`: declines are written by the service role from `declineRide()`, and
-- `authenticated` deliberately holds no INSERT at all — which is itself asserted below.

begin;
select plan(9);

insert into auth.users (id) values
  ('e7000000-0000-0000-0000-000000000001'),  -- Driver A, the one who declines
  ('e7000000-0000-0000-0000-000000000002'),  -- Driver B, who should be unaffected
  ('e7000000-0000-0000-0000-000000000003');  -- Rider

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values
  ('e7000000-0000-0000-0000-000000000001', 'Driver A', 'active', 'passed', 'passed'),
  ('e7000000-0000-0000-0000-000000000002', 'Driver B', 'active', 'passed', 'passed');

create temporary table t_ids (label text primary key, id uuid) on commit drop;
insert into t_ids select 'driver_a', id from drivers where auth_user_id = 'e7000000-0000-0000-0000-000000000001';
insert into t_ids select 'driver_b', id from drivers where auth_user_id = 'e7000000-0000-0000-0000-000000000002';

with r as (
  insert into rides (rider_id, driver_id, status, fare_cents)
  values ('e7000000-0000-0000-0000-000000000003', null, 'requested', 1240)
  returning id
)
insert into t_ids (label, id) select 'ride_open', id from r;

grant select on t_ids to authenticated;

-- ---- Declining, and re-declining ---------------------------------------------------------------

insert into ride_declines (driver_id, ride_id)
select (select id from t_ids where label = 'driver_a'),
       (select id from t_ids where label = 'ride_open');

select is(
  (select count(*) from ride_declines where driver_id = (select id from t_ids where label = 'driver_a')),
  1::bigint,
  'a decline is one row against the (driver, ride) pair'
);

-- The composite primary key IS the idempotence mechanism — the same `on conflict do nothing` idiom
-- queue_driver_payout uses for a re-fired trigger. A double-tapped Decline must not error.
create temporary table t_result (n int) on commit drop;
with d as (
  insert into ride_declines (driver_id, ride_id)
  select (select id from t_ids where label = 'driver_a'),
         (select id from t_ids where label = 'ride_open')
  on conflict do nothing
  returning 1
)
insert into t_result select count(*) from d;

select is(
  (select n from t_result),
  0,
  're-declining the same ride affects nothing — the PK makes it an idempotent no-op'
);

-- ---- What a decline must NOT touch -------------------------------------------------------------

select is(
  (select status from rides where id = (select id from t_ids where label = 'ride_open')),
  'requested',
  'the ride is still requested — a decline is not a cancellation'
);

select ok(
  (select driver_id is null from rides where id = (select id from t_ids where label = 'ride_open')),
  'and still unassigned — a decline never claims or releases a ride'
);

-- The property that keeps one driver's opinion from becoming everyone's: the PK is composite, so
-- the same ride can be declined independently by any number of drivers, and declining it removes it
-- from nobody else's pool.
insert into ride_declines (driver_id, ride_id)
select (select id from t_ids where label = 'driver_b'),
       (select id from t_ids where label = 'ride_open');

select is(
  (select count(*) from ride_declines where ride_id = (select id from t_ids where label = 'ride_open')),
  2::bigint,
  'two drivers may decline the same ride — the key is the pair, not the ride'
);

-- ---- RLS: read your own, write none ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'e7000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from ride_declines),
  1::bigint,
  'driver A reads their own decline'
);

set local request.jwt.claim.sub = 'e7000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from ride_declines
     where driver_id = (select id from t_ids where label = 'driver_a')),
  0::bigint,
  'and driver B cannot see it — ride_declines_select_own scopes reads to the owning driver'
);

-- No INSERT grant at all for `authenticated`, deliberately: unlike `drivers.accepting_rides`, a
-- decline has plausible future writers that are not the driver, so it goes through the service
-- role (ADR-0019's one-writer-forever rule, applied in the other direction).
select throws_ok(
  $$ insert into ride_declines (driver_id, ride_id)
     select (select id from t_ids where label = 'driver_b'),
            (select id from t_ids where label = 'ride_open') $$,
  '42501',
  null,
  'a driver cannot write a decline directly — declineRide() goes through the service role'
);

reset role;

-- ---- Cascade -----------------------------------------------------------------------------------

-- `cascade`, not `restrict`, because this is a preference rather than a financial record — the
-- reasoning rider_payment_profiles uses. It is also what keeps un-declining trivially addable.
delete from ride_declines;  -- clear the pair so the ride has no dependents but the one we re-add
insert into ride_declines (driver_id, ride_id)
select (select id from t_ids where label = 'driver_a'),
       (select id from t_ids where label = 'ride_open');

delete from rides where id = (select id from t_ids where label = 'ride_open');

select is(
  (select count(*) from ride_declines),
  0::bigint,
  'deleting a ride takes its declines with it — they are preferences about a row that is gone'
);

select * from finish();
rollback;
