# Fare pricing — what a ride costs, and how to change it

**You do not need to change any code to reprice a ride.** The base fare, per-mile rate, per-minute
rate and minimum fare are a row in `fare_rate_cards`. This page is the whole procedure.

Governs: the *process*. The values themselves live in `../../supabase/seed/fare_rate_cards.sql`;
why the mechanism is shaped this way is `../decisions/0009-rido-quotes-the-fare.md`.

## The card

```
fare = max(minimumFare, base + perMile x miles + perMinute x minutes) x surge
```

San Diego, effective 2026-01-01: **$3.00 base · $1.07/mile · $0.27/minute · $6.80 minimum.**

Surge defaults to 1.00× and nothing computes anything else yet — it is a seam, per ADR-0008.

A quote also carries **pass-through line items** (CPUC, airport) separately from the fare. That
list is empty today. It matters that it exists: those are not RIDO revenue and must never be
commissionable.

## The one thing to know first

**"About 15% below Uber" is a target we calibrated to, not a live comparison.** Nothing in RIDO
knows what a competitor charges. `scripts/calibrate-fares.ts` prices a spread of trips against a
*modelled* UberX fare (`competitor-pricing.md`) and reports the gap.

So it must never be advertised as a guarantee. "Priced to run about 15% under a typical Uber fare"
is defensible; "always 15% cheaper than Uber" is not, and would need substantiation we cannot
produce.

## Where it lands today

Run `npm run calibrate` for the live table — that reads the committed seed, so it is always
current where this page may not be. As of 2026-08-26:

| Trip | Uber (modelled) | RIDO | Discount | Uber driver | RIDO @20% | RIDO @8% | Prop 22 floor |
|---|---|---|---|---|---|---|---|
| campus hop (1.2 mi, 6 min) | $8.00 | $6.80 | 15.0% | $4.80 | $5.44 | $6.26 | $2.57 |
| short + gridlock (1 mi, 25 min) | $12.63 | $10.82 | 14.3% | $7.58 | $8.66 | $9.95 | **$9.25** |
| UCSD→La Jolla (3 mi, 12 min) | $11.16 | $9.45 | 15.3% | $6.70 | $7.56 | $8.69 | $5.37 |
| typical (5 mi, 15 min) | $14.65 | $12.40 | 15.4% | $8.79 | $9.92 | $11.41 | $7.18 |
| UCSD→downtown (12 mi, 22 min) | $25.78 | $21.78 | 15.5% | $15.47 | $17.42 | $20.04 | $12.25 |
| airport (14 mi, 28 min) | $30.20 | $25.54 | 15.4% | $18.12 | $20.43 | $23.50 | $15.12 |
| long freeway (25 mi, 35 min) | $46.45 | $39.20 | 15.6% | $27.87 | $31.36 | $36.06 | $21.68 |
| **basket** | **$148.87** | **$125.99** | **15.4%** | | | | |

**The driver column is the point.** A RIDO driver beats an incumbent driver on every row *at our
most expensive commission band*. On the typical ride the rider pays 15% less and the driver takes
home 13% more — because the middle takes so much less. Worst deviation from the 15% target across
the basket: 0.67 points.

## Two findings worth carrying forward

### The low-volume dead zone

A 15% cheaper fare means 15% less gross per trip, and the $50 flat fee lands on top of that. Same
trips, same driver, one month:

| Trips/mo | Uber driver | RIDO driver (steady state) | Delta |
|---|---|---|---|
| 40 | $352 | $347 | **−$5** |
| 80 | $703 | $744 | +$40 |
| 120 | $1,055 | $1,179 | +$125 |
| 200 | $1,758 | $2,052 | +$294 |
| 300 | $2,637 | $3,172 | +$535 |

Break-even by incumbent effective take: **94 trips/mo at 35% · 45 at 40% · 27 at 45% · 20 at 50%.**
The uncertainty in that one input dominates the answer.

**During the pilot, with the fee at $0, this disappears entirely** — RIDO wins from the first trip
at every assumption. So it is a fee-turn-on problem, not a launch problem, and ADR-0003 already
makes the turn-on a per-driver state rather than a date. The options (lower the fee, gate it on
driver volume as well as market traction, or accept it and target full-time drivers) are open and
need research, not code.

### Prop 22 binds on one trip shape

California guarantees 120% of the local minimum wage for engaged time plus a per-engaged-mile
rate — in San Diego for 2026, $21.30/hour and $0.37/mile (`../compliance/ca-tnc.md`). Short slow
trips are where that bites: the gridlock row above clears $8.66 against a $9.25 floor at our worst
band, a 59-cent shortfall. At our cheapest band the same trip clears by 71 cents.

**The statutory obligation is a two-week aggregate, not per trip** — one underwater ride is netted
against everything else in the period. `packages/pricing/src/earnings-floor.ts` computes both; the
per-trip figure is a diagnostic for which shapes drag, and `aggregateFloorShortfall` is the one
that matches the statute.

## Changing a price

```sql
-- $1.15/mile for San Diego, from the 1st of next month, without destroying the old card.
insert into fare_rate_cards
  (market, base_cents, per_mile_cents, per_minute_cents, minimum_fare_cents, effective_from)
values ('san-diego', 300, 115, 27, 680, '2026-10-01');
```

`active_fare_rate_card('san-diego')` returns the most recent card whose date has arrived, so a
future-dated row is queued rather than live. The day boundary is `America/Los_Angeles`.

To change it in place instead, update the existing row. Either way, update
`../../supabase/seed/fare_rate_cards.sql` so a fresh database gets the same card.

### Checklist

- [ ] Update the row in `fare_rate_cards` (and the seed).
- [ ] Run `npm run calibrate` and read the table. Does the discount still land where you want it?
      Does the driver still beat an incumbent on every shape?
- [ ] `npm run check:calibration` must pass. It fails if the discount drifts more than 2 points
      from the 15% target, or if any trip shape leaves the driver worse off than on an incumbent.
- [ ] If you changed the **target** rather than the card, change `TARGET_DISCOUNT_BPS` in
      `../../scripts/calibrate-fares.ts` and say so here.
- [ ] Refresh the table above from the script's output, and note the date.
- [ ] Changing the commission rates instead? That's `changing-rates.md` — a different card.

There is deliberately no test file pinning this card by hand. One would keep passing on stale
values after someone edited the seed; the calibration check reads the seed itself. Everything that
depends on the real card is asserted against the real card.
