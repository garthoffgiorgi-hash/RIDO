# RIDO — Monetization Model (finalized direction)

*The pricing decisions. This is the most code-relevant doc — the commission logic in the app must match it exactly. See `technical-architecture.md` for how it's implemented.*

## Steady-state model: hybrid
**$50/month flat fee + graduated commission.** Chosen over pure flat subscription because a flat sub's revenue tracks driver headcount, not GMV, and can't cover California's high fixed compliance costs (esp. the $1M insurance) at early density. The hybrid keeps the driver-favorable wedge while scaling revenue with GMV.

### Graduated commission (bracketed / marginal, by monthly fare volume)
| Tier | Monthly fare band (per driver) | Rate |
|---|---|---|
| 1 | $0 – $1,000 | 20% |
| 2 | $1,000 – $3,000 | 12% |
| 3 | above $3,000 | 8% |

- **Bracketed, not cliff — decided (final):** each band's rate applies only to fares within that band. The marginal rate falls as volume rises, rewarding high-volume drivers without a discontinuous jump. Cliff/all-or-nothing tiers (whole month at one rate) are rejected — they let more earnings yield less take-home and invite gaming the $1,000/$3,000 lines. Computed per ride and snapshotted, so no month-end reconciliation job.
- Rates live in a `commission_tiers` config table — changeable without a deploy. Never hardcode them.
- Worked example, $3,600 GMV/driver-mo: $1,000×20% + $2,000×12% + $600×8% = $488 (~13.6% blended). Driver keeps $3,112; an incumbent at 30% would take $1,080.

## Launch pilot: 6 months, no flat fee, commission still on
- **Waive the $50 flat fee for the first 6 months; keep the graduated commission running.**
- Rationale: the flat fee is what punishes low early volume during cold-start (a driver pays $50 whether they earn $200 or $2,000). The commission is self-calibrating — a driver doing few rides pays a cut of few rides. So dropping the fee removes the cold-start disincentive while commission keeps *some* revenue flowing against fixed costs.
- A no-fee **and** no-commission pilot (drivers keep 100%) is rejected — it's pure burn with zero offset for six months.
- **What the pilot buys:** it removes driver *acquisition* friction (zero fixed downside to trying RIDO). It does **not** help driver *retention* — that depends entirely on liquidity (actual ride volume). Don't mistake "free" for "cold-start solved."

## Fee turn-on: traction trigger, not a hard date
- Time-box the pilot for clarity (a clean "launch pricing" story), but **gate the flip on a traction check.** If the market hasn't hit a minimum ride density by month 6, extend rather than charge — slapping a $50 fee on fragile supply churns the drivers you just acquired.
- Implementation note: this means the $50 fee is a state per driver/market, not a global calendar event. Don't bake a fixed date into pricing code.

## The master variable: commercial insurance
The $1M commercial liability RIDO must carry (CA CPUC requirement, RIDO's obligation) is the single biggest cost and the biggest unknown. Its *structure* — a fixed monthly minimum premium vs a per-ride/per-mile rate — swings the pilot's cash burn by an order of magnitude (a few thousand vs six figures). **A broker quote is the #1 unresolved action; it gates the validity of every number here.** (The interactive model — `../models/rido-pilot-model.jsx` — lets you toggle this and see the cash hole move.)

## Unit-economics intuition (for sanity checks)
- Driver take-home advantage over incumbents is real but shrinks as the flat fee bites at low volume and grows as Tier-3 (8%) kicks in at high volume.
- RIDO revenue per driver ≈ flat fee + blended commission. At ~$2,000–3,600 GMV/driver-mo, that's roughly $400–490/driver/mo (~12–18% blended take) vs an incumbent's ~30%.
- Card processing (Stripe ~2.9% + $0.30/txn) is a real drag on low ($18) fares — decide whether RIDO absorbs it or passes it to drivers (Empower passes it).
