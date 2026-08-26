#!/usr/bin/env node --experimental-strip-types
/**
 * calibrate-fares — is our rate card still about 15% under an incumbent, and does the driver
 * still come out ahead?
 *
 *   node --experimental-strip-types scripts/calibrate-fares.ts          # print the report
 *   node --experimental-strip-types scripts/calibrate-fares.ts --check  # and fail if it drifted
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────────────────────
 *
 * RIDO's price is NEVER computed from a competitor's. Our rate card is our own; nothing at
 * runtime knows what anyone else charges. This script exists because those four numbers were
 * *chosen* to land a target margin below a modelled incumbent fare, and a target you never
 * re-check is a target you have quietly abandoned. (ADR-0009.)
 *
 * So the direction of causation matters: the seed is the source of truth and this reads it. If
 * the competitor model below is wrong, the report is wrong — a rider's price is not.
 *
 * It reads `supabase/seed/fare_rate_cards.sql` directly rather than taking a copy, so the table
 * it prints is a statement about the card that is actually committed. That is deliberate and it
 * is why there is no `fare.seed.test.ts` alongside `commission.seed.test.ts`: a test file pinning
 * the card by hand would keep passing on stale values after someone edits the seed, which is the
 * exact drift this repo spends effort preventing. Everything that depends on the real card is
 * asserted here, against the real card.
 *
 * Every RIDO figure comes from @rido/pricing — `quoteFare`, `commissionForRide`,
 * `earningsFloorForTrip`. This script implements no money math of its own (root CLAUDE.md
 * invariant 5).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BPS_DENOMINATOR,
  type CommissionTier,
  cents,
  commissionForRide,
  earningsFloorForTrip,
  type FareRateCard,
  quoteFare,
} from "@rido/pricing";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");

/**
 * ── THE COMPETITOR MODEL — the only place these live ─────────────────────────────────────────
 *
 * UberX, San Diego, as of 2026-08. **Estimates from third-party fare aggregators, not Uber's own
 * published rate card**, which is not public. Sources and dates:
 * `docs/business/competitor-pricing.md`. The booking fee in particular is reported as a range
 * ($1.85-$2.75) and is modelled here at a point.
 *
 * Treat every number here as an input to a report, never as an input to a price.
 */
const UBER_SAN_DIEGO = {
  baseCents: 110,
  perMileCents: 128,
  perMinuteCents: 31,
  bookingFeeCents: 250,
  minimumFareCents: 800,
} as const;

/**
 * Incumbent EFFECTIVE take — what the platform keeps once upfront pricing has decoupled the rider
 * price from driver pay. `docs/business/market-viability.md` puts this at 35-50% and flags that
 * the evidence is advocacy-sourced. 40% is the midpoint, and the report's conclusions are
 * genuinely sensitive to it — see the sensitivity note printed at the end.
 */
const INCUMBENT_TAKE_BPS = 4_000;

/** Prop 22, San Diego, 2026: 120% x $17.75/hr, plus the Treasurer's per-engaged-mile rate. */
const PROP_22 = { hourlyFloorCents: 2_130, perEngagedMileCents: 37 };

/** The target this card was calibrated to, and how far it may drift before --check complains. */
const TARGET_DISCOUNT_BPS = 1_500;
const TOLERANCE_BPS = 200;

/**
 * A San Diego / UCSD spread. Not a demand distribution — a deliberately awkward set that includes
 * the shapes where a rate card is most likely to misbehave: the floor-bound hop and the slow
 * crawl where time dominates distance.
 */
const TRIPS: ReadonlyArray<{ label: string; miles: number; minutes: number }> = [
  { label: "campus hop", miles: 1.2, minutes: 6 },
  { label: "short + gridlock", miles: 1.0, minutes: 25 },
  { label: "UCSD->La Jolla", miles: 3.0, minutes: 12 },
  { label: "typical", miles: 5.0, minutes: 15 },
  { label: "UCSD->downtown", miles: 12.0, minutes: 22 },
  { label: "airport run", miles: 14.0, minutes: 28 },
  { label: "long freeway", miles: 25.0, minutes: 35 },
];

// ------------------------------------------------------------------ read the committed card

