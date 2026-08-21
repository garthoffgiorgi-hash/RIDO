-- Required assertion #1 (supabase/CLAUDE.md): an unvetted driver cannot reach status='active'.
begin;
select plan(4);

insert into auth.users (id) values
  ('e0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002'),
  ('e0000000-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-000000000004');

select throws_ok(
  $$ insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
     values ('e0000000-0000-0000-0000-000000000001', 'Bad 1', 'active', 'pending', 'passed') $$,
  '23514',
  null,
  'pending background_check_status blocks status=active'
);

select throws_ok(
  $$ insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
     values ('e0000000-0000-0000-0000-000000000002', 'Bad 2', 'active', 'passed', 'failed') $$,
  '23514',
  null,
  'failed vehicle_inspection_status blocks status=active'
);

select lives_ok(
  $$ insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
     values ('e0000000-0000-0000-0000-000000000003', 'Good', 'active', 'passed', 'passed') $$,
  'status=active is allowed once both checks are passed'
);

select lives_ok(
  $$ insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
     values ('e0000000-0000-0000-0000-000000000004', 'Pending', 'pending', 'pending', 'pending') $$,
  'status=pending is allowed regardless of check statuses — the gate only fires on active'
);

select * from finish();
rollback;
