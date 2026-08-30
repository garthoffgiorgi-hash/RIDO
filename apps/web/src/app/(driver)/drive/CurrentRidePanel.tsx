"use client";

import { BPS_DENOMINATOR } from "@rido/pricing";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Fare, formatCents } from "@/components/ui/Fare";
import type { DriverActiveRide, RideCompletion } from "@/lib/rides/server";
import { completeRide, startTrip } from "./actions";

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
export function CurrentRidePanel({ ride }: { ride: DriverActiveRide }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<RideCompletion | null>(null);

  async function handleStart() {
    setBusy(true);
    setError(null);
    const result = await startTrip(ride.id);
    setBusy(false);

    if (result.ok) {
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  async function handleComplete() {
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
