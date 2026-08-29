"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PlaceSearch } from "@/components/domain/PlaceSearch";
import { RideMap } from "@/components/domain/RideMap";
import { Button } from "@/components/ui/Button";
import { Fare } from "@/components/ui/Fare";
import { FareChip } from "@/components/ui/FareChip";
import { Sheet } from "@/components/ui/Sheet";
import type { Place } from "@/lib/maps/types";
// Types only — the functions themselves come from ./actions, the "use server" bridge. Importing
// a value (not just a type) from server.ts here would pull server-only code into the client
// bundle; Next.js refuses that build, which is how this was caught.
import type { ActiveRide, RideQuote } from "@/lib/rides/server";
import { cancelRide, quoteRideRequest, requestRide } from "./actions";

const formatEta = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min away`;

/**
 * Owns every state in the request flow — naming, quoted, price-changed, requested — behind one
 * `Sheet` that stays open for the whole surface. The map underneath is what `design-system.md:80`
 * means by "slides over a dimmed map": the sheet's backdrop dim is the standing visual
 * relationship with the map here, not a modal that opens and closes.
 */
export function RequestPanel({ initialActiveRide }: { initialActiveRide: ActiveRide | null }) {
  const router = useRouter();

  const [activeRide, setActiveRide] = useState<ActiveRide | null>(initialActiveRide);
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [quote, setQuote] = useState<RideQuote | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [booking, setBooking] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickupCoords = pickup?.coordinates ?? null;
  const dropoffCoords = dropoff?.coordinates ?? null;

  useEffect(() => {
    setQuote(null);
    setPriceChanged(false);
    setError(null);
    if (!pickupCoords || !dropoffCoords) return;

    let cancelled = false;
    setQuoting(true);
    quoteRideRequest(pickupCoords, dropoffCoords).then((result) => {
      if (cancelled) return;
      setQuoting(false);
      if (result.ok) setQuote(result.data);
      else setError(result.message);
    });

    return () => {
      cancelled = true;
    };
  }, [pickupCoords, dropoffCoords]);

  async function handleConfirm() {
    if (!pickup || !dropoff || !quote) return;
    setBooking(true);
    setError(null);
    const outcome = await requestRide(pickup, dropoff, quote.fareCents);
    setBooking(false);

    if (outcome.kind === "booked") {
      setActiveRide({
        id: outcome.rideId,
        status: "requested",
        fareCents: quote.fareCents,
        pickupAddress: pickup.address,
        dropoffAddress: dropoff.address,
        requestedAt: new Date().toISOString(),
      });
    } else if (outcome.kind === "price_changed") {
      setQuote(outcome.quote);
      setPriceChanged(true);
    } else {
      setError(outcome.message);
    }
  }

  async function handleCancel() {
    if (!activeRide) return;
    setCanceling(true);
    const result = await cancelRide(activeRide.id);
    setCanceling(false);
    if (result.ok) {
      // Deliberately keep pickup/dropoff/quote rather than clearing them: re-ordering the same
      // trip shouldn't mean re-searching both fields from scratch. The displayed quote can be
      // stale by the time "Get a rido" is pressed again, but requestRide() always re-verifies the
      // price server-side before booking regardless, so redisplaying it here is safe.
      setActiveRide(null);
      setError(null);
    } else {
      setError(result.message);
    }
  }

  return (
    <>
      <RideMap
        shape="bleed"
        pickup={activeRide ? null : pickupCoords}
        dropoff={activeRide ? null : dropoffCoords}
        route={quote?.geometry ?? null}
      />

      <Sheet
        open
        onClose={() => router.push("/account")}
        title={activeRide ? "Your ride" : "Where to?"}
        className="max-h-[75vh] overflow-y-auto"
      >
        <div className="space-y-4 p-5 pb-8">
          {activeRide ? (
            <>
              <p className="font-sora text-heading font-semibold text-ink">Looking for a driver</p>
              <div className="space-y-1 text-[14px] text-slate">
                <p>{activeRide.pickupAddress ?? "Pickup"}</p>
                <p>{activeRide.dropoffAddress ?? "Dropoff"}</p>
              </div>
              <Fare cents={activeRide.fareCents} />
              {error && <p className="text-[13px] text-danger">{error}</p>}
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onClick={handleCancel}
                disabled={canceling}
              >
                {canceling ? "Canceling…" : "Cancel"}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <PlaceSearch
                  label="Pickup"
                  selected={pickup}
                  onSelect={setPickup}
                  near={dropoffCoords ?? undefined}
                />
                <PlaceSearch
                  label="Dropoff"
                  selected={dropoff}
                  onSelect={setDropoff}
                  near={pickupCoords ?? undefined}
                />
              </div>

              {quoting && <p className="text-[13px] text-slate">Getting your price…</p>}
              {error && <p className="text-[13px] text-danger">{error}</p>}

              {quote && (
                <div className="space-y-3">
                  {priceChanged && (
                    <p className="text-[13px] text-slate">
                      The price changed. Here's the current fare.
                    </p>
                  )}
                  <div className="flex items-center gap-3">
                    <Fare cents={quote.fareCents} />
                    <FareChip>{formatEta(quote.durationSeconds)}</FareChip>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={handleConfirm}
                    disabled={booking}
                  >
                    {booking ? "Booking…" : "Get a rido"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
