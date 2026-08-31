/**
 * What to put on hold when a rider books, before anyone knows what the trip will actually cost.
 *
 * The third money question this package answers. `fare.ts` decides what a ride COSTS,
 * `commission.ts` decides how that is SPLIT, and this decides what to AUTHORIZE — which is a
 * different number from all of them, because an authorization is placed against an estimate and
 * captured against a fact.
 *
 * Same rules as the rest of the package: pure, integer cents, and not one rate written as a
 * literal. The buffer is a column on `fare_rate_cards` (`authorization_buffer_bps`), exactly as
 * the four fare values are, because tuning what RIDO holds on a rider's card must not be a deploy.
 *
 * ── WHY A BUFFER EXISTS AT ALL ──────────────────────────────────────────────────────────────
 *
 * A card authorization sets a ceiling. Stripe will capture any amount UP TO what was authorized
 * and nothing above it, and a hold cannot be raised after the fact — the only way to hold more is
 * to void and re-authorize, which means a fresh card interaction with a rider whose ride has just
 * ended. That is the worst possible moment to discover the hold was a dollar short.
 *
 * So the hold is placed above the quote, and the capture takes only what the ride actually cost.
 * The buffer is never charged; it is released. A rider is charged the fare, always.
 *
 * ── AND WHY IT IS UNUSED HEADROOM TODAY ────────────────────────────────────────────────────
 *
 * Nothing in RIDO currently reprices a fare at completion: `apply_ride_commission` reads the ride's
 * stored `fare_cents` and never writes it, so the quoted fare IS the captured fare, and the
 * buffered portion is always released untouched. The seed still sets a real buffer, because the
 * day repricing-from-actuals ships, every hold already in flight needs to have been big enough —
 * and by then it is far too late to widen them.
 */

import { applyMultiplierBps, type Bps, BPS_DENOMINATOR, type Cents } from "./money.ts";

export interface HoldInput {
  /**
   * What the rider is expected to owe: `FareQuote.riderTotalCents`, the fare plus any
   * non-commissionable pass-throughs. NOT `fareCents` — a hold has to cover everything the rider
   * will actually be charged, and a pass-through is still money that leaves their card.
   */
  readonly riderTotalCents: Cents;
  /**
   * Headroom above that total, in basis points. `0` holds exactly the rider total; `1500` holds
   * 15% more. Read from `fare_rate_cards.authorization_buffer_bps` — never written at a call site.
   */
  readonly bufferBps: Bps;
}

/**
 * The amount to authorize for a ride.
 *
 * Built on `applyMultiplierBps` rather than `applyBps` for a reason the money module spells out:
 * `applyBps` takes a SHARE of an amount and refuses a rate above 100%, which is load-bearing for
 * commission. This SCALES an amount past 1.00x, which is exactly what adding headroom means.
 * Expressing the buffer as `BPS_DENOMINATOR + bufferBps` keeps a zero buffer an exact 1.00x — so
 * "no buffer configured" and "hold the quote" are the same number rather than two nearby ones.
 *
 * Guaranteed to return at least `riderTotalCents`: a hold below what the rider owes could not be
 * captured in full, which would silently under-charge for a completed ride.
 */
export function holdAmountCents(input: HoldInput): Cents {
  const { riderTotalCents, bufferBps } = input;

  if (!Number.isInteger(riderTotalCents) || riderTotalCents < 0) {
    throw new Error(
      `holdAmountCents riderTotalCents must be a non-negative integer, got ${riderTotalCents}`,
    );
  }
  if (!Number.isInteger(bufferBps) || bufferBps < 0) {
    throw new Error(`holdAmountCents bufferBps must be a non-negative integer, got ${bufferBps}`);
  }

  return applyMultiplierBps(riderTotalCents, (BPS_DENOMINATOR + bufferBps) as Bps);
}
