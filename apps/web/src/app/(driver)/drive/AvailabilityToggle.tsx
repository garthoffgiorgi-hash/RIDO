"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { setAcceptingRides } from "./actions";

/**
 * Online/offline, the driver's own switch (ADR-0019).
 *
 * **It lives outside both `/drive` panels on purpose.** A driver holding a live ride sees
 * `CurrentRidePanel` and no board at all, and going offline to signal "this is my last one" has to
 * stay reachable — availability gates taking new work, never finishing work already accepted.
 *
 * A two-option `SegmentedControl` rather than a bespoke switch: both states stay labelled, so
 * there's no guessing which way is on, and `brand/design-system.md`'s "online = Signal" is honoured
 * by the primitive's `accent` tone rather than a second component.
 *
 * **No `useOptimistic`.** A failed write would leave the pill saying Online while the database says
 * Offline — and this control's entire job is to be the truth about whether work will reach you.
 * Pending state, then `router.refresh()` so the board re-renders against the new value.
 */
type Availability = "offline" | "online";

const OPTIONS = [
  { value: "offline" as const, label: "Offline" },
  { value: "online" as const, label: "Online" },
];

export function AvailabilityToggle({ acceptingRides }: { acceptingRides: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value: Availability = acceptingRides ? "online" : "offline";

  async function handleChange(next: Availability) {
    if (pending || next === value) return;

    setPending(true);
    setError(null);
    const result = await setAcceptingRides(next === "online");
    setPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-sora text-lg font-bold text-midnight">Availability</h2>
        <span className="text-[13px] text-slate">
          {acceptingRides ? "Taking rides" : "Not taking rides"}
        </span>
      </div>

      <SegmentedControl
        options={OPTIONS}
        value={value}
        onChange={handleChange}
        label="Whether you're taking rides"
        tone="accent"
      />

      <p className="mt-3 text-[13px] text-slate">
        {acceptingRides
          ? "You can accept anything on the board. Go offline whenever you want — a ride you've already accepted is yours to finish either way."
          : "You can still see what's out there; you just can't accept it until you go back online."}
      </p>

      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
    </Card>
  );
}
