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

/** Prices a measured trip against the market's active card. Composes the two server-only reads. */
export async function quoteRide(
  measurement: RouteMeasurement,
  market: string,
): Promise<FaresResult<FareQuote>> {
  const card = await getActiveFareRateCard(market);
  if (!card.ok) return card;

  return {
    ok: true,
    data: quoteFare({
      distanceMeters: measurement.distanceMeters,
      durationSeconds: measurement.durationSeconds,
      rateCard: card.data,
    }),
  };
}
