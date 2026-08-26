-- fare_rate_cards — what a ride costs the rider. Configuration, not code.
--
-- Direct sibling of commission_tiers, and deliberately so: that table made repricing our TAKE a
-- row edit, and this one does the same for the PRICE. Same `active` + `effective_from` pair, so a
-- change is additive and auditable rather than an overwrite; same explicit grants; same rule that
-- no rate is ever written as a literal in application code.
--
-- The card is (base + per-mile + per-minute) with a floor. Rationale, and why the values are what
-- they are: docs/decisions/0009-rido-quotes-the-fare.md and docs/business/fare-pricing.md.
-- Runtime values: supabase/seed/fare_rate_cards.sql.
--
-- `market` exists because San Diego is the first city, not the only one. One nullable-free column
-- now is cheaper than a migration later, and it makes "the rate card" a per-market question from
-- the beginning rather than a global that has to be un-globalled.
--
-- Deliberately NO surge column. A demand multiplier is not a property of a market's rate card —
-- it is a property of a moment, computed somewhere else entirely (ADR-0008). quoteFare() takes it
-- as an argument that defaults to 1.00x; when something computes one, it will not come from here.

create table fare_rate_cards (
  id                  uuid primary key default gen_random_uuid(),
  market              text not null,
  base_cents          bigint not null check (base_cents >= 0),
  per_mile_cents      bigint not null check (per_mile_cents >= 0),
  per_minute_cents    bigint not null check (per_minute_cents >= 0),
  minimum_fare_cents  bigint not null check (minimum_fare_cents >= 0),
  active              boolean not null default true,
  effective_from      date not null,

  constraint fare_rate_cards_market_effective_from_key
    unique (market, effective_from),

  -- A minimum below the base could never bind, so one of the two would be wrong. Mirrors
  -- validateRateCard() in packages/pricing/src/fare.ts — the check is cheap in both places, and
  -- a card that can't be priced should never reach the application at all.
  constraint fare_rate_cards_minimum_above_base
    check (minimum_fare_cents >= base_cents)
);

alter table fare_rate_cards enable row level security;

-- Every signed-in user can read the card in force. A rider has to be shown a price before they
-- book, and a driver has to be able to see what a ride is worth. No write policy for anyone —
-- service_role bypasses RLS, so a price change stays a row edit via the dashboard or a
-- service-role script, never the app. Same posture as commission_tiers.
create policy fare_rate_cards_select_authenticated
  on fare_rate_cards for select
  to authenticated
  using (true);

-- Base table privileges, explicit rather than assumed — Supabase's default-grant-on-new-table
-- behaviour is an opt-in project setting as of April 2026, not a guarantee. RLS only matters once
-- a role can reach the table at all.
grant select on fare_rate_cards to authenticated;
grant select, insert, update, delete on fare_rate_cards to service_role;
