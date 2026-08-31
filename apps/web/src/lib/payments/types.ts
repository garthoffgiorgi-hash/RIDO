/**
 * A TEMPORARY bridge over `database.types.ts`, exactly like `src/lib/payouts/types.ts` and for the
 * same reason: the generated types have not been regenerated since these migrations were written,
 * and this container has no Docker, so `supabase gen types` cannot run here.
 *
 * **Delete this file once the three payment migrations are live and `npm run types:generate` has
 * run**, then import from `@/types/database.types` instead. While this exists, a genuine drift
 * between these shapes and the real schema compiles clean — which is the cost of the stopgap and
 * the reason it is meant to be short-lived.
 *
 * Deliberately narrow: it patches exactly what the migrations added and nothing else.
 */

export type ChargeStatus = "authorizing" | "authorized" | "captured" | "voided" | "failed";

/**
 * `ride_charges` — the inbound ledger (20260902120100).
 *
 * Note there is no `kind`: whether a captured row was a fare or a cancellation fee is answered by
 * the ride's own terminal status, in one place, rather than stored twice.
 */
export interface RideChargeRow {
  readonly id: string;
  readonly ride_id: string;
  readonly rider_id: string;
  readonly authorized_cents: number;
  readonly captured_cents: number | null;
  readonly status: ChargeStatus;
  readonly stripe_payment_intent_id: string | null;
  readonly failure_reason: string | null;
  readonly attempt_count: number;
  readonly settling: boolean;
  readonly settling_since: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** `rider_payment_profiles` — who a rider is to Stripe, and which card they saved (20260902120000). */
export interface RiderPaymentProfileRow {
  readonly rider_id: string;
  readonly stripe_customer_id: string;
  readonly default_payment_method_id: string | null;
  readonly card_brand: string | null;
  readonly card_last4: string | null;
  readonly card_exp_month: number | null;
  readonly card_exp_year: number | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * The three columns the payment migrations add to `fare_rate_cards`. The four fare values already
 * exist in the generated type, so only the new ones are bridged.
 */
export interface FareRateCardPaymentColumns {
  readonly authorization_buffer_bps: number;
  readonly cancellation_fee_cents: number;
  readonly cancellation_grace_seconds: number;
}