function parseSeededCard(market: string): FareRateCard {
  const sql = readFileSync(resolve(ROOT, "supabase/seed/fare_rate_cards.sql"), "utf8");
  // Strip line comments so the worked example in the seed's footer can't be parsed as a row.
  const body = sql.replace(/--[^\n]*/g, "");
  const rows = [...body.matchAll(/\(\s*'([^']+)'\s*,([^)]*)\)/g)];

  for (const [, rowMarket, rest] of rows) {
    if (rowMarket !== market) continue;
    const values = rest.split(",").map((v) => v.trim());
    // (market, base, per_mile, per_minute, minimum, active, effective_from)
    const [base, perMile, perMinute, minimum, active] = values;
    if (!/^true$/i.test(active ?? "")) continue;
    return {
      baseCents: Number(base),
      perMileCents: Number(perMile),
      perMinuteCents: Number(perMinute),
      minimumFareCents: Number(minimum),
    };
  }
  throw new Error(
    `calibrate-fares: no active '${market}' card in supabase/seed/fare_rate_cards.sql`,
  );
}

function parseSeededTiers(): CommissionTier[] {
  const sql = readFileSync(resolve(ROOT, "supabase/seed/commission_tiers.sql"), "utf8");
  const body = sql.replace(/--[^\n]*/g, "");
  const region = body.slice(body.search(/\bvalues\b/i));
  const rows = [...region.matchAll(/\(([^)]*)\)/g)];
  const tiers: CommissionTier[] = [];
  for (const [, rest] of rows) {
    const v = rest.split(",").map((x) => x.trim());
    if (v.length < 6 || !/^true$/i.test(v[4])) continue;
    tiers.push({
      tierOrder: Number(v[0]),
      lowerBoundCents: Number(v[1]),
      upperBoundCents: /^null$/i.test(v[2]) ? null : Number(v[2]),
      rateBps: Number(v[3]),
    });
  }
  if (tiers.length === 0)
    throw new Error("calibrate-fares: no active commission tiers in the seed");
  return tiers.sort((a, b) => a.tierOrder - b.tierOrder);
}

// ------------------------------------------------------------------------------- the model

const metres = (mi: number) => Math.round(mi * 1609.344);
const seconds = (min: number) => Math.round(min * 60);

/** The competitor's fare, modelled. Their booking fee is platform revenue, so it is in the price. */
function uberFareCents(miles: number, minutes: number): number {
  const metered =
    UBER_SAN_DIEGO.baseCents +
    Math.round(UBER_SAN_DIEGO.perMileCents * miles) +
    Math.round(UBER_SAN_DIEGO.perMinuteCents * minutes) +
    UBER_SAN_DIEGO.bookingFeeCents;
  return Math.max(UBER_SAN_DIEGO.minimumFareCents, metered);
}

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;
const pad = (s: string, n: number) => s.padStart(n);

const card = parseSeededCard("san-diego");
const tiers = parseSeededTiers();
/** The worst commission band a driver can be in — the hardest case for the driver comparison. */
const worstBandBps = Math.max(...tiers.map((t) => t.rateBps));
const bestBandBps = Math.min(...tiers.map((t) => t.rateBps));

console.log("\nRIDO fare calibration");
console.log(
  `  card (from supabase/seed/fare_rate_cards.sql): base ${usd(card.baseCents)} · ${usd(card.perMileCents)}/mi · ${usd(card.perMinuteCents)}/min · min ${usd(card.minimumFareCents)}`,
);
console.log(
  `  modelled UberX San Diego: base ${usd(UBER_SAN_DIEGO.baseCents)} · ${usd(UBER_SAN_DIEGO.perMileCents)}/mi · ${usd(UBER_SAN_DIEGO.perMinuteCents)}/min · booking ${usd(UBER_SAN_DIEGO.bookingFeeCents)} · min ${usd(UBER_SAN_DIEGO.minimumFareCents)}`,
);
console.log(
  `  target ${pct(TARGET_DISCOUNT_BPS)} +/- ${pct(TOLERANCE_BPS)} · incumbent effective take ${pct(INCUMBENT_TAKE_BPS)} (estimate)\n`,
);

const header = [
  pad("trip", 18),
  pad("Uber", 9),
  pad("RIDO", 9),
  pad("disc", 8),
  pad("Uber drv", 10),
  pad(`RIDO@${pct(worstBandBps)}`, 12),
  pad(`RIDO@${pct(bestBandBps)}`, 12),
  pad("P22 floor", 11),
  pad("gap", 9),
].join("");
console.log(header);
console.log("-".repeat(header.length));

let worstDeviationBps = 0;
const driverLosesOn: string[] = [];
const belowFloorOn: string[] = [];
let totalUber = 0;
let totalRido = 0;

