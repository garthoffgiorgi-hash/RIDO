"use client";

import { BPS_DENOMINATOR } from "@rido/pricing";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Fare, formatCents } from "@/components/ui/Fare";
import { subscribeToRide } from "@/lib/rides/realtime";
import type { DriverActiveRide, RideCompletion } from "@/lib/rides/server";
import { completeRide, readDriverActiveRide, startTrip } from "./actions";

const formatKeepPct = (commissionRateBps: number) =>
  new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(
    (BPS_DENOMINATOR - commissionRateBps) / BPS_DENOMINATOR,
  );

/**
 * The driver's own live ride — accepted, in progress, or (briefly) just completed. This is the
 * read `/drive` never had: accepting used to exist only in `OpenRequestsPanel`'s local state, so
 * a reload lost it entirely. `getDriverActiveRide()` reads it fresh from the database every time.
 *
 * "You keep $X (Y%)" mirrors `RideCard`'s figure exactly, for the same reason: neither
 * `'accepted'` nor `'in_progress'` has a commission snapshot yet
 * (`rides_commission_present_iff_completed`). Once `completeRide()` succeeds, the panel switches
 * to the real snapshot the function returned — never a recomputation of it.
 */
export function CurrentRidePanel({ ride: initialRide }: { ride: DriverActiveRide }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<RideCompletion | null>(null);
  // Seeded from the prop and then owned locally, so a realtime refetch can move `status` from
  // 'accepted' to 'in_progress' without a reload. `null` means the ride is gone out from under
  // this driver — the rider cancelled (ADR-0018 made that possible at every live status).
  const [ride, setRide] = useState<DriverActiveRide | null>(initialRide);

  const actionInFlight = useRef(false);
  actionInFlight.current = busy;

  useEffect(() => {
    let cancelled = false;
    const subscription = subscribeToRide(initialRide.id, async () => {
      // This driver's own start and complete writes echo back. Both already set state themselves,
      // and `completeRide` returns a snapshot no refetch can reproduce, so a refetch landing
      // mid-action could only overwrite something better with something worse.
      if (actionInFlight.current) return;

      const fresh = await readDriverActiveRide();
      if (cancelled) return;
      setRide(fresh);
      setError(null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // Keyed on the prop's id, not local state's: this panel only ever watches the ride it was
    // mounted for, and `setRide(null)` must tear the subscription down rather than restart it.
  }, [initialRide.id]);

  async function handleStart() {
    if (!ride) return;
    setBusy(true);
    setError(null);
    const result = await startTrip(ride.id);

    if (result.ok) {
      // Re-read rather than `router.refresh()`. A refresh delivers a fresh RSC payload and a new
      // `ride` prop, but a `useState(prop)` initializer does not re-run for it — the button would
      // go quiet and the card would keep saying "Start trip". Same path realtime uses.
      setRide(await readDriverActiveRide());
    } else {
      setError(result.message);
    }
    setBusy(false);
  }

  async function handleComplete() {
    if (!ride) return;
    setBusy(true);
    setError(null);
    const outcome = await completeRide(ride.id);
    setBusy(false);

    if (outcome.kind === "completed") {
      setCompletion(outcome.completion);
    } else {
      setError(outcome.message);
    }
  }

  if (completion) {
    return (
      <Card className="space-y-3 text-center">
        <p className="font-sora text-lg font-semibold text-ink">Ride complete</p>
        <div>
          <Fare cents={completion.driverPayoutCents} />
          <p className="tabular text-[13px] text-slate">
            you kept {formatKeepPct(completion.commissionRateBps)} of{" "}
            {formatCents(completion.fareCents)}
          </p>
        </div>
        <Button variant="secondary" size="lg" fullWidth onClick={() => router.refresh()}>
          Find more rides
        </Button>
      </Card>
    );
  }

  // The ride went away while this driver was holding it — the rider cancelled (ADR-0018 allows that
  // at every live status). Checked after `completion` and BEFORE `error`, deliberately: a driver who
  // has just completed a ride should see their payout, and a rider exercising a right they have is
  // not a failure. No `text-danger`, no "Error", nothing red — brand-guide.md's warmth points
  // inward. Say what happened and give them the way back.
  if (!ride) {
    return (
      <Card className="space-y-3 text-center">
        <p className="font-sora text-lg font-semibold text-ink">This ride was cancelled</p>
        <p className="text-[14px] text-slate">
          Your rider called it off. If they cancelled after you were already on your way, your
          cancellation fee is on its way to you.
        </p>
        <Button variant="secondary" size="lg" fullWidth onClick={() => router.refresh()}>
          Find more rides
        </Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="space-y-1 text-[14px] text-slate">
        <p className="truncate">{ride.pickupAddress ?? "Pickup"}</p>
        <p className="truncate">{ride.dropoffAddress ?? "Dropoff"}</p>
      </div>

      <div>
        <Fare cents={ride.driverPayoutCents} />
        <p className="tabular text-[13px] text-slate">
          you keep {formatKeepPct(ride.commissionRateBps)} of {formatCents(ride.fareCents)}
        </p>
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {ride.status === "accepted" ? (
        <Button variant="accent" size="lg" fullWidth onClick={handleStart} disabled={busy}>
          {busy ? "Starting…" : "Start trip"}
        </Button>
      ) : (
        <Button variant="accent" size="lg" fullWidth onClick={handleComplete} disabled={busy}>
          {busy ? "Completing…" : "Complete ride"}
        </Button>
      )}
    </Card>
  );
}
