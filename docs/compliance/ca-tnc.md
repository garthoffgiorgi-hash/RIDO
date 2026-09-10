# RIDO — Regulatory & Insurance (California / San Diego)

*Context doc. Cited from current CPUC rules and CA case law. **Not legal or insurance advice** — RIDO needs a real CA transportation/employment lawyer and a commercial-TNC insurance broker. This captures the working understanding to have those conversations well, and the compliance facts that touch the product.*

## The good news: a navigable state path
California regulates TNCs at the **state** level via the **CPUC** — one agency, well-defined process, and small companies do obtain permits. This is the clean alternative to the city-by-city for-hire regulators (DC's DFHV, NYC's TLC) that destroyed Empower. RIDO should be a **fully compliant TNC from day one**, not an "unlicensed dispatcher."

## Permit
Apply for the **TNC subclass of a TCP-P charter-party carrier permit** (CPUC). Permits run **3 years**, renewable.

## Insurance (the load-bearing cost — RIDO's legal obligation)
| Period | Driver state | Required coverage |
|---|---|---|
| 1 | App on, no ride accepted | $50k/$100k/$30k + $200k excess |
| 2 & 3 | Ride accepted / passenger aboard | **$1,000,000 primary commercial liability** |
| — | — | $1M uninsured/underinsured motorist |

- The $1M during Periods 2/3 is RIDO's obligation (master policy or verified driver coverage). The cheap consumer "rideshare endorsement" (~$113–205/mo in CA) only patches the driver's personal-policy gap — it does **not** provide the $1M.
- **Cost is privately negotiated and unknown.** For a startup with no loss history, budget $1,500–$3,000/driver/yr as a placeholder — **replace with a real broker quote.** Whether it's a fixed minimum premium or a per-ride rate is the single biggest swing factor in early-stage burn.

## Worker classification: Prop 22 (upheld)
The CA Supreme Court **upheld Prop 22 (Castellanos v. State, July 2024)** → app-based transportation companies **can classify drivers as independent contractors.** No W-2 requirement. But Prop 22 carries obligations: a guaranteed earnings floor (120% of minimum wage for engaged time), per-mile expense compensation, a healthcare stipend, and occupational-accident coverage. **Wrinkle for RIDO:** if drivers set their own fares / keep most of the fare, how the Prop 22 earnings floor is computed and who owes it is non-obvious — a real lawyer question. (Default fallback if Prop 22 conditions aren't met is the AB5 ABC test.)

## Driver & vehicle compliance (these create product requirements)
CA TNCs must run: national criminal + sex-offender database checks, a DMV driver-history check, a **19-point vehicle inspection** before service and annually (or every 50k miles), a driver training program, a zero-tolerance drug/alcohol policy, and a 10-hour driving cap. Plus the fees below.

## Fees RIDO collects or owes

**These three have different shapes, and conflating them is the mistake to avoid** — only one is per-trip. Figures retrieved 2026-09-09; **counsel to confirm before RIDO remits anything.**

| Fee | Amount | Shape |
|---|---|---|
| **CPUC user fee** (PUCTRA) | **0.1%** of gross intrastate revenue, **plus a minimum $10/quarter or $25/year** | Aggregate, quarterly. **Not per-trip.** The minimum dominates until quarterly gross passes $10,000 |
| **Access for All** (SB 1376) | **$0.10 per completed TNC trip** | Per-trip, collected from the rider, remitted quarterly on the PUCTRA schedule. Offsettable against quarterly WAV-accessibility spending |
| **Airport per-trip fee** | **Unverified** — see below | Per-trip, but only inside an airport geofence |

- The user-fee **rate is reset annually by CPUC resolution** (0.1% is Resolution M-4878, effective 2026-01-01), so it must be re-checked each year rather than treated as a constant. Source: `https://www.cpuc.ca.gov/userfeerates`.
- **Open question for the attorney:** whether a TNC's "gross intrastate revenue" means the full fare or only RIDO's commission take. It is a ~5–8× difference in the fee, though small in absolute terms at pilot volume.
- Access for All runs to **Jan 1, 2032** (extended by AB 1532, signed 2025-10-01). Source: `https://www.cpuc.ca.gov/tncaccess/`.
- **San Diego International's per-trip fee is not yet confirmed.** A secondary source puts it at roughly $4.25–$5.00 depending on vehicle fuel type, citing Airport Authority Board Resolution 2025-0042 — **treat that as unverified** until the Commercial Mode Fee Schedule PDF on `san.org` is read directly. No number from it belongs in code or a quote until then.

### → Product implications (carried into `../architecture/data-model.md` and CLAUDE.md)
- `drivers` needs: `background_check_status`, `vehicle_inspection_status` (+ inspection date), `dmv_check_status`, `training_completed`.
- **Activation gate:** a driver cannot accept rides unless background check + vehicle inspection are passed and status is active. Enforce in DB and app, not just UI.
- Track and remit every fee above as a first-class line item (the Empower lesson: never build a discount on skipped fees). Each takes the shape of the fee: the **Access for All $0.10 is per-trip**, so it is quoted, itemised to the rider, and snapshotted onto the ride; the **user fee is aggregate**, so it is a quarterly report over completed rides and needs no per-ride column; the **airport fee is geofenced**, so it needs pickup coordinates RIDO does not yet store.

## Two professional flags (do not wing these)
1. **Commercial-TNC insurance broker — urgent.** The $1M master-policy cost gates the whole financial model.
2. **CA transportation + employment attorney.** For the CPUC permit, the Prop 22 × "drivers-set-fares" classification interaction, and the revenue base the user fee is assessed on (see the fee table).
