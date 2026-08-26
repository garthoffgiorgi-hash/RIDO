-- Fare rate cards — THE single home for what RIDO charges a rider.
--
-- These are configuration, not code. Changing a price is a row change, not a deploy.
-- No base, per-mile, per-minute or minimum fare may be written as a literal anywhere else in the
-- repo; scripts/check-context.mjs enforces the same rule for the commission rates next door.
--
-- Amounts are integer cents. Rationale for the shape: docs/decisions/0009-rido-quotes-the-fare.md
--
-- ── WHERE THESE FOUR NUMBERS CAME FROM ──────────────────────────────────────────────────────
--
-- They are NOT derived from a competitor at runtime — nothing in the codebase knows what anyone
-- else charges. They were CALIBRATED once: `node scripts/calibrate-fares.mjs` prices a spread of
-- realistic San Diego trips against a modelled UberX fare (sourced and dated in
-- docs/business/competitor-pricing.md) and reports the discount. These values put RIDO between
-- 14.3% and 15.6% below that model across every trip shape tested, against a 15% target.
--
-- Re-run that script after changing anything here. docs/business/fare-pricing.md is the procedure.

insert into fare_rate_cards
  (market, base_cents, per_mile_cents, per_minute_cents, minimum_fare_cents, active, effective_from)
values
  ('san-diego', 300, 107, 27, 680, true, '2026-01-01')
on conflict (market, effective_from) do nothing;

-- Worked example, a typical 5-mile / 15-minute ride:
--   base                  $3.00
--   5 mi   x $1.07      = $5.35
--   15 min x $0.27      = $4.05
--                         -----
--   fare                  $12.40   (a modelled UberX on the same trip: $14.65 -> 15.4% below)
--
--   the driver keeps $9.92 of it at our most expensive commission band, and $11.41 at our
--   cheapest. A driver on that modelled Uber trip keeps $8.79.
--
-- That is the whole thesis in one trip: the rider pays less AND the driver earns more, because
-- the middle takes so much less. See docs/business/fare-pricing.md for the full basket.
