/**
 * Mapbox failures, restated in RIDO's voice: what happened and how to fix it, no apology and no
 * blame (`brand/brand-guide.md`). Same shape and same trade-offs as `src/lib/auth/errors.ts`.
 *
 * **The trap this file exists for: Mapbox signals routing failures with HTTP 200.** A request for
 * a route between two points with no road between them returns `200 OK` with a body of
 * `{ "code": "NoRoute", "routes": [] }`. Checking `response.ok` is not sufficient, and a naive
 * implementation hands `undefined` to `quoteFare`, which throws
 * `distanceMeters must be a non-negative integer, got undefined` from three files away from the
 * actual problem. So the body's `code` is a first-class input here, alongside the status.
 */

/**
 * What went wrong, from whichever signals are available.
 *
 * - `status` — the HTTP status, when the request completed.
 * - `code` — Mapbox's own error code from the response body (`NoRoute`, `NoSegment`,
 *   `InvalidInput`, ...). Present on many HTTP 200 responses; see above.
 * - `raw` — the raw message, for the dev-only detail. **Never a URL** — pass it through
 *   `redactToken` first if it could contain one.
 */
export interface MapsErrorInput {
  readonly status?: number;
  readonly code?: string;
  readonly raw?: string;
}

const GENERIC = "Maps aren't responding right now. Try again in a moment.";

export function mapsErrorMessage(input: MapsErrorInput): string {
  const { status, code, raw } = input;

  if (process.env.NODE_ENV !== "production") {
    console.warn("[maps]", JSON.stringify({ status, code, raw }));
  }

  const c = (code ?? "").toLowerCase();
  const m = (raw ?? "").toLowerCase();

  // ---- routing outcomes. These arrive as HTTP 200 and are not errors so much as answers.
  if (c === "noroute" || m.includes("no route found")) {
    return "We couldn't find a driving route between those two places. Try a different pickup or drop-off.";
  }
  if (c === "nosegment" || m.includes("could not be snapped")) {
    return "That spot isn't near a road we can route to. Move it closer to a street.";
  }
  if (c === "notrips") {
    return "We couldn't build a trip from those points. Try moving one of them.";
  }
  if (c === "profilenotfound") {
    return "Maps are misconfigured — that routing profile doesn't exist. This one's ours to fix.";
  }

  // ---- configuration failures. Ours, not the user's — say so plainly rather than implying they
  //      typed something wrong, and let the dev-only detail carry the specifics.
  if (
    status === 401 ||
    c === "unauthorized" ||
    m.includes("not authorized") ||
    m.includes("invalid token")
  ) {
    return "Maps aren't configured. Check the Mapbox tokens in .env.local.";
  }
  if (status === 403 || c === "forbidden") {
    return "This Mapbox token isn't allowed from here. Check its URL restrictions in the Mapbox dashboard.";
  }
  if (status === 404 && !c) {
    return "Maps are misconfigured — that Mapbox endpoint doesn't exist. This one's ours to fix.";
  }
  if (status === 422 || c === "invalidinput") {
    const detail = "Those coordinates weren't something Mapbox could route between.";
    return process.env.NODE_ENV === "production" || !raw ? detail : `${detail} (dev: ${raw})`;
  }

  // ---- load. Retryable, and the user can act on it.
  if (
    status === 429 ||
    c === "ratelimited" ||
    m.includes("rate limit") ||
    m.includes("too many requests")
  ) {
    return "Too many map requests right now. Wait a moment and try again.";
  }
  if (typeof status === "number" && status >= 500) {
    return "Maps are having a moment. Try again.";
  }

  // ---- the request never left the browser. Not a Mapbox failure at all — surfacing it as one
  //      sends people hunting through the Mapbox dashboard for a problem that's in the network.
  //      ("Load failed" is Safari's wording for the same thing.)
  if (m.includes("failed to fetch") || m.includes("load failed") || m.includes("networkerror")) {
    return "Couldn't reach Mapbox. Check your connection, and whether a firewall, VPN or browser extension is blocking the request.";
  }
  if (m.includes("aborted") || m.includes("timeout") || m.includes("timed out")) {
    return "Maps took too long to answer. Try again.";
  }

  return process.env.NODE_ENV === "production" || !raw ? GENERIC : `${GENERIC} (dev: ${raw})`;
}
