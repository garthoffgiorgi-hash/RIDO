import "server-only";

import { type FareQuote, type FareRateCard, quoteFare } from "@rido/pricing";
import { createServerClient } from "@/lib/supabase/server";
import type { RouteMeasurement } from "@/lib/maps/types.ts";
import { failed, type FaresResult } from "./result.ts";

/**
 * Reads what a ride costs. `measureRoute()` (`src/lib/maps/server.ts`) answers "how far", this
 * answers "how much" — together they're the two server-only inputs a quote needs, and neither one
 * is ever trusted from a client. ADR-0009, ADR-0010.
 *
 * Nothing here does money math. `quoteFare()` is `@rido/pricing`'s; this module's only job is
 * reading the rate card the database says is active and handing it to that function.
 */

/**
 * The rate card in force for `market` right now, or a failure already in RIDO's voice.
 *
 * Reads through `active_fare_rate_card()`, which resolves "today" against
 * `America/Los_Angeles` — root `CLAUDE.md` invariant 9 — so this never re-derives that boundary
 * itself. RLS on `fare_rate_cards` requires `authenticated`, so this must run with a signed-in
 * user's session, not the anon client.
 */
export async function getActiveFareRateCard(market: string): Promise<FaresResult<FareRateCard>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("active_fare_rate_card", { p_market: market });

  if (error) {
    return failed(`We couldn't load pricing for ${market} right now. Try again in a moment.`);
  }

  const row = data?.[0];
  if (!row) {
    return failed(`There's no active rate card for ${market} yet.`);
  }

  return {
    ok: true,
    data: {
      baseCents: row.base_cents,
      perMileCents: row.per_mile_cents,
      perMinuteCents: row.per_minute_cents,
      minimumFareCents: row.minimum_fare_cents,
    },
  };
}

/**
 * The payment policy on the same active card: how much headroom to hold above a quote, and what a
 * late cancellation costs.
 *
 * A separate read from `getActiveFareRateCard` because these are not fare inputs — `quoteFare()`
 * has no business knowing about authorizations, and `FareRateCard` stays the four values that
 * decide a price. Same row, different question.
 *
 * `active_fare_rate_card` returns `setof fare_rate_cards`, so the columns the payment migrations
 * added arrive here without the function needing to change.
 */
export interface PaymentPolicy {
  readonly authorizationBufferBps: number;
  readonly cancellationFeeCents: number;
  readonly cancellationGraceSeconds: number;
}

export async function getPaymentPolicy(market: string): Promise<FaresResult<PaymentPolicy>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("active_fare_rate_card", { p_market: market });

  if (error) {
    return failed(`We couldn't load pricing for ${market} right now. Try again in a moment.`);
  }

  const row = data?.[0] as
    | {
        authorization_buffer_bps?: number;
        cancellation_fee_cents?: number;
        cancellation_grace_seconds?: number;
      }
    | undefined;

  if (!row) return failed(`There's no active rate card for ${market} yet.`);

  // Defaulting to zero rather than throwing: all three columns default to 0 in the schema, and 0
  // means "this policy is off for this market" — hold exactly the quote, charge no fee. A market
  // that has not decided should behave as though it decided nothing, not fail to take bookings.
  return {
    ok: true,
    data: {
      authorizationBufferBps: row.authorization_buffer_bps ?? 0,
      cancellationFeeCents: row.cancellation_fee_cents ?? 0,
      cancellationGraceSeconds: row.cancellation_grace_seconds ?? 0,
    },
  };
}

/**
 * What this market makes RIDO collect on someone else's behalf — today, only California's SB 1376
 * fee (ADR-0024).
 *
 * A third read off the same row, for the same reason `getPaymentPolicy` is a second one: a
 * pass-through is not a fare input. `quoteFare()` receives the amount as an argument and has no
 * idea what the CPUC is, and `FareRateCard` stays the four values that decide a price. Same row,
 * a third question.
 */
export interface PassThroughPolicy {
  readonly accessForAllFeeCents: number;
}

export async function getPassThroughPolicy(
  market: string,
): Promise<FaresResult<PassThroughPolicy>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("active_fare_rate_card", { p_market: market });

  if (error) {
    return failed(`We couldn't load pricing for ${market} right now. Try again in a moment.`);
  }

  const row = data?.[0] as { access_for_all_fee_cents?: number } | undefined;
  if (!row) return failed(`There's no active rate card for ${market} yet.`);

  // Defaulting to zero for the same reason `getPaymentPolicy` does, with one difference worth
  // stating: for the payment columns a 0 means "this policy is off", but here it is a claim that
  // the market owes no statutory fee. The seed asserts the real value precisely so a live database
  // never sits on this default silently — `supabase/tests/025_access_for_all_fee.sql` pins it.
  return { ok: true, data: { accessForAllFeeCents: row.access_for_all_fee_cents ?? 0 } };
}

/**
 * Prices a measured trip against the market's active card, plus whatever that market makes RIDO
 * collect on top.
 *
 * Both reads hit the same `active_fare_rate_card` row, and they run concurrently rather than in
 * sequence: `quoteRideRequest()` is called every time a rider changes pickup or dropoff, so this
 * is a hot path and the second read must not cost a second round trip. They stay two functions
 * because they answer two different questions and hand back two different types — a pass-through
 * is not a fare input — but nothing about that requires waiting.
 */
export async function quoteRide(
  measurement: RouteMeasurement,
  market: string,
): Promise<FaresResult<FareQuote>> {
  const [card, passThrough] = await Promise.all([
    getActiveFareRateCard(market),
    getPassThroughPolicy(market),
  ]);
  if (!card.ok) return card;
  if (!passThrough.ok) return passThrough;

  return {
    ok: true,
    data: quoteFare({
      distanceMeters: measurement.distanceMeters,
      durationSeconds: measurement.durationSeconds,
      rateCard: card.data,
      accessForAllFeeCents: passThrough.data.accessForAllFeeCents,
    }),
  };
}
