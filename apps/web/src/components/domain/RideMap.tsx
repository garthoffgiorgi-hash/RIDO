"use client";

import { useEffect, useRef, useState } from "react";
import { createRideMap, type RideMapHandle } from "@/lib/maps/map.ts";
import type { Coordinates, RouteGeometry } from "@/lib/maps/types.ts";

/**
 * Renders a map. This is the one Client Component allowed to reach `src/lib/maps/map.ts` — it
 * needs a real DOM node and a canvas, which is the "reason you could state out loud" the root
 * `apps/web/CLAUDE.md` rule asks for on every `"use client"`.
 *
 * Props are app types only (`Coordinates`, `RouteGeometry`) — never a Mapbox `Feature` or a `Map`
 * instance. That's the same ADR-0006 boundary `map.ts` enforces on itself, held here from the
 * other side: this component could not render a vendor shape if it wanted to, because it never
 * receives one.
 */
export interface RideMapProps {
  readonly pickup?: Coordinates | null;
  readonly dropoff?: Coordinates | null;
  readonly route?: RouteGeometry | null;
  readonly className?: string;
}

export function RideMap({ pickup = null, dropoff = null, route = null, className }: RideMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<RideMapHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    createRideMap({ container })
      .then((handle) => {
        if (cancelled) {
          handle.destroy();
          return;
        }
        handleRef.current = handle;
        setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
      setReady(false);
    };
  }, []);

  // One effect for every prop, rather than one per prop: `fitToRoute()` needs to run after
  // whichever of pickup/dropoff/route just changed, so splitting them apart would mean either
  // fitting on stale state or coordinating across effects. All four values are read directly in
  // the body, so this has nothing to suppress on the exhaustive-deps rule.
  useEffect(() => {
    if (!ready) return;
    const handle = handleRef.current;
    if (!handle) return;
    handle.setPickup(pickup);
    handle.setDropoff(dropoff);
    handle.drawRoute(route);
    if (pickup || dropoff) handle.fitToRoute();
  }, [ready, pickup, dropoff, route]);

  return (
    <div className={`relative overflow-hidden rounded-card bg-mist ${className ?? ""}`}>
      <div ref={containerRef} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-ivory p-4 text-center text-sm text-slate">
          {error}
        </div>
      )}
    </div>
  );
}