for (const trip of TRIPS) {
  const distanceMeters = metres(trip.miles);
  const durationSeconds = seconds(trip.minutes);

  const rido = quoteFare({ distanceMeters, durationSeconds, rateCard: card }).fareCents;
  const uber = uberFareCents(trip.miles, trip.minutes);
  totalRido += rido;
  totalUber += uber;

  const discountBps = Math.round(((uber - rido) / uber) * BPS_DENOMINATOR);
  worstDeviationBps = Math.max(worstDeviationBps, Math.abs(discountBps - TARGET_DISCOUNT_BPS));

  // The driver comparison at the WORST band: if RIDO wins here, it wins everywhere.
  const worstBand: CommissionTier[] = [
    { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: null, rateBps: worstBandBps },
  ];
  const bestBand: CommissionTier[] = [
    { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: null, rateBps: bestBandBps },
  ];
  const ridoWorst = commissionForRide({
    fareCents: cents(rido),
    mtdGrossCents: cents(0),
    tiers: worstBand,
  }).driverPayoutCents;
  const ridoBest = commissionForRide({
    fareCents: cents(rido),
    mtdGrossCents: cents(0),
    tiers: bestBand,
  }).driverPayoutCents;
  const uberDriver = uber - Math.round((uber * INCUMBENT_TAKE_BPS) / BPS_DENOMINATOR);

  if (ridoWorst <= uberDriver) driverLosesOn.push(trip.label);

  const floor = earningsFloorForTrip(
    { engagedSeconds: durationSeconds, engagedMeters: distanceMeters },
    PROP_22,
  ).floorCents;
  if (ridoWorst < floor) belowFloorOn.push(trip.label);

  console.log(
    [
      pad(trip.label, 18),
      pad(usd(uber), 9),
      pad(usd(rido), 9),
      pad(pct(discountBps), 8),
      pad(usd(uberDriver), 10),
      pad(usd(ridoWorst), 12),
      pad(usd(ridoBest), 12),
      pad(usd(floor), 11),
      pad(usd(ridoWorst - floor), 9),
    ].join(""),
  );
}

const basketBps = Math.round(((totalUber - totalRido) / totalUber) * BPS_DENOMINATOR);
console.log("-".repeat(header.length));
console.log(
  [pad("BASKET", 18), pad(usd(totalUber), 9), pad(usd(totalRido), 9), pad(pct(basketBps), 8)].join(
    "",
  ),
);

console.log(`\n  worst deviation from target: ${(worstDeviationBps / 100).toFixed(2)} points`);
if (driverLosesOn.length === 0) {
  console.log("  driver beats an incumbent driver on every trip, even at our worst band");
} else {
  console.log(`  DRIVER LOSES on: ${driverLosesOn.join(", ")}`);
}
if (belowFloorOn.length > 0) {
  console.log(
    `  below the Prop 22 per-trip floor at our worst band on: ${belowFloorOn.join(", ")}`,
  );
  console.log(
    "    (a diagnostic, not a debt — the guarantee is assessed on a two-week aggregate. See\n" +
      "     packages/pricing/src/earnings-floor.ts and docs/compliance/ca-tnc.md.)",
  );
}
console.log(
  `\n  Sensitivity: the driver comparison assumes an incumbent take of ${pct(INCUMBENT_TAKE_BPS)}, which\n` +
    "  docs/business/market-viability.md gives as a 35-50% range from advocacy-sourced data. The\n" +
    "  monthly break-even for a driver — once the flat fee turns on — moves a long way across that\n" +
    "  range. See docs/business/fare-pricing.md.\n",
);

if (!CHECK) process.exit(0);

const problems: string[] = [];
// A card that cannot be priced should fail here rather than at a rider's first quote. quoteFare
// validates it on every call above, so reaching this point already proves it — stated explicitly
// because it is the reason no separate structural test of the seeded card exists.
if (worstDeviationBps > TOLERANCE_BPS) {
  problems.push(
    `the discount drifted ${(worstDeviationBps / 100).toFixed(2)} points from the ${pct(TARGET_DISCOUNT_BPS)} target, past the ${pct(TOLERANCE_BPS)} tolerance`,
  );
}
if (driverLosesOn.length > 0) {
  problems.push(`a driver would earn less than on an incumbent for: ${driverLosesOn.join(", ")}`);
}

if (problems.length === 0) {
  console.log("✓ calibration holds\n");
  process.exit(0);
}

console.error("calibration FAILED:");
for (const problem of problems) console.error(`  - ${problem}`);
console.error(
  "\nThe rate card in supabase/seed/fare_rate_cards.sql no longer does what it was calibrated to do.\n" +
    "Either retune it, or change the target deliberately and update docs/business/fare-pricing.md.\n",
);
process.exit(1);
