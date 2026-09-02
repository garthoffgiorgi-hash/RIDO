"use server";

import { requireUser } from "@/lib/auth/server";
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

/** What `RequestPanel` shows about the rider's own ride — both halves, in one round trip. */
export interface RiderRideState {
  readonly activeRide: rides.ActiveRide | null;
  readonly recentlyCompleted: rides.CompletedRideSummary | null;
}

/**
 * Re-reads the rider's ride state, exactly as `page.tsx` does on a page load. This is what a
 * realtime event triggers (ADR-0020): the event is a bare "this ride moved" notification, its
 * payload is discarded, and the truth comes from here.
 *
 * **Both halves in one call, and in the same order the page reads them.** A ride that completes
 * takes `getActiveRide()` back to `null`, and the panel has to land on the trip-complete summary
 * rather than an empty booking form — so the two reads have to move together or the screen flickers
 * through a "Where to?" state that was never true. `getRecentlyCompletedRide()` is skipped whenever
 * a ride is live, same as the page: a rider mid-request has nothing to show a stale summary over.
 *
 * Returns a plain value rather than a `RidesResult`: `getActiveRide()` throws on a read failure and
 * this runs on a websocket event, not a user action. There is no button to re-enable and no message
 * worth rendering — the next event, or the next reload, corrects it.
 */
export async function readRiderRideState(): Promise<RiderRideState> {
  const user = await requireUser();
  const activeRide = await rides.getActiveRide(user);
  return {
    activeRide,
    recentlyCompleted: activeRide ? null : await rides.getRecentlyCompletedRide(user),
  };
}
