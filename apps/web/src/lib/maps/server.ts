import "server-only";

import { mapsErrorMessage } from "./errors.ts";
import { buildDirectionsUrl, measurementFromBody, redactToken } from "./route.ts";
import { failed, type MapsResult } from "./result.ts";
import type { Coordinates, RouteMeasurement } from "./types.ts";

/**
 * The trust boundary, in one file.
 *
 * > **The browser may name two places. Only the server may measure the trip between them.**
 *
 * If a rider's device measured its own trip and sent us "1.2 miles, 6 minutes", anyone could edit
 * that number and pay a minimum fare to reach the airport. So the client sends two *places* and
 * `measureRoute` — here, on the server, with a secret token — asks Mapbox how far apart they
 * actually are. That measurement is the only one permitted to reach `quoteFare()`.
 *
 * This is invariants 1 and 2 in the root `CLAUDE.md` ("all money math is server-computed and never
 * trusted from a client") applied to the one input that didn't exist until now. `import
 * "server-only"` makes importing this from a client component a **build error, not a review
 * catch** — the same mechanism `auth/server.ts` and `drivers/server.ts` use.
 *
 * Nothing here calls `quoteFare`. Money math lives in `packages/pricing`; this module supplies an
 * input to it, and keeping the two apart is what lets a caller mock one without mocking the other.
 */

/**
 * How long to wait for Mapbox before giving up.
 *
 * A hung routing call must not hang a quote. Four seconds is well past Directions' normal
 * response time and well inside what a rider will wait staring at a "getting your price" spinner.
 */
const TIMEOUT_MS = 4_000;

/**
 * Measures the driving trip between two points.
 *
 * Never throws and never returns a vendor shape: every failure — misconfiguration, network,
 * timeout, or Mapbox's HTTP-200 `NoRoute` — comes back as `ok: false` with a message already in
 * RIDO's voice.
 *
 * **Fails closed.** With no token configured it returns a failure rather than a fabricated
 * measurement. A quote is either real or it doesn't exist; there is no degraded mode where a rider
 * is quoted a guess.
 */
export async function measureRoute(
  pickup: Coordinates,
  dropoff: Coordinates,
): Promise<MapsResult<RouteMeasurement>> {
  const accessToken = process.env.MAPBOX_SECRET_TOKEN;
  if (!accessToken) {
    return failed(mapsErrorMessage({ status: 401, raw: "MAPBOX_SECRET_TOKEN is not set" }));
  }

  let url: string;
  try {
    // Throws on a coordinate that isn't on Earth — the lat/lng swap guard. A programmer error
    // rather than something a rider did, but it must not reach a user as a stack trace.
    url = buildDirectionsUrl({ pickup, dropoff, accessToken });
  } catch (error) {
    return failed(mapsErrorMessage({ code: "InvalidInput", raw: messageOf(error) }));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      // A traffic-aware duration must never be served from Next's fetch cache: a cached answer is
      // a stale price. This is also the terms-safe choice — Mapbox's Navigation terms restrict
      // storing routing results. See docs/architecture/maps.md.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    // The URL carries the token in its query string, so anything derived from it is redacted
    // before it can reach a log line.
    return failed(mapsErrorMessage({ raw: redactToken(messageOf(error)) }));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  // Mapbox signals a routing failure with HTTP 200 and a `code` in the body, so the status alone
  // is not the answer — but a non-2xx still needs reporting even when the body is unreadable.
  if (!response.ok) {
    const code =
      typeof (body as { code?: unknown })?.code === "string"
        ? (body as { code: string }).code
        : undefined;
    const raw =
      typeof (body as { message?: unknown })?.message === "string"
        ? (body as { message: string }).message
        : undefined;
    return failed(mapsErrorMessage({ status: response.status, code, raw: redactRaw(raw) }));
  }

  return measurementFromBody(body, (code) => mapsErrorMessage({ status: 200, code }));
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** Mapbox's own error strings can echo the token back. Never pass one through unfiltered. */
const redactRaw = (raw: string | undefined): string | undefined =>
  raw === undefined
    ? undefined
    : redactToken(raw).replace(/\b(pk|sk)\.[A-Za-z0-9._-]+/g, "$1.REDACTED");
