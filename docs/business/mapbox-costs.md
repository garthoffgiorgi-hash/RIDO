# Mapbox — what it costs

**Everything on this page is an estimate.** These are third-party aggregator figures, not
Mapbox's own pricing page — `mapbox.com` was unreachable from the session that collected them
(the egress proxy returns 403 on that domain). Same posture as `competitor-pricing.md`, and for
the same reason: **these numbers feed a cost model and a product decision, never a rider's price.**

**Three figures marked `verify` below would change a design decision if wrong.** Check them
against the live pricing page before an account is created.

## Rates, self-serve / pay-as-you-go

*Collected 2026-08-26.*

| Product | Free / month | Above it | Confidence |
|---|---|---|---|
| Web map loads (GL JS) | 50,000 | ~$5/1k, falling to ~$3/1k above 200k | Medium |
| Geocoding v6 — temporary | 100,000 requests | ~$0.75/1k, falling to ~$0.45/1k at 1–5M | Medium |
| Geocoding v6 — permanent | **none** | ~$5.00/1k | Medium — card on file required |
| Search Box `/suggest` + `/retrieve` | 500 **sessions** | ~$11.50/1k sessions | **verify** |
| Search Box `/forward`, `/reverse` | ~25,000 **requests** | ~$1.70/1k requests | Medium. **Results may not be stored at any price** — ADR-0011 |
| Directions API | 100,000 requests | $2.00/1k (100k–500k), $1.60/1k (500k–1M) | High — several sources agree |

Rate limits: Directions **300 req/min**, Geocoding/Search **1,000 req/min**. Both adjustable.

For comparison against the road not taken: Google's Directions equivalent is widely cited at
$5.00/1k — roughly 2.5× Mapbox's $2.00.

## Modelled consumption

Assumptions stated so they can be argued with rather than the totals: 5 map initializations per
completed ride (including abandoned sessions), ~2.4 destination searches per completed ride at
~2.5 debounced requests each, one reverse geocode per session, two Directions calls per completed
ride (the rider changes their mind once). **Permanent geocoding is off** (ADR-0011), so it costs
nothing at either volume — the row below records what it *would* cost if turned on.

### Pilot — 500 completed rides/month

| Product | Volume | Free tier | Cost |
|---|---|---|---|
| Map loads | 2,500 | 50,000 | $0 |
| Search Box `/forward` | 3,000 | 25,000 | $0 |
| Geocoding reverse | 1,000 | 100,000 | $0 |
| Directions | 1,000 | 100,000 | $0 |
| Permanent geocoding | 0 | none | **$0** — deferred |
| **Total** | | | **$0/mo** |

Every line is inside a free tier. **Permanent geocoding is the only Mapbox product that would
cost anything at pilot volume, and ADR-0011 turns it off** — the pilot stores address strings
instead and defers the coordinates. Turning it on would be ~$5/mo here (2 geocodes per booking
at ~$5/1k).

### Twenty times that — 10,000 completed rides/month

| Product | Volume | Cost |
|---|---|---|
| Map loads | 50,000 | ~$0 (at the tier edge) |
| Search Box `/forward` | 60,000 | ~$59.50 |
| Geocoding reverse | 20,000 | $0 |
| Directions | 20,000 | $0 |
| Permanent geocoding | 0 | **$0** — deferred (~$100 if on) |
| **Total** | | **~$60/mo** |

**$0.006 per ride** as configured, or $0.016 with permanent geocoding on. Against the seeded card a typical 5-mile / 15-minute ride is $12.40 at a
~13.6% blended take — about $1.69 of RIDO revenue — so Mapbox is **~0.35% of revenue** at that
volume, or ~0.9% with permanent geocoding on.

**Deferring is also cheaper than paying as we go, not merely later.** Pay-as-you-go bills every
*booking*, cancellations included; a backfill over stored addresses bills only *completed rides*.
The trigger for turning it on is in ADR-0011.

## The one choice these numbers drove

**Search Box `/forward` (per request) over `/suggest` + `/retrieve` (per session).** The request
allowance is ~50× the session allowance, which at pilot volume is the difference between $0 and
~$8/month, and at 10,000 rides between ~$60 and ~$110. That 50× gap is exactly the kind of figure
an aggregator gets wrong, which is why it is marked `verify` — but the conclusion holds under a
wide range of guesses, and switching later is confined to `apps/web/src/lib/maps/places.ts`.

## Not modelled

A per-ride mapping cost line in `../../tools/pilot-model/` — the model prices commission and the
flat fee, not COGS. Worth adding when there's a second variable cost to sit alongside this one
(Stripe's processing fee is the obvious candidate, and is itself an open question in
`../README.md`). At ~0.9% of revenue this is not currently what decides anything.
