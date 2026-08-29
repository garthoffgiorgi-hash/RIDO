"use client";

import { useState } from "react";
import { RideCard } from "@/components/domain/RideCard";
import type { OpenRideRequest } from "@/lib/rides/server";
import { acceptRide } from "./actions";

/**
 * The dispatch board: every open request, each showing what THIS driver would keep, with the
 * accept interactivity `RideCard` itself deliberately doesn't own.
 *
 * No realtime, and no "current ride" surface yet (out of scope — see
 * docs/decisions/0013-driver-accepts-one-row-one-update.md) — accepting swaps the list for a
 * short confirmation rather than navigating anywhere. Reloading `/drive` shows a fresh open pool
 * again, same honest ceiling `RequestPanel` accepts on the rider side.
 */
export function OpenRequestsPanel({ initialRequests }: { initialRequests: OpenRideRequest[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<OpenRideRequest | null>(null);

  async function handleAccept(rideId: string) {
    setAcceptingId(rideId);
    setError(null);
    const result = await acceptRide(rideId);
    setAcceptingId(null);

    if (result.ok) {
      setAccepted(requests.find((ride) => ride.id === rideId) ?? null);
      setRequests((current) => current.filter((ride) => ride.id !== rideId));
      return;
    }

    setError(result.message);
    // Whatever the reason — another driver won it, the rider canceled it — the ride is no longer
    // open. Drop it rather than leaving a dead Accept button behind for the driver to retry.
    setRequests((current) => current.filter((ride) => ride.id !== rideId));
  }

  if (accepted) {
    return (
      <div className="space-y-1 py-6 text-center">
        <p className="font-sora text-lg font-semibold text-ink">Ride accepted</p>
        <p className="text-[14px] text-slate">
          Head to {accepted.pickupAddress ?? "the pickup"} to meet your rider.
        </p>
      </div>
    );
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
