-- Commission tiers — THE single home for RIDO's rates.
--
-- These are configuration, not code. Changing a rate is a row change, not a deploy.
-- No rate, boundary, or fee amount may be written as a literal anywhere else in the repo;
-- scripts/check-context.mjs enforces that.
--
-- Bracketed (marginal): each band's rate applies only to the fares inside it.
-- Rationale and the rejected alternative: docs/decisions/0002-bracketed-per-ride-commission.md
--
-- Bounds are in integer cents. Rates are basis points (2000 = 20.00%).
-- upper_bound_cents IS NULL means unbounded.

insert into commission_tiers
  (tier_order, lower_bound_cents, upper_bound_cents, rate_bps, active, effective_from)
values
  (1,      0,  100000, 2000, true, '2026-01-01'),  -- $0–$1,000/mo      → 20%
  (2, 100000,  300000, 1200, true, '2026-01-01'),  -- $1,000–$3,000/mo  → 12%
  (3, 300000,    null,  800, true, '2026-01-01')   -- above $3,000/mo   →  8%
on conflict (tier_order, effective_from) do nothing;

-- Worked example, $3,600 of fares in a month:
--   $1,000 × 20%  = $200.00
--   $2,000 × 12%  = $240.00
--     $600 ×  8%  =  $48.00
--                   -------
--   commission      $488.00  (13.56% blended)   driver keeps $3,112.00
--   an incumbent at 30% would take $1,080.00
