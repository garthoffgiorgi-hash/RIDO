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
| Geocoding v6 — permanent | **none** | ~$5.00/1k | **verify** |
| Search Box `/suggest` + `/retrieve` | 500 **sessions** | ~$11.50/1k sessions | **verify** |
| Search Box `/forward`, `/reverse` | ~25,000 **requests** | ~$1.70/1k requests | **verify** |
| Directions API | 100,000 requests | $2.00/1k (100k–500k), $1.60/1k (500k–1M) | High — several sources agree |

Rate limits: Directions **300 req/min**, Geocoding/Search **1,000 req/min**. Both adjustable.

For comparison against the road not taken: Google's Directions equivalent is widely cited at
$5.00/1k — roughly 2.5× Mapbox's $2.00.

## Modelled consumption

Assumptions stated so they can be argued with rather than the totals: 5 map initializations per
completed ride (including abandoned sessions), ~2.4 destination searches per completed ride at
~2.5 debounced requests each, one reverse geocode per session, two Directions calls per completed
ride (the rider changes their mind once), two permanent geocodes per completed ride **if** we store
coordinates.

### Pilot — 500 completed rides/month

| Product | Volume | Free tier | Cost |
|---|---|---|---|
| Map loads | 2,500 | 50,000 | $0 |
| Search Box `/forward` | 3,000 | 25,000 | $0 |
| Geocoding reverse | 1,000 | 100,000 | $0 |
| Directions | 1,000 | 100,000 | $0 |
| Permanent geocoding | 1,000 | none | $5.00 |
| **Total** | | | **$5/mo** |

**$0** if permanent geocoding turns out not to be needed — see `../architecture/maps.md`.

### Twenty times that — 10,000 completed rides/month

| Product | Volume | Cost |
|---|---|---|
| Map loads | 50,000 | ~$0 (at the tier edge) |
| Search Box `/forward` | 60,000 | ~$59.50 |
| Geocoding reverse | 20,000 | $0 |
| Directions | 20,000 | $0 |
| Permanent geocoding | 20,000 | $100.00 |
| **Total** | | **~$160/mo** |

**$0.016 per ride.** Against the seeded card a typical 5-mile / 15-minute ride is $12.40 at a
~13.6% blended take — about $1.69 of RIDO revenue — so Mapbox is **~0.9% of revenue** at that
volume. The two line items that dominate it are the two a design change could remove entirely.

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
