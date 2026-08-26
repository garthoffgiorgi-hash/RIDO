-- fare_rate_cards: the constraint that makes a card sane, and the read helper that picks the one
-- in force. Plus the RLS posture — a rider must be able to READ a price and must never be able to
-- set one.
--
-- The amounts below are arbitrary test values, not RIDO's card. The real one is seeded from
-- supabase/seed/fare_rate_cards.sql and pinned in packages/pricing/src/fare.seed.test.ts.
begin;
select plan(10);

insert into auth.users (id) values ('a1000000-0000-0000-0000-000000000001');

-- ------------------------------------------------------------------- the sanity constraint

select throws_ok(
  $$ insert into fare_rate_cards
       (market, base_cents, per_mile_cents, per_minute_cents, minimum_fare_cents, effective_from)
     values ('test-market', 900, 100, 25, 500, '2026-01-01') $$,
  '23514',
  null,
  'a minimum fare below the base is rejected — such a floor could never apply'
);

select lives_ok(
  $$ insert into fare_rate_cards
       (market, base_cents, per_mile_cents, per_minute_cents, minimum_fare_cents, effective_from)
     values ('test-market', 200, 100, 25, 500, '2026-01-01') $$,
  'a coherent card is accepted'
);

select throws_ok(
  $$ insert into fare_rate_cards
       (market, base_cents, per_mile_cents, per_minute_cents, minimum_fare_cents, effective_from)
     values ('test-market', -1, 100, 25, 500, '2026-02-01') $$,
  '23514',
  null,
  'a negative component is rejected'
);

select throws_ok(
  $$ insert into fare_rate_cards
       (market, base_cents, per_mile_cents, per_minute_cents, minimum_fare_cents, effective_from)
     values ('test-market', 200, 100, 25, 500, '2026-01-01') $$,
  '23505',
  null,
  'one market cannot have two cards taking effect on the same day'
);

-- ------------------------------------------------------------------------- the read helper

select is(
  (select base_cents from active_fare_rate_card('test-market')),
  200::bigint,
  'the helper returns the card in force'
);

-- Supersession: a later card wins once its date has arrived, and a future one does not.
insert into fare_rate_cards
  (market, base_cents, per_mile_cents, per_minute_cents, minimum_fare_cents, effective_from)
values
  ('test-market', 250, 110, 28, 600, '2026-06-01'),
  ('test-market', 999, 999, 99, 9999, '2099-01-01');

select is(
  (select base_cents from active_fare_rate_card('test-market')),
  250::bigint,
  'the most recent card whose date has arrived supersedes the older one'
);

select is(
  (select count(*)::int from active_fare_rate_card('test-market')),
  1,
  'exactly one card is in force — a future-dated card is not yet the price'
);

select is(
  (select count(*)::int from active_fare_rate_card('no-such-market')),
  0,
  'a market with no card returns nothing rather than someone else''s price'
);

update fare_rate_cards set active = false where market = 'test-market' and effective_from = '2026-06-01';
select is(
  (select base_cents from active_fare_rate_card('test-market')),
  200::bigint,
  'deactivating a card falls back to the previous one rather than leaving no price'
);

-- --------------------------------------------------------------------------------- the RLS

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ update fare_rate_cards set base_cents = 1 where market = 'test-market' $$,
  '42501',
  null,
  'an authenticated rider can read a price but cannot set one'
);

reset role;
select * from finish();
rollback;
