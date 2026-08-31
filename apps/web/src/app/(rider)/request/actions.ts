"use server";

import type { Coordinates, Place } from "@/lib/maps/types";
import * as payments from "@/lib/payments/server";
import * as rides from "@/lib/rides/server";

/**
 * Thin Server Action wrappers over `src/lib/rides/server.ts` — matching `/dev/maps/actions.ts`'s
 * pattern. `server.ts` carries `import "server-only"` and is not itself a `"use server"` module,
 * so a Client Component can't import its functions directly (Next.js refuses the build, correctly
 * — that file pulls in the service-role client). This file is the only bridge.
 */

export async function quoteRideRequest(pickup: Coordinates, dropoff: Coordinates) {
  return rides.quoteRideRequest(pickup, dropoff);
}

export async function requestRide(pickup: Place, dropoff: Place, shownFareCents: number) {
  return rides.requestRide(pickup, dropoff, shownFareCents);
}

export async function cancelRide(rideId: string) {
  return rides.cancelRide(rideId);
}

/** What cancelling right now would cost, so the sheet can say so before the rider commits. */
export async function quoteCancellation(rideId: string) {
  return rides.quoteCancellation(rideId);
}

/**
 * Card collection, for the first-ride case. The sheet mounts Stripe's form against the secret this
 * returns, then hands the SetupIntent id back to `saveCard` — the card itself never comes here.
 */
export async function startCardSetup() {
  return payments.startCardSetup();
}

export async function saveCard(setupIntentId: string) {
  return payments.recordCardFromSetup(setupIntentId);
}
