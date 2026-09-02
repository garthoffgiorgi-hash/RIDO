"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RideCard } from "@/components/domain/RideCard";
import type { OpenRideRequest } from "@/lib/rides/server";
import { acceptRide, declineRide } from "./actions";

/**
 * The dispatch board: every open request, each showing what THIS driver would keep, with the
 * accept and decline interactivity `RideCard` itself deliberately doesn't own.
 *
 * A successful accept doesn't render its own confirmation — it hands off to `router.refresh()`
 * and lets `drive/page.tsx` re-render server-side, which now finds a real `DriverActiveRide`
 * (`getDriverActiveRide()`, ADR-0014) and swaps this whole panel for `CurrentRidePanel`. That
 * replaces the earlier version's local "Ride accepted" state, which only ever lived in this
 * component and vanished on a reload — the actual gap `CurrentRidePanel` closes.
 *
 * **The board is derived from props, never copied into state.** A `useState(initialRequests)`
 * initializer does not re-run when `router.refresh()` brings a fresh RSC payload, so a panel that
 * owned its list would freeze at mount. That was harmless while accept was the only refresh — it
 * unmounts this panel — but the availability toggle (ADR-0019) refreshes with the panel still on
 * screen, and a frozen board would silently stop showing new requests. So the only thing held
 * locally is what the client knows and the server doesn't: which rides this session has already
 * removed. Declining converges anyway, since the next server render filters it out too.
 */
export function OpenRequestsPanel({
  initialRequests,
  acceptingRides,
}: {
  initialRequests: OpenRideRequest[];
  acceptingRides: boolean;
}) {
  const router = useRouter();
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requests = initialRequests.filter((ride) => !removedIds.has(ride.id));

  function remove(rideId: string) {
    setRemovedIds((current) => new Set(current).add(rideId));
  }

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
    remove(rideId);
  }

  // No `router.refresh()` here, deliberately: a decline removes one row, and re-rendering the whole
  // page — compliance card, availability, payouts and all — for that is visibly jumpy. The server
  // filters it out on the next render regardless.
  async function handleDecline(rideId: string) {
    setDecliningId(rideId);
    setError(null);
    const result = await declineRide(rideId);
    setDecliningId(null);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    remove(rideId);
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-[13px] text-danger">{error}</p>}

      {/* Rendered text, not a tooltip on the disabled button: `Button` carries
          `disabled:pointer-events-none`, so a disabled Accept never receives hover or focus and
          could not show one. Once here, rather than repeated on every card. */}
      {!acceptingRides && requests.length > 0 && (
        <p className="text-[13px] text-slate">
          You're offline, so these are view-only. Go online above to accept one.
        </p>
      )}

      {requests.length === 0 ? (
        <p className="text-[14px] text-slate">No open requests right now. Check back soon.</p>
      ) : (
        requests.map((ride) => (
          <RideCard
            key={ride.id}
            ride={ride}
            onAccept={handleAccept}
            onDecline={handleDecline}
            accepting={acceptingId === ride.id}
            declining={decliningId === ride.id}
            canAccept={acceptingRides}
          />
        ))
      )}
    </div>
  );
}
