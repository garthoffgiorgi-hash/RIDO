# ADR-0009 — RIDO quotes the fare, and the discount is a calibration target

**Date:** 2026-08-26
**Status:** Accepted

## Context

`packages/pricing` could split a fare but nothing decided what a fare *was*. `rides.fare_cents`
was server-set and never trusted from a client, yet no code produced it.

The business goal is to launch roughly 15% below Uber. Three things about that goal shape the
design more than the arithmetic does:

**We cannot ask Uber what they charge.** There is no API, and their published rate card isn't. Any
"15% below Uber" claim rests on a *model* of their pricing built from third-party aggregators.

**Who sets the price is not settled anywhere.** `docs/README.md` still carries the open question
"Prop 22 earnings floor × drivers-set-fares". Empower's model — drivers set their own fares — is
the closest comparable, and `market-viability.md` records that its legal strategy is what is
killing it.

**A 15% price cut narrows the driver's advantage**, which is the entire wedge. Cutting the rider
price without checking what it leaves the driver would be optimising the thing we don't compete on
at the expense of the thing we do.

## Decision

**RIDO quotes the fare from its own rate card. The 15% is a calibration target, not a live
derivation.**

- **A rate card is `base + per-mile + per-minute`, with a minimum fare**, stored per market in
  `fare_rate_cards` — the same shape and the same properties as `commission_tiers`, so changing a
  price is a row edit rather than a deploy.
- **Nothing at runtime knows what a competitor charges.** The card was *calibrated* once:
  `scripts/calibrate-fares.ts` prices a spread of realistic San Diego trips against a modelled
  UberX fare and reports the discount. That model lives in the script and nowhere else, and it
  only ever feeds a report. A stale figure about someone else's prices can therefore never move a
  rider's price.
- **The calibration is re-checked in CI** (`npm run check:calibration`), which fails if the
  discount drifts outside its tolerance *or* if a driver would earn less than on an incumbent for
  any trip shape. A target nobody re-checks is a target already abandoned.
- **Surge is a seam, not an engine.** `quoteFare` takes a multiplier that defaults to 1.00× and
  nothing computes one. Per ADR-0008, that computation belongs outside the request path, and the
  demand data that would drive it is only now being recorded.
- **A quote separates the commissionable fare from pass-throughs.** CPUC and airport charges are
  not RIDO revenue and must never be commissionable. The shape ships empty; no fee is computed yet.
- **The Prop 22 floor is computed as a diagnostic.** `packages/pricing/src/earnings-floor.ts`
  gives the per-trip floor and the aggregate comparison the statute actually uses. It does not
  decide the open legal question — it turns it into a number to take to an attorney.

## Consequences

**Good.** Repricing is a row edit and a re-run of one script. Our price is insulated from bad data
about competitors. The rider-facing quote carries its own breakdown, which the brand's
anti-opacity posture needs. And the calibration surfaced two facts that were not otherwise
visible:

- At the seeded card, **the driver beats an incumbent driver on every trip shape tested, even at
  our most expensive commission band** — a 15% rider discount and a better driver deal are
  simultaneously affordable, which is the thesis, now measured rather than asserted.
- **There is a low-volume dead zone once the flat fee turns on.** A driver doing ~40 trips a month
  ends up marginally *worse* off than on an incumbent, and the break-even ranges from 20 to 94
  trips/month across the 35–50% incumbent-take range the docs give. During the pilot, with the fee
  at $0, it vanishes. See `../business/fare-pricing.md`.

**Costs.** "About 15% below Uber" is a claim about a model, not a guarantee about a live
comparison — it must never be advertised as one, and the model's inputs are third-party estimates
that will go stale. The calibration tolerance is a judgement call. And a per-market card means a
second market is a second card to keep calibrated.

**Not decided here:** the dead-zone question (lower the fee, gate it on driver volume as well as
market traction, or accept it and target full-time drivers) — that needs research, not code. The
open question in `../README.md` about drivers setting fares is now answered for the product as
built: they don't. The Prop 22 interaction remains open.
