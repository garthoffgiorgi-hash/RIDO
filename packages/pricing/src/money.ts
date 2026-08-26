/**
 * Money primitives. Integer cents and basis points only — no floats, no dollars, ever.
 *
 * These are branded types so a bare `number` can't be passed where cents are expected. It costs
 * one cast at the boundary and buys compile-time protection on the most important values in
 * the business.
 */

export type Cents = number & { readonly __brand: "Cents" };
export type Bps = number & { readonly __brand: "Bps" };

export const cents = (n: number): Cents => {
  if (!Number.isInteger(n)) throw new Error(`Cents must be an integer, got ${n}`);
  return n as Cents;
};

export const bps = (n: number): Bps => {
  if (!Number.isInteger(n)) throw new Error(`Bps must be an integer, got ${n}`);
  return n as Bps;
};

/**
 * Basis points per whole unit: 10,000 bps = 100%. The one place this conversion factor lives.
 *
 * This is a unit definition, not a rate — the rates themselves are rows in `commission_tiers`
 * and never appear in this package.
 */
export const BPS_DENOMINATOR = 10_000;

/**
 * Divide two non-negative integers, rounding half-up, without ever producing a fractional
 * intermediate.
 *
 * Written with an explicit quotient/remainder rather than `Math.round(n / d)` because the naive
 * form has two failure modes that matter when the result is money: `Math.round` rounds -0.5
 * toward zero rather than half-up, and at large magnitudes a floating-point quotient can land a
 * hair below an integer and floor to the wrong side. Comparing `remainder * 2` against the
 * divisor decides the tie in exact integer arithmetic instead.
 *
 * Callers guarantee non-negative inputs; commission and fares are never negative.
 */
export function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new Error(
      `roundHalfUpDiv numerator must be a non-negative safe integer, got ${numerator}`,
    );
  }
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error(
      `roundHalfUpDiv denominator must be a positive safe integer, got ${denominator}`,
    );
  }

  const quotient = Math.floor(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

/**
 * Apply a basis-point rate to an amount, rounding half-up to the cent.
 *
 * Callers round the COMMISSION and derive payout as `fare - commission`. Never round both —
 * they must sum to the fare exactly, because the snapshot is the accounting record.
 *
 * Note that `commissionForRide` does NOT call this once per band. A ride spanning several bands
 * accumulates one exact numerator and rounds a single time; rounding each band separately would
 * round quantities that aren't money on their own. See ./commission.ts.
 */
export function applyBps(amount: Cents, rate: Bps): Cents {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`applyBps amount must be a non-negative integer, got ${amount}`);
  }
  if (!Number.isInteger(rate) || rate < 0 || rate > BPS_DENOMINATOR) {
    throw new Error(`applyBps rate must be an integer in [0, ${BPS_DENOMINATOR}], got ${rate}`);
  }
  if (!Number.isSafeInteger(amount * rate)) {
    throw new Error(`applyBps overflows exact integer arithmetic: ${amount} x ${rate}`);
  }

  return cents(roundHalfUpDiv(amount * rate, BPS_DENOMINATOR));
}

/**
 * Scale an amount by a basis-point MULTIPLIER, which may exceed 1.00x.
 *
 * Deliberately separate from `applyBps` rather than relaxing its upper bound. The two look alike
 * and are not the same thing:
 *
 *   applyBps           takes a SHARE of an amount. A rate above 100% is meaningless, and the
 *                      `rate <= BPS_DENOMINATOR` check is load-bearing — it is what guarantees
 *                      `commission <= fare`, and therefore `payout >= 0` and a `commission_rate_bps`
 *                      the database's CHECK will accept. Widening it to admit surge would quietly
 *                      remove that guarantee from the commission path.
 *   applyMultiplierBps SCALES an amount. 20,000 bps is 2.00x, which is exactly what a demand
 *                      multiplier means and exactly what a commission rate must never be.
 *
 * Same rounding, so a scaled amount and a shared amount can never disagree by a cent.
 */
export function applyMultiplierBps(amount: Cents, multiplier: Bps): Cents {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`applyMultiplierBps amount must be a non-negative integer, got ${amount}`);
  }
  if (!Number.isInteger(multiplier) || multiplier < 0) {
    throw new Error(
      `applyMultiplierBps multiplier must be a non-negative integer, got ${multiplier}`,
    );
  }
  if (!Number.isSafeInteger(amount * multiplier)) {
    throw new Error(
      `applyMultiplierBps overflows exact integer arithmetic: ${amount} x ${multiplier}`,
    );
  }

  return cents(roundHalfUpDiv(amount * multiplier, BPS_DENOMINATOR));
}
