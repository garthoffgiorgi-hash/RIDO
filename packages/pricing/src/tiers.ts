/**
 * Commission tier types and band traversal.
 *
 * Tiers are DATA, loaded from the `commission_tiers` table and passed in. This module never
 * hardcodes a rate or a boundary — see supabase/seed/commission_tiers.sql, the one home for
 * those values.
 */

import { type Cents, BPS_DENOMINATOR } from "./money.ts";

/** A single commission band. Bounds are integer cents; rate is basis points (2000 = 20%). */
export interface CommissionTier {
  readonly tierOrder: number;
  readonly lowerBoundCents: number;
  /** null means unbounded. */
  readonly upperBoundCents: number | null;
  readonly rateBps: number;
}

/** Renders a band for an error message, without assuming how many bands exist. */
function describe(tier: CommissionTier): string {
  const upper = tier.upperBoundCents === null ? "unbounded" : String(tier.upperBoundCents);
  return `tier ${tier.tierOrder} [${tier.lowerBoundCents}, ${upper}) @ ${tier.rateBps}bps`;
}

/**
 * Field-level checks on one band, independent of the others.
 *
 * Deliberately validates SHAPE, never VALUES: this package has no opinion about what a rate
 * should be, only that a band is coherent. Repricing is a row change in `commission_tiers`
 * (see docs/business/changing-rates.md) and must not require touching this file.
 */
function validateTier(tier: CommissionTier): void {
  if (!Number.isInteger(tier.tierOrder)) {
    throw new Error(`Invalid commission tier: tierOrder must be an integer — ${describe(tier)}`);
  }
  if (!Number.isInteger(tier.lowerBoundCents) || tier.lowerBoundCents < 0) {
    throw new Error(
      `Invalid commission tier: lowerBoundCents must be a non-negative integer — ${describe(tier)}`,
    );
  }
  if (tier.upperBoundCents !== null) {
    if (!Number.isInteger(tier.upperBoundCents)) {
      throw new Error(
        `Invalid commission tier: upperBoundCents must be an integer or null — ${describe(tier)}`,
      );
    }
    if (tier.upperBoundCents <= tier.lowerBoundCents) {
      throw new Error(
        `Invalid commission tier: upperBoundCents must exceed lowerBoundCents — ${describe(tier)}`,
      );
    }
  }
  if (!Number.isInteger(tier.rateBps) || tier.rateBps < 0 || tier.rateBps > BPS_DENOMINATOR) {
    // The upper bound is what guarantees commission <= fare, which in turn keeps
    // driver_payout_cents non-negative and commission_rate_bps inside the rides CHECK.
    throw new Error(
      `Invalid commission tier: rateBps must be an integer in [0, ${BPS_DENOMINATOR}] — ${describe(tier)}`,
    );
  }
}

/**
 * Sort tiers and assert they form a gapless, non-overlapping cover starting at 0 with exactly
 * one unbounded top band. A malformed tier set must fail loudly here rather than silently
 * under-charging every ride.
 *
 * Works for any number of bands — one, three, nine. Nothing downstream assumes a count, so
 * adding or removing a band is a row change, not a code change.
 */
export function normalizeTiers(tiers: readonly CommissionTier[]): readonly CommissionTier[] {
  if (tiers.length === 0) {
    throw new Error(
      "Invalid commission tiers: the set is empty. Every fare must fall in some band — " +
        "check the query filtering commission_tiers (active / effective_from).",
    );
  }

  for (const tier of tiers) validateTier(tier);

  const sorted = [...tiers].sort((a, b) => a.lowerBoundCents - b.lowerBoundCents);

  const first = sorted[0];
  if (first === undefined) throw new Error("Invalid commission tiers: the set is empty.");
  if (first.lowerBoundCents !== 0) {
    throw new Error(
      `Invalid commission tiers: the lowest band must start at 0, starts at ${first.lowerBoundCents}. ` +
        "A driver's first cent of the month has to be priced.",
    );
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current === undefined || next === undefined) {
      throw new Error("Invalid commission tiers: unexpected gap while walking the set.");
    }
    if (current.upperBoundCents === null) {
      throw new Error(
        `Invalid commission tiers: only the top band may be unbounded — ${describe(current)} is not last.`,
      );
    }
    if (current.upperBoundCents !== next.lowerBoundCents) {
      const problem = current.upperBoundCents < next.lowerBoundCents ? "gap" : "overlap";
      throw new Error(
        `Invalid commission tiers: ${problem} between ${describe(current)} and ${describe(next)}. ` +
          "Bands must tile the range exactly — one band's upper bound is the next one's lower bound.",
      );
    }
  }

  const last = sorted[sorted.length - 1];
  if (last === undefined) throw new Error("Invalid commission tiers: the set is empty.");
  if (last.upperBoundCents !== null) {
    throw new Error(
      `Invalid commission tiers: the top band must be unbounded (upperBoundCents null) — ${describe(last)}. ` +
        "Otherwise a high-earning driver's fares fall off the end of the table.",
    );
  }

  return sorted;
}

