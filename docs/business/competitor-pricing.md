# Competitor pricing — the model RIDO calibrates against

**Everything on this page is an estimate.** These are third-party aggregator figures, not any
competitor's published rate card — Uber does not publish one. They exist for exactly one purpose:
to check what discount RIDO's own card produces (`scripts/calibrate-fares.ts`, ADR-0009).

**Nothing here ever feeds a rider's price.** If a number below is wrong, a calibration report is
wrong; a fare is not. That separation is deliberate and is the reason this file is safe to keep at
arm's length rather than maintained to the minute.

## UberX, San Diego

*Collected 2026-08-26.*

| Component | Value | Confidence |
|---|---|---|
| Base fare | $1.10 | Medium — city-specific figure, single aggregator |
| Per mile | $1.28 | Medium |
| Per minute | $0.31 | Medium |
| Booking fee | **$2.50 (modelled)** | **Low** — reported only as a $1.85–$2.75 range; modelled at a point |
| Minimum fare | ~$8.00 | Low — inferred from "real prices from $8", not stated as a minimum |

National context, for sanity-checking the above: base fares run $1.00–$2.55, per-mile $0.85–$1.81
(≈$0.97 average), per-minute $0.20–$0.45 (≈$0.25 average), booking fees $2.20–$3.80. San Diego
sitting above the national per-mile average is consistent with a high-cost coastal market.

Uber has used **upfront pricing** since 2017: the quoted price bundles base, distance, time,
booking fee, estimated tolls and any surge, and is what the rider pays. That is the number the
calibration compares against, and it is the right one — it's what a rider actually sees.

### The figure that matters most, and is least certain

**Incumbent *effective* take: 35–50%.** Nominal take is ~20–25%, but 2022's upfront pricing
decoupled the rider price from driver pay, so the platform's actual share is higher and varies per
trip. `market-viability.md` carries the sourcing, including that the strongest dataset (Seattle
driver-union analysis of 1.4M trips, ~35%/trip) is advocacy-sourced.

The calibration models this at **40%**, the midpoint. It is the single largest source of
uncertainty in every driver comparison RIDO publishes: the monthly break-even at which a driver
does better on RIDO than on an incumbent moves from **20 to 94 trips/month** across that range. Any
conclusion that depends on it should be stated with the range, not the midpoint.

## Sources

- [Uber Fare Estimate 2026: rates for 30 cities](https://getridewise.com/blog/uber-fare-calculator-2026) — per-city components
- [San Diego Uber prices 2026](https://getridewise.com/us/california/san-diego) — the San Diego card
- [How Uber and Lyft calculate your fare](https://getridewise.com/blog/how-uber-lyft-calculate-fare-pricing) — formula and upfront pricing
- [Uber fees explained (2026)](https://getridewise.com/blog/uber-fees-explained-booking-service-wait-cleaning) — booking-fee range
- [How much is an Uber ride in 2026](https://getridewise.com/how-much-is-uber) — the ~$8 floor
- Effective take rate: see `market-viability.md`, which carries its own citations

## When to revisit

Re-collect when `npm run check:calibration` starts failing for reasons that aren't a change to our
own card, or roughly annually — whichever comes first. Update the table, the constants in
`scripts/calibrate-fares.ts`, and the collection date above **together**; the script is the only
other place these numbers live.
