"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CardForm } from "@/components/domain/CardForm";
import { PlaceSearch } from "@/components/domain/PlaceSearch";
import { RideMap } from "@/components/domain/RideMap";
import { Button } from "@/components/ui/Button";
import { Fare, formatCents } from "@/components/ui/Fare";
import { FareChip } from "@/components/ui/FareChip";
import { Sheet } from "@/components/ui/Sheet";
import type { Place } from "@/lib/maps/types";
import { completeAuthorization } from "@/lib/payments/browser";
// Types only — the functions themselves come from ./actions, the "use server" bridge. Importing
// a value (not just a type) from server.ts here would pull server-only code into the client
// bundle; Next.js refuses that build, which is how this was caught.
import type { ActiveRide, CompletedRideSummary, RideQuote } from "@/lib/rides/server";
import {
  cancelRide,
  quoteCancellation,
  quoteRideRequest,
  requestRide,
  saveCard,
  startCardSetup,
} from "./actions";

const formatEta = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min away`;

/**
 * Owns every state in the request flow — naming, quoted, price-changed, requested — behind one
 * `Sheet` that stays open for the whole surface. The map underneath is what `design-system.md:80`
 * means by "slides over a dimmed map": the sheet's backdrop dim is the standing visual
 * relationship with the map here, not a modal that opens and closes.
 */
export function RequestPanel({
  initialActiveRide,
  initialRecentlyCompleted,
}: {
  initialActiveRide: ActiveRide | null;
  initialRecentlyCompleted: CompletedRideSummary | null;
}) {
  const router = useRouter();

  const [activeRide, setActiveRide] = useState<ActiveRide | null>(initialActiveRide);
  const [recentlyCompleted, setRecentlyCompleted] = useState<CompletedRideSummary | null>(
    initialRecentlyCompleted,
  );
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  // Captured once, at mount, from whatever ride was active then — not kept in sync afterward.
  // This is what survives a reload that lands on a still-active ride and is then canceled:
  // handleCancel() nulls out `activeRide`, but these two don't come from it, so cancel can't
  // clear them. See PlaceSearch's `initialQuery`.
  const [lastPickupAddress] = useState(initialActiveRide?.pickupAddress ?? undefined);
  const [lastDropoffAddress] = useState(initialActiveRide?.dropoffAddress ?? undefined);
  const [quote, setQuote] = useState<RideQuote | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [booking, setBooking] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The card step. Non-null means "the rider has no card and we're collecting one" — a state the
  // sheet enters and leaves in place, rather than sending them to /account mid-booking.
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  // What cancelling would cost right now, in cents. Null while unknown, 0 when free. A rider must
  // never discover a fee by being charged one, so this is fetched before the button is offered.
  const [cancelFeeCents, setCancelFeeCents] = useState<number | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

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

  /** Books, and lands the ride in local state. Shared by the plain path and the post-card retry. */
  function bookedRide(rideId: string, fareCents: number): ActiveRide {
    return {
      id: rideId,
      status: "requested",
      fareCents,
      pickupAddress: pickup?.address ?? null,
      dropoffAddress: dropoff?.address ?? null,
      requestedAt: new Date().toISOString(),
    };
  }

  async function handleConfirm() {
    if (!pickup || !dropoff || !quote) return;
    setBooking(true);
    setError(null);
    const outcome = await requestRide(pickup, dropoff, quote.fareCents);

    if (outcome.kind === "booked") {
      setBooking(false);
      setActiveRide(bookedRide(outcome.rideId, quote.fareCents));
      return;
    }

    if (outcome.kind === "price_changed") {
      setBooking(false);
      setQuote(outcome.quote);
      setPriceChanged(true);
      return;
    }

    if (outcome.kind === "needs_card") {
      // First ride. Collect a card in the sheet rather than sending them to /account — bouncing a
      // rider out of a booking they are mid-way through is where this funnel would leak.
      const setup = await startCardSetup();
      setBooking(false);
      if (setup.ok) setCardSecret(setup.data.clientSecret);
      else setError(setup.message);
      return;
    }

    if (outcome.kind === "needs_confirmation") {
      // The bank wants the rider to confirm. They are on screen — which is the entire reason RIDO
      // authorizes on-session — so this is a dialog, not a dead end.
      const confirmed = await completeAuthorization(outcome.clientSecret);
      setBooking(false);
      if (confirmed.ok) setActiveRide(bookedRide(outcome.rideId, quote.fareCents));
      else setError(confirmed.message);
      return;
    }

    setBooking(false);
    setError(outcome.message);
  }

  /** Saves the card just collected, then retries the booking the rider was already making. */
  async function handleCardSaved(setupIntentId: string) {
    const saved = await saveCard(setupIntentId);
    if (!saved.ok) {
      setError(saved.message);
      return;
    }
    setCardSecret(null);
    await handleConfirm();
  }

  /**
   * Asks what cancelling costs before offering to do it. A free cancel goes straight through; a
   * chargeable one shows what it will cost and where the money goes, and waits.
   */
  async function handleCancelPressed() {
    if (!activeRide) return;
    setCanceling(true);
    const fee = await quoteCancellation(activeRide.id);
    setCanceling(false);

    if (!fee.ok) {
      setError(fee.message);
      return;
    }
    if (fee.data === 0) {
      await handleCancel();
      return;
    }
    setCancelFeeCents(fee.data);
    setConfirmingCancel(true);
  }

  async function handleCancel() {
    if (!activeRide) return;
    setCanceling(true);
    const result = await cancelRide(activeRide.id);
    setCanceling(false);
    setConfirmingCancel(false);
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
        title={
          activeRide
            ? "Your ride"
            : recentlyCompleted
              ? "Trip complete"
              : cardSecret
                ? "Add a card"
                : "Where to?"
        }
        className="max-h-[75vh] overflow-y-auto"
      >
        <div className="space-y-4 p-5 pb-8">
          {activeRide ? (
            <>
              <p className="font-sora text-heading font-semibold text-ink">
                {activeRide.status === "accepted"
                  ? "Your driver is on the way"
                  : activeRide.status === "in_progress"
                    ? "You're on your way"
                    : "Looking for a driver"}
              </p>
              <div className="space-y-1 text-[14px] text-slate">
                <p>{activeRide.pickupAddress ?? "Pickup"}</p>
                <p>{activeRide.dropoffAddress ?? "Dropoff"}</p>
              </div>
              <Fare cents={activeRide.fareCents} />
              {error && <p className="text-[13px] text-danger">{error}</p>}

              {/* Cancel is offered at every live status now, not just 'requested' — ADR-0018 made
                  late cancellation possible, for a fee. What changes past the grace window is the
                  confirmation, not the availability. */}
              {confirmingCancel && cancelFeeCents !== null ? (
                <div className="space-y-3">
                  <p className="text-[14px] text-ink">
                    Your driver is already on the way. Cancelling now costs{" "}
                    <span className="tabular font-semibold">{formatCents(cancelFeeCents)}</span>,
                    and it goes to them for the time they&apos;ve already spent.
                  </p>
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    onClick={handleCancel}
                    disabled={canceling}
                  >
                    {canceling ? "Canceling…" : `Cancel and pay ${formatCents(cancelFeeCents)}`}
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    fullWidth
                    onClick={() => setConfirmingCancel(false)}
                    disabled={canceling}
                  >
                    Keep my ride
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  onClick={handleCancelPressed}
                  disabled={canceling}
                >
                  {canceling ? "Canceling…" : "Cancel"}
                </Button>
              )}
            </>
          ) : recentlyCompleted ? (
            <>
              <p className="font-sora text-heading font-semibold text-ink">Trip complete</p>
              <div className="space-y-1 text-[14px] text-slate">
                <p>{recentlyCompleted.pickupAddress ?? "Pickup"}</p>
                <p>{recentlyCompleted.dropoffAddress ?? "Dropoff"}</p>
              </div>
              <Fare cents={recentlyCompleted.fareCents} />
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => setRecentlyCompleted(null)}
              >
                Book another ride
              </Button>
            </>
          ) : cardSecret ? (
            <>
              <p className="font-sora text-heading font-semibold text-ink">Add a card</p>
              <p className="text-[14px] text-slate">
                We&apos;ll hold your fare when you book and charge it when your trip ends.
              </p>
              {error && <p className="text-[13px] text-danger">{error}</p>}
              <CardForm
                clientSecret={cardSecret}
                submitLabel="Save card and book"
                onSaved={handleCardSaved}
                onCancel={() => setCardSecret(null)}
              />
            </>
          ) : (
            <>
              <div className="space-y-3">
                <PlaceSearch
                  label="Pickup"
                  selected={pickup}
                  onSelect={setPickup}
                  near={dropoffCoords ?? undefined}
                  initialQuery={lastPickupAddress}
                />
                <PlaceSearch
                  label="Dropoff"
                  selected={dropoff}
                  onSelect={setDropoff}
                  near={pickupCoords ?? undefined}
                  initialQuery={lastDropoffAddress}
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
                    {/* riderTotalCents, not fareCents: this is the rider's own total, and the two
                        diverge the day a pass-through exists. fareCents is what commission splits,
                        which is the driver's business and not shown here. */}
                    <Fare cents={quote.riderTotalCents} />
                    <FareChip>{formatEta(quote.durationSeconds)}</FareChip>
                  </div>
                  {/* Honest pricing is the product (brand-guide.md), so the hold is disclosed
                      rather than discovered. A rider seeing a larger number on their statement
                      than the one they agreed to is exactly the incumbent behaviour RIDO is
                      positioned against — even when it is only a temporary authorization. */}
                  <p className="text-[13px] text-slate">
                    We&apos;ll hold a little more than this while you ride, and charge{" "}
                    <span className="tabular">{formatCents(quote.riderTotalCents)}</span> when your
                    trip ends.
                  </p>
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
