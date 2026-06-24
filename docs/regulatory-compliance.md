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
CA TNCs must run: national criminal + sex-offender database checks, a DMV driver-history check, a **19-point vehicle inspection** before service and annually (or every 50k miles), a driver training program, a zero-tolerance drug/alcohol policy, and a 10-hour driving cap. Plus a **CPUC fee of 0.33% of gross CA revenue**, and airport per-trip fees (confirm San Diego International's).

### → Product implications (carried into `technical-architecture.md` and CLAUDE.md)
- `drivers` needs: `background_check_status`, `vehicle_inspection_status` (+ inspection date), `dmv_check_status`, `training_completed`.
- **Activation gate:** a driver cannot accept rides unless background check + vehicle inspection are passed and status is active. Enforce in DB and app, not just UI.
- Track and remit the 0.33% CPUC fee and any airport surcharges as first-class line items (the Empower lesson: never build a discount on skipped fees).

## Two professional flags (do not wing these)
1. **Commercial-TNC insurance broker — urgent.** The $1M master-policy cost gates the whole financial model.
2. **CA transportation + employment attorney.** For the CPUC permit and the Prop 22 × "drivers-set-fares" classification interaction.
