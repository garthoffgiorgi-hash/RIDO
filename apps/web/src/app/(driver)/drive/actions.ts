"use server";

import * as rides from "@/lib/rides/server";

/**
 * Thin Server Action bridge over `src/lib/rides/server.ts`, matching
 * `(rider)/request/actions.ts`'s pattern — that file carries `import "server-only"` and is not
 * itself `"use server"`, so a Client Component can't call these directly. `listOpenRequests` and
 * `getDriverActiveRide` don't need a wrapper here: `drive/page.tsx` is a Server Component and
 * reads them directly.
 */
export async function acceptRide(rideId: string) {
  return rides.acceptRide(rideId);
}

export async function startTrip(rideId: string) {
  return rides.startTrip(rideId);
}

export async function completeRide(rideId: string) {
  return rides.completeRide(rideId);
}
