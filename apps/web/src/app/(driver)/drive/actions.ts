"use server";

import * as rides from "@/lib/rides/server";

/**
 * Thin Server Action bridge over `src/lib/rides/server.ts`, matching
 * `(rider)/request/actions.ts`'s pattern — that file carries `import "server-only"` and is not
 * itself `"use server"`, so `OpenRequestsPanel.tsx` (a Client Component) can't call `acceptRide`
 * directly. `listOpenRequests` doesn't need a wrapper here: `drive/page.tsx` is a Server
 * Component and reads it directly.
 */
export async function acceptRide(rideId: string) {
  return rides.acceptRide(rideId);
}
