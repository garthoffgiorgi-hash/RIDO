# packages/pricing — CLAUDE.md

The money. Every commission, payout, and fee figure in RIDO originates here. Nothing in this
package may be duplicated anywhere else in the repo.

## Hard rules

- **Zero dependencies.** No Next, no Supabase, no Stripe, no date library, no test-framework
  import in source files. This package is consumed by three different runtimes — a bundler
  (`apps/web`), Deno (`supabase/functions`), and a browser tool (`tools/pilot-model`). One
  runtime-specific import breaks two of them.
- **Pure functions only.** No I/O, no `Date.now()`, no `process.env`. Tiers, the driver's
  month-to-date volume, and the current time are *arguments*. A function that reads the database
  belongs in the caller, not here.
- **Integer cents in, integer cents out.** Inputs, outputs, and intermediates are integers. Rates
  are basis points (`2000` = 20%), never decimals like `0.2`.
- **Relative imports carry the `.ts` extension** (`import { x } from "./tiers.ts"`) so Deno
  resolves them natively without a build step. `apps/web` sets `allowImportingTsExtensions`.
- **Rounding:** round the *commission* half-up to the nearest cent, then derive
  `payout = fare - commission`. Never round both independently — the two must sum to the fare
  exactly, always. Assert it in every test.

## The rule being implemented

Bracketed (marginal) commission, like tax brackets, over the driver's **month-to-date fare
volume**. A ride is rated against the driver's MTD position at completion and split across
whatever bands it spans, then snapshotted onto the `rides` row.

This is mathematically identical to re-bracketing the whole month at month-end, which is why
there is **no reconciliation job and no whole-month re-rating**. See
`docs/decisions/0002-bracketed-per-ride-commission.md`.

**Never implement the cliff variant** (whole month at one rate by total volume). It lets more
earnings yield less take-home and invites gaming the $1,000 / $3,000 lines.

## Shape

| File | Holds |
|---|---|
| `src/money.ts` | Cent/bps primitives, rounding, formatting-free arithmetic |
| `src/tiers.ts` | The `CommissionTier` type, `normalizeTiers()`, and `tierPositionFor()` — where an MTD position sits among the bands, for the driver-facing tier-progress card |
| `src/commission.ts` | `commissionForRide({ fareCents, mtdGrossCents, tiers })` |
| `src/subscription.ts` | Flat-fee resolution: pilot ($0) vs standard ($5000) |
| `src/fare.ts` | `quoteFare({ distanceMeters, durationSeconds, rateCard })` — what a ride COSTS |
| `src/earnings-floor.ts` | Prop 22's guaranteed minimum. A diagnostic, not a rule |
| `src/index.ts` | The public surface. Callers import only from here |

`fare.ts` is the mirror image of `commission.ts`: one decides what a ride costs, the other how that
is split. Same rules — pure, integer cents, no rate as a literal, the card is a row in
`fare_rate_cards`. Its per-mile term converts metres exactly by scaling the numerator, since a mile
is a fractional number of metres. Whether the card sits ~15% under an incumbent is checked by
`scripts/calibrate-fares.ts`, not by a test in here: see `docs/business/fare-pricing.md`.

## Tests are the specification

Colocated `*.test.ts`. A change to the math without a change to the tests is wrong. This package
is the top tier of ADR-0007: **merge is blocked without these.** A wrong figure here is
snapshotted onto the `rides` row and never recomputed, so it isn't a bug that gets fixed — it's a
permanent error in the accounting record.

Required cases:

- **Boundaries:** $0, $999.99, $1,000.00, $1,000.01, $2,999.99, $3,000.00, $3,000.01 of MTD volume.
- **Spanning rides:** a single ride that crosses one band boundary, and one that crosses both.
- **Monotonicity:** for any fare, higher MTD volume never produces a *higher* marginal rate, and
  a larger fare never produces a smaller payout.
- **Exactness:** `commissionCents + payoutCents === fareCents`. Every case. No exceptions.
- **Subscription:** pilot ($0 fee, commission still on) vs steady state ($50 fee).

The same suite must pass under Deno (`deno test`) as well as the web test runner. That
cross-runtime run is what proves the Edge Function and the app compute the same number — it is
the guard against the one failure mode that would silently break the books.

### One file knows the rates; the rest know the rules

The rates aren't settled — repricing after market research is expected, and it must not mean
rewriting the suite. So the tests are split:

- **`commission.seed.test.ts` is the only file that names a rate or a boundary.** It mirrors
  `supabase/seed/commission_tiers.sql` and pins the worked examples the docs publish. **A
  repricing is supposed to break it** — that's the tripwire that stops new rates from silently
  contradicting the marketing copy. Verified: swapping the seed for a different band count and
  different rates fails exactly these tests and nothing else.
- **Every other test uses synthetic fixtures invented for the test** and asserts properties that
  hold for *any* valid tier set — exactness, monotonicity, band-count independence, boundary
  splitting. If one of those breaks after a rate change, the math broke, not the pricing.

Procedure for an actual repricing: `docs/business/changing-rates.md`.

## Rounding, and what "identical to month-end" really means

Commission accumulates an **exact integer numerator** — the sum of (slice × rate) across the bands
a ride spans — and rounds **once**, at the end. Payout is then derived as `fare − commission`.
Never round per band and sum: that rounds quantities that aren't money on their own, and the error
compounds. Nothing in the path is ever a fractional value.

ADR-0002 says per-ride bracketing is "mathematically identical" to bracketing the whole month in
one pass. Exactly true unrounded; true to within a cent per boundary-crossing ride once each is
rounded to whole cents. It never matters, because nothing computes the whole-month figure —
`driver_monthly_stats` is the **sum of the snapshots**, so there is no second computation to
disagree with. Worth knowing before someone writes a reconciliation script, sees a three-cent gap,
and concludes the books are broken.
