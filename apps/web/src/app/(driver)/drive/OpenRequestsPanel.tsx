"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RideCard } from "@/components/domain/RideCard";
import { subscribeToOpenRequests } from "@/lib/rides/realtime";
import type { OpenRideRequest } from "@/lib/rides/server";
import { acceptRide, declineRide, readOpenRequests } from "./actions";

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
 * **The board is realtime for arrivals, and structurally cannot be for removals (ADR-0021).** A
 * ride booked anywhere shows up here on its own, because a new ride is inserted
 * `requested`/unassigned and every active driver may read it. A ride another driver *takes* leaves
 * this driver's RLS visibility at the instant it is taken, so there is no longer a subscriber the
 * event is authorized for — no client code can change that. The mitigations are that any arrival
 * refreshes the whole list, that returning to the tab refetches, and that accepting a taken ride
 * still fails cleanly and drops the card.
 *
 * **Props always win over the live list.** The board was already derived from props rather than a
 * `useState(initialRequests)` initializer, which does not re-run when `router.refresh()` brings a
 * fresh RSC payload — the availability toggle (ADR-0019) refreshes with this panel still on screen,
 * and a frozen board would silently stop showing new requests. The socket refetch layers *over*
 * that prop, and a new prop clears it, so a server render can never be overwritten by an older
 * socket read. The only other local state is what the client knows and the server doesn't: which
 * rides this session has already removed. Declining converges anyway, since `listOpenRequests`
 * filters declines server-side on the next read.
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
  const [liveRequests, setLiveRequests] = useState<OpenRideRequest[] | null>(null);

  // React's documented "adjust state when a prop changes" pattern, in place of an effect: a fresh
  // server render supersedes anything the socket fetched before it, without a render-and-then-patch
  // flash. Comparing by reference is right — every RSC payload brings a new array.
  const [prevInitial, setPrevInitial] = useState(initialRequests);
  if (initialRequests !== prevInitial) {
    setPrevInitial(initialRequests);
    setLiveRequests(null);
  }

  const requests = (liveRequests ?? initialRequests).filter((ride) => !removedIds.has(ride.id));

  // One effect, two triggers. The socket carries arrivals; `visibilitychange` covers everything it
  // structurally cannot send — chiefly a ride another driver already took. This deliberately
  // departs from ADR-0020 §4's "no refetch-on-focus", which was right for the single-ride surfaces
  // because the socket could deliver every change those screens cared about. `visibilitychange`
  // rather than `focus`: the latter also fires on clicking back into an already-visible window.
  useEffect(() => {
    let cancelled = false;

    async function refetch() {
      const fresh = await readOpenRequests();
      // A read failure leaves the board showing what it already had — the honest degrade for
      // something with no button to re-enable. `/drive`'s own server render reports real problems.
      if (cancelled || fresh === null) return;
      setLiveRequests(fresh);
    }

    const subscription = subscribeToOpenRequests(() => void refetch());
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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
