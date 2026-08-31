-- 20260901130000_add_payout_attempt_claim.sql: claim_driver_payout_attempt hands out a fresh
-- attempt number per genuine attempt while letting only one caller through at a time, and
-- release_driver_payout_attempt lets the next genuine retry claim again. Rationale: the
-- migration's own header — a stable idempotency key made a retryable balance_insufficient
-- unretryable, replayed by Stripe forever.
--
-- What this file cannot prove is true concurrent-connection blocking (pgTAP is one connection) —
-- that is concurrent-payout-claim.sh, same division of labour as accept/completion.
begin;
select plan(11);

insert into auth.users (id) values ('d3000000-0000-0000-0000-000000000001');
insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('d3000000-0000-0000-0000-000000000001', 'Claim Driver', 'active', 'passed', 'passed');

create temporary table t_ids (label text primary key, id uuid) on commit drop;
insert into t_ids
select 'driver', id from drivers where auth_user_id = 'd3000000-0000-0000-0000-000000000001';

insert into driver_payouts (driver_id, ride_id, amount_cents)
values ((select id from t_ids where label = 'driver'), null, 1500);
insert into t_ids select 'payout', id from driver_payouts limit 1;

-- ------------------------------------------------------------- a fresh row starts unclaimed

select is(
  (select attempt_count from driver_payouts where id = (select id from t_ids where label = 'payout')),
  0,
  'a newly-queued payout has made no attempts yet'
);

-- ---------------------------------------------------------------- the first claim succeeds

select is(
  claim_driver_payout_attempt((select id from t_ids where label = 'payout')),
  1,
  'the first claim on an unclaimed row returns attempt 1'
);

select is(
  (select settling from driver_payouts where id = (select id from t_ids where label = 'payout')),
  true,
  'a claimed row is marked settling'
);

select isnt(
  (select settling_since from driver_payouts where id = (select id from t_ids where label = 'payout')),
  null,
  'a claim stamps when it was taken'
);

-- --------------------------------------------------- a second claim while settling is refused

select is(
  claim_driver_payout_attempt((select id from t_ids where label = 'payout')),
  null,
  'a row already settling refuses a second claim — this is the exclusivity a concurrent caller relies on'
);

-- attempt_count must NOT have moved on the refused claim — only a winning claim increments it,
-- or the number stops meaning "how many real attempts", undermining its one job as idempotency
-- key material.
select is(
  (select attempt_count from driver_payouts where id = (select id from t_ids where label = 'payout')),
  1,
  'a refused claim leaves attempt_count untouched'
);

-- ------------------------------------------------------------------ release, then claim again

select release_driver_payout_attempt((select id from t_ids where label = 'payout'));

select is(
  (select settling from driver_payouts where id = (select id from t_ids where label = 'payout')),
  false,
  'release clears the in-flight flag'
);

select is(
  claim_driver_payout_attempt((select id from t_ids where label = 'payout')),
  2,
  'a genuinely new claim after release gets a NEW attempt number — the whole point: a fresh '
  'idempotency key for a fresh attempt, not Stripe replaying attempt 1''s cached response'
);

select release_driver_payout_attempt((select id from t_ids where label = 'payout'));

-- -------------------------------------------------------------------- a paid row can't be claimed

update driver_payouts
set status = 'paid', stripe_transfer_id = 'tr_test_already_paid'
where id = (select id from t_ids where label = 'payout');

select is(
  claim_driver_payout_attempt((select id from t_ids where label = 'payout')),
  null,
  'a paid row refuses every claim — there is nothing left to attempt'
);

-- ------------------------------------------------------- stale-lock recovery, past the window

-- created_at defaults to now(), frozen for the whole transaction this file runs in — an ORDER BY
-- created_at cannot distinguish this row from 'payout' above. Capture the new id directly instead.
with r as (
  insert into driver_payouts (driver_id, ride_id, amount_cents)
  values ((select id from t_ids where label = 'driver'), null, 750)
  returning id
)
insert into t_ids (label, id) select 'stale_payout', id from r;

select claim_driver_payout_attempt((select id from t_ids where label = 'stale_payout'));

-- Simulate a crashed request: settling stayed true, but its timestamp is old. No application
-- code ever does this directly — this stands in for time actually passing.
update driver_payouts
set settling_since = now() - interval '3 minutes'
where id = (select id from t_ids where label = 'stale_payout');

select is(
  claim_driver_payout_attempt((select id from t_ids where label = 'stale_payout')),
  2,
  'a claim older than the staleness window is recoverable — an abandoned attempt must not '
  'strand a payout forever'
);

-- --------------------------------------------------------------------------------- permissions

set local role authenticated;
set local request.jwt.claim.sub = 'd3000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select claim_driver_payout_attempt('00000000-0000-0000-0000-000000000000') $$,
  '42501',
  null,
  'an authenticated driver cannot execute claim_driver_payout_attempt at all — not even on a payout that is theirs'
);

reset role;
select * from finish();
rollback;
