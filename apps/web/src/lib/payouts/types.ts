/**
 * A TEMPORARY bridge over `database.types.ts`, which is generated from the live schema and has not
 * been regenerated since `20260901120000_create_driver_payouts.sql` was written. This container has
 * no Docker, so `supabase gen types` cannot run here — the same gap ADR-0011's address columns and
 * ADR-0012's nullable `driver_id` each had until the migration was pushed and regenerated.
 *
 * **Delete this file once the migration is live and `npm run types:generate` has run.** What it
 * declares should then be byte-identical to what the generator produces, and every consumer below
 * should import from `@/types/database.types` instead. That deletion is a real to-do, not a
 * nicety: while this exists, a genuine drift in these two shapes compiles clean.
 *
 * Deliberately narrow — it patches exactly what the migration added and nothing else, so any other
 * schema drift still fails the build the way it should.
 */

export type PayoutStatus = "pending" | "paid" | "failed";

/** `driver_payouts` — the table the migration adds, absent from the generated types entirely. */
export interface DriverPayoutRow {
  readonly id: string;
  readonly driver_id: string;
  readonly ride_id: string | null;
  readonly amount_cents: number;
  readonly status: PayoutStatus;
  readonly stripe_transfer_id: string | null;
  readonly failure_reason: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * The two columns the migration adds to `drivers`. `stripe_account_id` already exists in the
 * generated type — it has been on the table since the first migration — so only the new pair is
 * bridged here.
 */
export interface DriverConnectColumns {
  readonly stripe_payouts_enabled: boolean;
  readonly stripe_details_submitted: boolean;
}