/**
 * Where a driver's month-to-date gross position sits among the tiers — the read-side counterpart
 * to `commissionForRide`'s band walk. Same half-open `[lower, upper)` rule, so a position sitting
 * exactly on a boundary belongs to the band ABOVE it, matching what the next cent of fare would
 * actually be charged.
 *
 * A discriminated union, not nullable fields on one shape. Being in the unbounded top band is a
 * genuinely different state, not a "climbing" state with missing data — there is no band width, no
 * next tier, and no meaningful "progress through" an interval with no end. Forcing that into a
 * `kind` makes every caller handle it, rather than rendering a progress bar stuck at 100%.
 *
 * Deliberately carries no `progressBps` or other pre-divided ratio. A ratio is a display concern;
 * the caller already has both integers here (`centsIntoCurrentBand` and `currentBandWidthCents`)
 * and can derive a segment width or a percentage itself. Adding one here would be rounding a
 * quantity that isn't money on its own — the same reasoning `commissionForRide`'s doc comment
 * gives for rounding once, at the end, on the only figure that actually is money.
 */
export type TierPosition =
  | {
      readonly kind: "climbing";
      readonly currentTier: CommissionTier;
      readonly nextTier: CommissionTier;
      /** How far into `currentTier`'s band the position sits. */
      readonly centsIntoCurrentBand: number;
      /** `currentTier.upperBoundCents - currentTier.lowerBoundCents`, handed back so a caller
       *  never re-derives it and risks disagreeing with which tier "current" actually is. */
      readonly currentBandWidthCents: number;
      /** `centsIntoCurrentBand + centsToNextTier === currentBandWidthCents`, always. */
      readonly centsToNextTier: number;
    }
  | {
      readonly kind: "top";
      readonly currentTier: CommissionTier;
      readonly centsIntoCurrentBand: number;
    };

/**
 * Finds the band `mtdGrossCents` falls in and reports the driver's position within it.
 *
 * Runs `normalizeTiers()` first, so a malformed tier set fails loudly here too rather than only
 * when a ride happens to be priced — the same "fail on the first read of the month, not silently
 * until someone crosses a boundary" posture `commissionForRide` takes.
 */
export function tierPositionFor(
  mtdGrossCents: Cents,
  tiers: readonly CommissionTier[],
): TierPosition {
  if (!Number.isInteger(mtdGrossCents) || mtdGrossCents < 0) {
    throw new Error(
      `tierPositionFor: mtdGrossCents must be a non-negative integer, got ${mtdGrossCents}`,
    );
  }

  const bands = normalizeTiers(tiers);

  // normalizeTiers guarantees a gapless cover with exactly one unbounded top band, so exactly one
  // band matches [lower, upper) for any non-negative position — this loop always finds one.
  for (const tier of bands) {
    const { lowerBoundCents, upperBoundCents } = tier;
    const inBand = upperBoundCents === null ? true : mtdGrossCents < upperBoundCents;
    if (mtdGrossCents < lowerBoundCents || !inBand) continue;

    const centsIntoCurrentBand = mtdGrossCents - lowerBoundCents;

    if (upperBoundCents === null) {
      return { kind: "top", currentTier: tier, centsIntoCurrentBand };
    }

    const nextTier = bands.find((t) => t.lowerBoundCents === upperBoundCents);
    if (nextTier === undefined) {
      // normalizeTiers already proved the bands tile exactly, so this can only mean a bug in the
      // walk above, not a malformed tier set — the set was already validated.
      throw new Error(
        `tierPositionFor: no band starts at ${upperBoundCents} — this is a bug, normalizeTiers should have caught it.`,
      );
    }

    return {
      kind: "climbing",
      currentTier: tier,
      nextTier,
      centsIntoCurrentBand,
      currentBandWidthCents: upperBoundCents - lowerBoundCents,
      centsToNextTier: upperBoundCents - mtdGrossCents,
    };
  }

  // Unreachable given normalizeTiers' guarantees; thrown rather than returning a fallback so a
  // future change to normalizeTiers' invariants fails loudly here instead of silently.
  throw new Error(
    `tierPositionFor: ${mtdGrossCents} cents matched no band — this is a bug, normalizeTiers should have caught it.`,
  );
}
