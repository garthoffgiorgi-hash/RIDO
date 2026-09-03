-- driver_monthly_stats_select_own: a driver reads their own month-to-date row, reads none of
-- another driver's, and cannot write to the table at all.
-- Rationale: docs/decisions/0002-bracketed-per-ride-commission.md; the table's own migration
-- comment (20260821120500_create_driver_monthly_stats.sql) states the stakes plainly — "a
-- driver-writable MTD figure would be a direct commission-fraud vector."
--
-- This policy has been live and load-bearing since the table's first migration, and untested until
-- now: 004_bump_monthly_stats.sql exercises the rollup trigger's arithmetic as table owner, never
-- as `authenticated`. It stayed a low-stakes gap while nothing driver-facing read the table
-- directly. The MTD tier-progress card changes that — a driver's own commission-tier position is
-- now rendered from this row on every /drive load — so the read path this policy governs is worth
-- proving, per supabase/CLAUDE.md: "a policy with no test is an assumption."
--
-- Fixture amounts are deliberately arbitrary, not the seeded tier boundaries: check-context.mjs
-- rule 6 flags the two real boundary values as a hardcoded tier boundary anywhere outside the
-- seed and docs, and supabase/tests/ is not on that rule's allowlist.
begin;
select plan(6);

insert into auth.users (id) values
  ('e2000000-0000-0000-0000-000000000001'), -- driver A, whose row this test reads
  ('e2000000-0000-0000-0000-000000000002'); -- driver B, the isolation check

insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values
  ('e2000000-0000-0000-0000-000000000001', 'Stats Driver A', 'active', 'passed', 'passed'),
  ('e2000000-0000-0000-0000-000000000002', 'Stats Driver B', 'active', 'passed', 'passed');

create temporary table t_ids (label text primary key, id uuid) on commit drop;
insert into t_ids
select 'driver_a', id from drivers where auth_user_id = 'e2000000-0000-0000-0000-000000000001';
insert into t_ids
select 'driver_b', id from drivers where auth_user_id = 'e2000000-0000-0000-0000-000000000002';

-- Inserted directly as table owner, not driven through the completion trigger — 004 already
-- proves the trigger's own arithmetic; this file's job is the read policy on top of a row,
-- however that row got there.
insert into driver_monthly_stats
  (driver_id, year_month, rides_count, gross_fare_cents, commission_cents, payout_cents)
values
  ((select id from t_ids where label = 'driver_a'), '2026-01', 3, 5678, 1136, 4542),
  ((select id from t_ids where label = 'driver_b'), '2026-01', 7, 9012, 1802, 7210);

grant select on t_ids to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'e2000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------- driver A reads exactly their own row

select is(
  (select count(*) from driver_monthly_stats)::int,
  1,
  'driver A sees exactly one row this month — their own, not both'
);

select is(
  (select gross_fare_cents from driver_monthly_stats
     where driver_id = (select id from t_ids where label = 'driver_a')),
  5678::bigint,
  'and it is genuinely their own row, not an arbitrary one that happened to pass count()'
);

select ok(
  not exists (
    select 1 from driver_monthly_stats where driver_id = (select id from t_ids where label = 'driver_b')
  ),
  'driver A cannot see driver B''s row at all — not the amount, not the existence'
);

-- --------------------------------------------------------------- and cannot write, at any column

select throws_ok(
  $$ update driver_monthly_stats set gross_fare_cents = 0
     where driver_id = 'e2000000-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  null,
  'a driver cannot rewrite their own month-to-date figure — the table has no write grant to authenticated at all'
);

reset role;

-- ------------------------------------------------------------------ and the mirror check for B

set local role authenticated;
set local request.jwt.claim.sub = 'e2000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from driver_monthly_stats)::int,
  1,
  'driver B likewise sees exactly one row — the isolation runs both directions, not just A→B'
);

select is(
  (select driver_id from driver_monthly_stats limit 1),
  (select id from t_ids where label = 'driver_b'),
  'and it is driver B''s own row'
);

reset role;
select * from finish();
rollback;
