-- The SB 1376 "Access for All" fee gets a home: an amount on the market's rate card, and a
-- snapshot on every ride quoted against it. ADR-0024.
--
-- Rationale: docs/compliance/ca-tnc.md requires RIDO to track and remit a flat per-trip fee on
-- every completed California TNC trip. It is money RIDO collects from the rider on behalf of a
-- state fund — never revenue — so it sits beside the fare rather than inside it, and
-- `rides_commission_sums_to_fare` stays bound to `fare_cents` alone. A driver must never pay
-- commission on a tax.
--
-- ── WHY A COLUMN ON `fare_rate_cards`, NOT A `regulatory_fees` TABLE ────────────────────────
--
-- `cancellation_fee_cents` is the same shape — flat, per-trip, per-market, conditional on an
-- outcome — and the card already owns effective dating (`(market, effective_from)`, `active`,
-- `active_fare_rate_card()`), so changing the fee is a seed change exactly as a repricing is.
-- A dedicated table would duplicate that machinery, add a join to the quote path, and need its
-- own RLS, seed and pgTAP — for one row.
--
-- Per-market is not a compromise: SB 1376 attaches to trips originating in California, and
-- `market` is a sound proxy for that at a single-market pilot. A future non-CA market's card
-- carries 0 and its riders see no line item at all.
--
-- The revisit trigger is specific, and recorded in ADR-0024: the second per-trip regulatory fee
-- whose scoping key is NOT `market` — a geofence, like an airport pickup — is what buys the
-- table, because a column on a market's card cannot express it.
--
-- ── WHY THE RIDE SNAPSHOTS IT, AND WHY `>=` RATHER THAN `=` ─────────────────────────────────
--
-- Deriving the fee as `rider_total_cents - fare_cents` is correct only while exactly one
-- pass-through exists, and becomes quietly wrong the day there are two. Remittance needs a
-- per-ride auditable record, so the ride stores what it was quoted.
--
-- The total-covers-pass-throughs check is deliberately `>=` and not `=`. Strict equality would
-- encode "there is exactly one pass-through" into the schema and make the airport surcharge a
-- migration that drops and recreates this constraint — the exact coupling `FareLineItem`'s empty
-- array was built to avoid. The `>=` form is monotone in the number of pass-throughs, needs no
-- migration for the second one, and still catches the real bug: a fee snapshotted onto a ride but
-- left out of what the rider was actually charged.
--
-- `not null default 0` in one statement rather than add/backfill/set-not-null, for the reason
-- 20260908120000 spells out: Postgres stores a constant default for a `not null` column as catalog
-- metadata rather than rewriting the table. And 0 is a TRUE historical fact for existing rides —
-- they were booked before the fee existed and were not charged it — unlike `rider_total_cents`,
-- whose null genuinely means "unknown".

alter table fare_rate_cards
  add column access_for_all_fee_cents bigint not null default 0
    check (access_for_all_fee_cents >= 0);

alter table rides
  add column access_for_all_fee_cents bigint not null default 0
    check (access_for_all_fee_cents >= 0);

alter table rides
  add constraint rides_rider_total_covers_pass_throughs
    check (
      rider_total_cents is null
      or rider_total_cents >= fare_cents + access_for_all_fee_cents
    );

comment on column fare_rate_cards.access_for_all_fee_cents is
  'The SB 1376 per-trip fee for this market, in integer cents (ADR-0024). Seeded, never computed: '
  'packages/pricing reads it as an argument and never names an amount. 0 means this market owes '
  'no such fee — a rider there sees no line item at all, not a $0.00 row.';

comment on column rides.access_for_all_fee_cents is
  'What this ride was quoted for the SB 1376 pass-through, copied from the rate card at request '
  'time and never recomputed (ADR-0024). Because it is written at REQUEST time it is also present '
  'on canceled rides, where the rider never actually paid it — a cancellation captures the '
  'cancellation fee alone, never the rider total. So the fee is OWED only on completed trips: '
  'every remittance query must filter status = ''completed'', and a sum() without that filter '
  'overstates what RIDO owes the CPUC.';
