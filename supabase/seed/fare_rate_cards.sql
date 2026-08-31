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

-- ── THE THREE PAYMENT COLUMNS ───────────────────────────────────────────────────────────────
--
-- authorization_buffer_bps (1500 = 15%) — how far above the rider's total to place the hold. It is
-- headroom nothing currently uses: no code reprices a fare at completion, so the quote IS the
-- capture. It ships anyway because a hold cannot be raised later, only voided and re-placed, and
-- re-placing one is a card decline in front of a rider whose ride just ended. 15% covers a
-- materially longer trip without tying up more of a rider's credit than that.
--
-- cancellation_fee_cents (500 = $5.00) — captured from that same hold when a rider cancels late.
-- Roughly ten minutes of a driver's time at this market's per-minute rate plus the base they lost,
-- which is what the fee is actually compensating. The DRIVER KEEPS ALL OF IT today; whether RIDO
-- should keep a share to cover Stripe's processing is an open question in docs/README.md.
--
-- cancellation_grace_seconds (30) — how long after a driver accepts a rider may still cancel free.
-- Long enough to undo a mistap, short enough that a driver who has started moving is protected.

insert into fare_rate_cards
  (market, base_cents, per_mile_cents, per_minute_cents, minimum_fare_cents, active, effective_from,
   authorization_buffer_bps, cancellation_fee_cents, cancellation_grace_seconds)
values
  ('san-diego', 300, 107, 27, 680, true, '2026-01-01', 1500, 500, 30)
-- The three payment columns were added (20260902120100, 20260902120200) after this row already
-- existed, defaulting to 0 — which for all three means "feature off". `do nothing` would leave a
-- live database on those defaults forever, so they are explicitly upserted. Only these three:
-- the four fare values are NOT overwritten, because a market may have tuned them in place and this
-- seed must not silently undo that.
on conflict (market, effective_from) do update set
  authorization_buffer_bps   = excluded.authorization_buffer_bps,
  cancellation_fee_cents     = excluded.cancellation_fee_cents,
  cancellation_grace_seconds = excluded.cancellation_grace_seconds;

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
