"use client";

import { useEffect, useState } from "react";
import { RideMap } from "@/components/domain/RideMap";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FareChip } from "@/components/ui/FareChip";
import type { Place } from "@/lib/maps/types";
import {
  type DevRouteQuote,
  getRouteQuote,
  getStorableCoordinate,
  type StorableCoordinateReport,
} from "./actions";
import { PlaceSearch } from "./PlaceSearch";

const formatCents = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const formatMeters = (meters: number) => `${(meters / 1609.344).toFixed(1)} mi`;
const formatSeconds = (seconds: number) => `${Math.round(seconds / 60)} min`;
const formatCoords = (c: { lng: number; lat: number }) =>
  `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;

/**
 * The client half of the proving page: two place pickers, a map, and a quote. Everything that
 * touches money or a secret token happens in `./actions.ts` on the server — this component only
 * ever sees `DevRouteQuote`, the same discipline `RideMap` holds on the rendering side.
 */
export function DevMapsPanel() {
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [quote, setQuote] = useState<DevRouteQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Permanent geocoding is the one call that bills from the first request, so it is never fired
  // by an effect — only by the button below. ADR-0011.
  const [storable, setStorable] = useState<StorableCoordinateReport | null>(null);
  const [storableError, setStorableError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const pickupCoords = pickup?.coordinates ?? null;
  const dropoffCoords = dropoff?.coordinates ?? null;

  useEffect(() => {
    setQuote(null);
    setError(null);
    setStorable(null);
    setStorableError(null);
    if (!pickupCoords || !dropoffCoords) return;

    let cancelled = false;
    setLoading(true);
    getRouteQuote(pickupCoords, dropoffCoords).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) setQuote(result.data);
      else setError(result.message);
    });

    return () => {
      cancelled = true;
    };
  }, [pickupCoords, dropoffCoords]);

  return (
    <div className="grid gap-6 md:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card>
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
        </Card>

        {loading && (
          <Card size="sm">
            <p className="text-[14px] text-slate">Measuring the trip and pricing it…</p>
          </Card>
        )}

        {error && (
          <Card size="sm">
            <p className="text-[14px] text-danger">{error}</p>
          </Card>
        )}

        {quote && (
          <Card size="sm">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-slate">Fare</p>
                <FareChip>{formatCents(quote.fareCents)}</FareChip>
              </div>
              <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]">
                <dt className="text-slate">Distance</dt>
                <dd className="tabular text-right text-ink">
                  {formatMeters(quote.distanceMeters)}
                </dd>
                <dt className="text-slate">Duration</dt>
                <dd className="tabular text-right text-ink">
                  {formatSeconds(quote.durationSeconds)}
                </dd>
                <dt className="text-slate">Base</dt>
                <dd className="tabular text-right text-ink">
                  {formatCents(quote.breakdown.baseCents)}
                </dd>
                <dt className="text-slate">Distance</dt>
                <dd className="tabular text-right text-ink">
                  {formatCents(quote.breakdown.distanceCents)}
                </dd>
                <dt className="text-slate">Time</dt>
                <dd className="tabular text-right text-ink">
                  {formatCents(quote.breakdown.timeCents)}
                </dd>
                <dt className="text-slate">Minimum applied</dt>
                <dd className="text-right text-ink">
                  {quote.breakdown.minimumApplied ? "Yes" : "No"}
                </dd>
                <dt className="text-slate">Rider total</dt>
                <dd className="tabular text-right font-medium text-ink">
                  {formatCents(quote.riderTotalCents)}
                </dd>
              </dl>
            </div>
          </Card>
        )}

        {pickup && (
          <Card size="sm">
            <div className="space-y-3">
              <div>
                <p className="text-[13px] font-medium text-slate">Storable coordinate</p>
                <p className="text-[13px] text-slate">
                  Re-geocodes the pickup address through Geocoding v6 with permanent rights. This is
                  the only call that costs money on the first request, so it never fires on its own.
                </p>
              </div>

              <Button
                variant="secondary"
                size="sm"
                disabled={resolving || !pickup.address}
                onClick={async () => {
                  setResolving(true);
                  setStorableError(null);
                  const result = await getStorableCoordinate(pickup);
                  setResolving(false);
                  if (result.ok) setStorable(result.data);
                  else {
                    setStorable(null);
                    setStorableError(result.message);
                  }
                }}
              >
                {resolving ? "Resolving…" : "Resolve storable coordinate"}
              </Button>

              {!pickup.address && (
                <p className="text-[13px] text-slate">
                  This place has no address line, so it cannot be re-geocoded — the fail-closed
                  case.
                </p>
              )}

              {storableError && <p className="text-[13px] text-danger">{storableError}</p>}

              {storable && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                  <dt className="text-slate">Displayed</dt>
                  <dd className="tabular text-right text-ink">
                    {formatCoords(storable.displayed)}
                  </dd>
                  <dt className="text-slate">Storable</dt>
                  <dd className="tabular text-right font-medium text-ink">
                    {formatCoords(storable.storable)}
                  </dd>
                  <dt className="text-slate">Drift</dt>
                  <dd className="tabular text-right text-ink">{storable.driftMetres} m</dd>
                </dl>
              )}
            </div>
          </Card>
        )}

        {(pickup || dropoff) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPickup(null);
              setDropoff(null);
            }}
          >
            Reset
          </Button>
        )}
      </div>

      <RideMap
        className="h-[520px]"
        pickup={pickupCoords}
        dropoff={dropoffCoords}
        route={quote?.geometry ?? null}
      />
    </div>
  );
}
