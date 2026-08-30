"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RideCard } from "@/components/domain/RideCard";
import type { OpenRideRequest } from "@/lib/rides/server";
import { acceptRide } from "./actions";

/**
 * The dispatch board: every open request, each showing what THIS driver would keep, with the
 * accept interactivity `RideCard` itself deliberately doesn't own.
 *
 * A successful accept doesn't render its own confirmation — it hands off to `router.refresh()`
 * and lets `drive/page.tsx` re-render server-side, which now finds a real `DriverActiveRide`
 * (`getDriverActiveRide()`, ADR-0014) and swaps this whole panel for `CurrentRidePanel`. That
 * replaces the earlier version's local "Ride accepted" state, which only ever lived in this
 * component and vanished on a reload — the actual gap `CurrentRidePanel` closes.
 */
export function OpenRequestsPanel({ initialRequests }: { initialRequests: OpenRideRequest[] }) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept(rideId: string) {
    setAcceptingId(rideId);
    setError(null);
    const result = await acceptRide(rideId);

    if (result.ok) {
      router.refresh();
      return;
    }

    setAcceptingId(null);
    setError(result.message);
    // Whatever the reason — another driver won it, the rider canceled it — the ride is no longer
    // open. Drop it rather than leaving a dead Accept button behind for the driver to retry.
    setRequests((current) => current.filter((ride) => ride.id !== rideId));
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {requests.length === 0 ? (
        <p className="text-[14px] text-slate">No open requests right now. Check back soon.</p>
      ) : (
        requests.map((ride) => (
          <RideCard
            key={ride.id}
            ride={ride}
            onAccept={handleAccept}
            accepting={acceptingId === ride.id}
          />
        ))
      )}
    </div>
  );
}
