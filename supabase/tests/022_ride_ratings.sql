-- 20260904120200_create_ride_ratings.sql: a rating can only attach to a completed ride, only to
-- that ride's own rider/driver pair, at most once per rater, and rolls into the ratee's aggregate
-- on driver_public_profiles or rider_profiles. Rationale:
-- docs/decisions/0022-rider-identity-and-ratings.md.
--
-- Written entirely with the connection's own (table-owner) privileges, matching
-- 009_driver_accept.sql's write-path assertions: the app never issues these INSERTs as
-- `authenticated` — no grant exists, proven directly below — so what's under test is the two
-- triggers' own logic, not RLS. The read policy at the end is the one thing RLS governs here.
begin;
select plan(10);

insert into auth.users (id) values
  ('c1000000-0000-0000-0000-000000000001'), -- Rider, the real rider on the completed ride
  ('c1000000-0000-0000-0000-000000000002'), -- Driver's own auth user
  ('c1000000-0000-0000-0000-000000000003'); -- An unrelated driver, for the mismatched-pairing case

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values
  ('c1000000-0000-0000-0000-000000000002', 'Rated Driver', 'active', 'passed', 'passed'),
  ('c1000000-0000-0000-0000-000000000003', 'Unrelated Driver', 'active', 'passed', 'passed');

create temporary table t_ids (label text primary key, id uuid) on commit drop;
insert into t_ids select 'driver', id from drivers where auth_user_id = 'c1000000-0000-0000-0000-000000000002';
insert into t_ids select 'other_driver', id from drivers where auth_user_id = 'c1000000-0000-0000-0000-000000000003';

-- The completed ride the first four assertions rate.
with r as (
  insert into rides (rider_id, driver_id, status, fare_cents, accepted_at, completed_at,
                      commission_rate_bps, commission_cents, driver_payout_cents)
  values ('c1000000-0000-0000-0000-000000000001',
          (select id from t_ids where label = 'driver'),
          'completed', 1000, now(), now(), 2000, 200, 800)
  returning id
)
insert into t_ids (label, id) select 'ride_done', id from r;

-- Still live — what "not completed" is checked against.
with r as (
  insert into rides (rider_id, driver_id, status, fare_cents, accepted_at)
  values ('c1000000-0000-0000-0000-000000000001',
          (select id from t_ids where label = 'driver'), 'accepted', 1200, now())
  returning id
)
insert into t_ids (label, id) select 'ride_live', id from r;

grant select on t_ids to authenticated;

-- --------------------------------------------------------------- a legitimate rating each way

select lives_ok(
  $$ insert into ride_ratings (ride_id, rater_id, ratee_id, direction, stars, comment)
     select id, 'c1000000-0000-0000-0000-000000000001'::uuid,
            'c1000000-0000-0000-0000-000000000002'::uuid,
            'rider_rates_driver', 5, 'Great ride'
     from t_ids where label = 'ride_done' $$,
  'the rider rates the driver on their own completed ride'
);

select is(
  (select (rating_count, rating_sum) from driver_public_profiles
     where driver_id = (select id from t_ids where label = 'driver'))::text,
  '(1,5)',
  'the driver''s public rating aggregate reflects the one 5-star rating'
);

select lives_ok(
  $$ insert into ride_ratings (ride_id, rater_id, ratee_id, direction, stars)
     select id, 'c1000000-0000-0000-0000-000000000002'::uuid,
            'c1000000-0000-0000-0000-000000000001'::uuid,
            'driver_rates_rider', 4
     from t_ids where label = 'ride_done' $$,
  'the driver rates the rider on the same completed ride'
);

select is(
  (select (rating_count, rating_sum) from rider_profiles
     where rider_id = 'c1000000-0000-0000-0000-000000000001')::text,
  '(1,4)',
  'the rider''s aggregate reflects the driver''s rating — rider_profiles did not exist for this '
  'rider before this INSERT, proving the aggregate trigger''s upsert self-heals a missing row'
);

-- --------------------------------------------------------------------------- the guard rails

select throws_ok(
  $$ insert into ride_ratings (ride_id, rater_id, ratee_id, direction, stars)
     select id, 'c1000000-0000-0000-0000-000000000001'::uuid,
            'c1000000-0000-0000-0000-000000000002'::uuid,
            'rider_rates_driver', 5
     from t_ids where label = 'ride_live' $$,
  'P0001',
  null,
  'a rating on a still-live ride is refused — nothing to rate until it completes'
);

select throws_ok(
  $$ insert into ride_ratings (ride_id, rater_id, ratee_id, direction, stars)
     select rd.id, 'c1000000-0000-0000-0000-000000000001'::uuid,
            'c1000000-0000-0000-0000-000000000003'::uuid, -- the UNRELATED driver, not this ride's own
            'rider_rates_driver', 1
     from t_ids rd where rd.label = 'ride_done' $$,
  'P0001',
  null,
  'a rating naming a driver who was not on the ride is refused, even though the ride is completed'
);

select throws_ok(
  $$ insert into ride_ratings (ride_id, rater_id, ratee_id, direction, stars)
     select id, 'c1000000-0000-0000-0000-000000000001'::uuid,
            'c1000000-0000-0000-0000-000000000002'::uuid,
            'rider_rates_driver', 3
     from t_ids where label = 'ride_done' $$,
  '23505',
  null,
  'the same rider cannot rate the same completed ride twice'
);

-- Must run as `authenticated`, not the table-owner role every assertion above used: a privilege
-- check is what's under test, and the table owner has full access regardless of any grant. Fresh
-- values (the still-live ride) rather than reusing ride_done's rater/ratee, so this cannot also
-- collide with the uniqueness check above and leave which failure actually fired ambiguous —
-- though a missing grant is checked before any constraint regardless.
set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001'; -- the rider

select throws_ok(
  $$ insert into ride_ratings (ride_id, rater_id, ratee_id, direction, stars)
     select id, 'c1000000-0000-0000-0000-000000000001'::uuid,
            'c1000000-0000-0000-0000-000000000002'::uuid,
            'rider_rates_driver', 5
     from t_ids where label = 'ride_live' $$,
  '42501',
  null,
  'authenticated has no INSERT grant on ride_ratings at all — every write goes through the service role'
);

reset role;

-- ------------------------------------------------------------------------ read: own submissions

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001'; -- the rider, as rater

select is(
  (select stars from ride_ratings
     where ride_id = (select id from t_ids where label = 'ride_done')
       and rater_id = 'c1000000-0000-0000-0000-000000000001'),
  5::smallint,
  'the rider reads the rating they themselves submitted'
);

-- The control: the rider is ALSO this ride's ratee (the driver rated them), and cannot read that
-- row — only what they submitted, never what was said about them. Without this, "reads own
-- submissions" and "reads everything about this ride" would be indistinguishable from one assertion.
select is(
  (select count(*) from ride_ratings
     where ride_id = (select id from t_ids where label = 'ride_done')
       and rater_id = 'c1000000-0000-0000-0000-000000000002')::int,
  0,
  'and cannot read the driver''s rating of them — ratee-side reads are not granted, by design'
);

reset role;

select * from finish();
rollback;
