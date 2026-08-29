import { BPS_DENOMINATOR } from "@rido/pricing";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Fare, formatCents } from "@/components/ui/Fare";
import type { OpenRideRequest } from "@/lib/rides/server";

/**
 * One open request on a driver's dispatch board — the name `apps/web/CLAUDE.md:42` already
 * reserves. "You keep $X (Y%)" is the wedge made visible (`brand/design-system.md` #6): both
 * figures arrive already computed on `ride` from `listOpenRequests()`'s `commissionForRide` call,
 * never arithmetic here — the one exception is `BPS_DENOMINATOR - ride.commissionRateBps`, which
 * `@rido/pricing` exports specifically so "the driver keeps the rest" isn't written as `10_000`
 * in a component.
 *
 * No `"use client"` here — like `Button`/`Card`/`Fare`, this stays a plain function component;
 * `onAccept` only needs a Client Component *somewhere* above it in the tree, not on this file.
 */
export function RideCard({
  ride,
  onAccept,
  accepting,
}: {
  ride: OpenRideRequest;
  onAccept: (rideId: string) => void;
  accepting: boolean;
}) {
  const driverKeepBps = BPS_DENOMINATOR - ride.commissionRateBps;
  const keepPct = new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(driverKeepBps / BPS_DENOMINATOR);

  return (
    <Card size="sm" className="space-y-3">
      <div className="space-y-1 text-[14px] text-slate">
        <p className="truncate">{ride.pickupAddress ?? "Pickup"}</p>
        <p className="truncate">{ride.dropoffAddress ?? "Dropoff"}</p>
      </div>

      <div>
        <Fare cents={ride.driverPayoutCents} />
        <p className="tabular text-[13px] text-slate">
          you keep {keepPct} of {formatCents(ride.fareCents)}
        </p>
      </div>

      <Button
        variant="accent"
        size="lg"
        fullWidth
        onClick={() => onAccept(ride.id)}
        disabled={accepting}
      >
        {accepting ? "Accepting…" : "Accept"}
      </Button>
    </Card>
  );
}
