import { mapsErrorMessage } from "./errors.ts";
import { buildForwardSearchUrl, buildReverseUrl, parsePlaces } from "./places.ts";
import { failed, type MapsResult } from "./result.ts";
import { redactToken } from "./route.ts";
import type { Coordinates, Place } from "./types.ts";

/**
 * The browser half of the maps boundary: finding a place, and naming a point.
 *
 * **Why calling Mapbox from a browser is in-pattern rather than a violation.** ADR-0006's rule is
 * about *where the call is written*, not which runtime executes it — `src/lib/auth/browser.ts`
 * calls Supabase from the browser today for the same reason. And search is not money: the worst
 * outcome of a tampered search response is that the rider is offered somewhere they didn't ask
 * for, which they will notice before they get in a car. Measuring the trip, which sets a price,
 * is the thing that stays on the server. See `./server.ts`.
 *
 * Deliberately no `import "server-only"`: this file reads a `NEXT_PUBLIC_*` token and is meant to
 * be reachable from a Client Component.
 */

/**
 * Debounce interval a caller should apply before searching.
 *
 * `/forward` bills per request, so a search fired on every keystroke costs roughly one request per
 * character. Exported so the number lives next to the reason for it rather than as a magic value
 * in whichever component types first.
 */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * The public map token. A Mapbox `pk.` token is designed to be public — public scopes only, and it
 * cannot create, modify or delete anything — so it satisfies invariant 10's promise that a
 * `NEXT_PUBLIC_*` value is safe to ship to a browser. Restrict it by URL in the Mapbox dashboard.
 *
 * Returns the empty string when unset rather than throwing: a missing map token should break the
 * map, not the page around it.
 */
export function publicMapToken(): string {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  if (!token && process.env.NODE_ENV !== "production") {
    console.error(
      "[maps] NEXT_PUBLIC_MAPBOX_TOKEN is empty or missing. Check apps/web/.env.local — the map and place search will not work without it.",
    );
  }
  return token;
}

async function fetchJson(url: string): Promise<MapsResult<unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" } });
  } catch (error) {
    const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return failed(mapsErrorMessage({ raw: redactToken(raw) }));
  }

  if (!response.ok) {
    return failed(mapsErrorMessage({ status: response.status }));
  }

  try {
    return { ok: true, data: await response.json() };
  } catch {
    return failed(mapsErrorMessage({ status: response.status, code: "MalformedResponse" }));
  }
}

/**
 * Places matching what the rider typed, best first.
 *
 * `near` biases results toward a point — pass the map centre. It costs nothing and is the
 * difference between "Price Center" meaning the one at UCSD and the one in another state.
 *
 * An empty query returns no results rather than an error: a caller clearing the input is not a
 * failure, and it avoids a wasted request per emptied field.
 */
export async function searchPlaces(
  query: string,
  near?: Coordinates,
): Promise<MapsResult<Place[]>> {
  if (!query.trim()) return { ok: true, data: [] };

  const token = publicMapToken();
  if (!token) {
    return failed(mapsErrorMessage({ status: 401, raw: "NEXT_PUBLIC_MAPBOX_TOKEN is not set" }));
  }

  const result = await fetchJson(
    buildForwardSearchUrl({ query, accessToken: token, near, limit: 5 }),
  );
  return result.ok ? parsePlaces(result.data) : result;
}

/**
 * What's at this point — for a dropped pin, or a device's GPS fix.
 *
 * Returns the single best match. "Nothing is there" comes back as a failure rather than an empty
 * success, because a caller asking about a specific point wants an answer or an explanation, not
 * an empty list to interpret.
 */
export async function describePlaceAt(at: Coordinates): Promise<MapsResult<Place>> {
  const token = publicMapToken();
  if (!token) {
    return failed(mapsErrorMessage({ status: 401, raw: "NEXT_PUBLIC_MAPBOX_TOKEN is not set" }));
  }

  const result = await fetchJson(buildReverseUrl({ at, accessToken: token }));
  if (!result.ok) return result;

  const places = parsePlaces(result.data);
  if (!places.ok) return places;

  const best = places.data[0];
  if (!best) {
    return failed("We couldn't find an address for that spot. Try moving the pin.");
  }
  return { ok: true, data: best };
}
