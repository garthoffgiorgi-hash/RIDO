import type { NavigationDestination } from "@/lib/navigation/deep-link.ts";

/**
 * The one decision "where is the driver headed right now" reduces to, shared by two callers that
 * must never disagree: `CurrentRidePanel`'s Navigate button (PR 2) and the map preview's route
 * action (PR 3). Before this existed, it was written once, inline, inside the component — fine
 * when there was one caller, wrong the moment there were two.
 *
 * Returns `NavigationDestination` (`@/lib/navigation/deep-link.ts`) rather than a new shape of its
 * own: "where to route to" and "where to point a Maps link" are the same fact.
 */
export interface RideEndpoints {
  readonly status: "accepted" | "in_progress";
  readonly pickupCoordinates: NavigationDestination["coordinates"];
  readonly pickupAddress: NavigationDestination["address"];
  readonly dropoffCoordinates: NavigationDestination["coordinates"];
  readonly dropoffAddress: NavigationDestination["address"];
}

/**
 * The pickup while accepted, the dropoff once in progress — the one place a driver is actually
 * headed at each stage of a ride.
 */
export function driverDestination(ride: RideEndpoints): NavigationDestination {
  return ride.status === "accepted"
    ? { coordinates: ride.pickupCoordinates, address: ride.pickupAddress }
    : { coordinates: ride.dropoffCoordinates, address: ride.dropoffAddress };
}
