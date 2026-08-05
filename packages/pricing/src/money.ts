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
 * Apply a basis-point rate to an amount, rounding half-up to the cent.
 *
 * Callers round the COMMISSION and derive payout as `fare - commission`. Never round both —
 * they must sum to the fare exactly, because the snapshot is the accounting record.
 */
export function applyBps(_amount: Cents, _rate: Bps): Cents {
  throw new Error("not implemented");
}
