"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { searchPlaces, SEARCH_DEBOUNCE_MS } from "@/lib/maps/browser";
import type { Coordinates, Place } from "@/lib/maps/types";

interface PlaceSearchProps {
  readonly label: string;
  readonly selected: Place | null;
  readonly onSelect: (place: Place) => void;
  readonly near?: Coordinates;
  /**
   * Seeds the search box with remembered address text — e.g. a canceled ride's `pickup_address`,
   * which ADR-0011 stores as a string with no coordinates to restore alongside it. This is the
   * honest ceiling for "remember what I searched last": one tap re-selects instead of a blank
   * field, but it's a fresh search, not a restored `Place`. Only read once, at mount — it seeds
   * the field's starting value, not a value this component keeps in sync with afterward.
   */
  readonly initialQuery?: string;
}

/**
 * Debounced text search over `searchPlaces()` (public token, browser-side — search isn't money,
 * ADR-0010) with a results list to pick from. Once a place is selected, the field shows its name
 * and offers "Change" rather than re-searching immediately, so a click doesn't get lost to a
 * stale results list re-appearing.
 */
export function PlaceSearch({ label, selected, onSelect, near, initialQuery }: PlaceSearchProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      const result = await searchPlaces(query, near);
      if (requestId.current !== id) return; // a newer keystroke already superseded this request
      setSearching(false);
      if (result.ok) {
        setResults(result.data);
        setError(null);
      } else {
        setResults([]);
        setError(result.message);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, near]);

  // Checking selected.coordinates, not just selected: "Change" below sets coordinates to null on
  // an otherwise-unchanged Place specifically so this falls back through to the search box rather
  // than clearing the field's remembered name outright. Checking bare `selected` truthiness would
  // make "Change" a dead end — the object stays truthy, so this block would keep re-rendering the
  // same collapsed pill with a Change button that does nothing.
  if (selected?.coordinates) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-input border border-mist bg-white px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate">{label}</p>
          <p className="truncate text-[15px] text-ink">{selected.name}</p>
        </div>
        <button
          type="button"
          onClick={() => onSelect({ ...selected, coordinates: null })}
          className="shrink-0 text-[13px] font-medium text-signal hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        label={label}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a place..."
        autoComplete="off"
      />
      {searching && <p className="mt-1 text-[13px] text-slate">Searching…</p>}
      {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-card-sm border border-mist bg-white shadow-none">
          {results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                disabled={!place.coordinates}
                onClick={() => {
                  if (!place.coordinates) return;
                  onSelect(place);
                  setQuery("");
                  setResults([]);
                }}
                className="block w-full px-3.5 py-2.5 text-left text-[14px] text-ink hover:bg-ivory disabled:cursor-not-allowed disabled:text-slate/60"
              >
                <p className="font-medium">{place.name}</p>
                {place.address && <p className="text-[13px] text-slate">{place.address}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
