/**
 * complete-ride — the HTTP shell.
 *
 * Joins the two halves that already existed separately: `commissionForRide` in @rido/pricing,
 * and the lock plus rollup in the database. This file does no arithmetic and makes no decisions;
 * it parses a request, asks `core.ts` what should happen, asks `db.ts` to make it happen, and
 * turns the result into a response.
 *
 * ── THE BUDGET, BECAUSE IT IS SMALLER THAN IT LOOKS ─────────────────────────────────────────
 *
 * A Supabase Edge Function gets **2 seconds of CPU time** per request — not wall clock, actual
 * compute. Wall clock is generous (400s) and I/O wait doesn't count, which is why this function
 * fits comfortably: `commissionForRide` is O(number of bands), three iterations of integer
 * arithmetic, and everything else here is waiting on Postgres.
 *
 * That headroom is not spare capacity to spend. This function runs while holding a lock on the
 * driver's month row, so anything slow added here does not merely make one ride sluggish — it
 * serializes that driver's completions behind it. **Heavy spatial-temporal optimization does not
 * belong in this file, and the schema exists so that it never has to be** (ADR-0008): the
 * PostGIS columns and indexes on `rides` are there for an optimizer that runs somewhere else,
 * over recorded data, on its own schedule.
 *
 * If you need post-completion work that isn't part of the transaction — a notification, an event
 * emission — the attachment point is `EdgeRuntime.waitUntil()` immediately after a successful
 * apply, marked below. It is still bound by this same CPU budget and its container can be
 * recycled, so it is a place to hand work off, never a place to do it.
 *
 * Deploy: `supabase functions deploy complete-ride --use-api` (no Docker needed).
 */

import { authorizeCompletion, MAX_RATING_ATTEMPTS, rateCompletion } from "./core.ts";
import {
  applyRideCommission,
  loadActiveTiers,
  loadMonthToDate,
  loadRide,
  resolveCaller,
} from "./db.ts";

// No driver app exists yet, so there is no origin to allowlist. Narrow this to the deployed
// driver-app origin when there is one — a completion endpoint has no reason to be callable from
// any page on the internet, even though a valid JWT is still required.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const fail = (message: string, status: number) => json({ error: message }, status);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return fail("Use POST.", 405);

  let rideId: string;
  try {
    const body = (await req.json()) as { rideId?: unknown };
    if (typeof body.rideId !== "string" || body.rideId.length === 0) {
      return fail('Body must be {"rideId": "<uuid>"}.', 400);
    }
    rideId = body.rideId;
  } catch {
    return fail("Body must be JSON.", 400);
  }

  try {
    const caller = await resolveCaller(req.headers.get("Authorization"));
    if (!caller) return fail("Not signed in as a driver.", 401);

    const ride = await loadRide(rideId);
    if (!ride) return fail(`No ride ${rideId}.`, 404);

    // Note what is NOT read from the request: the fare. It comes off our own `rides` row, which
    // no authenticated role can write to (supabase/CLAUDE.md: "never trust a fare_cents sent by
    // a client"). The request names a ride; it does not describe one.
    const decision = authorizeCompletion(ride, caller);
    if (!decision.allowed) {
      return fail(decision.message, decision.refusal === "ride_not_completable" ? 409 : 403);
    }

    // Fetched once: the tier set cannot change between retries of a single request in any way
    // that should alter this ride's rating.
    const tiers = await loadActiveTiers();

    let { yearMonth, grossFareCents } = await loadMonthToDate(ride.driverId);

    // Compare-and-swap, bounded. A conflict means a competing completion for this driver
    // committed while we were rating, and it hands back the fresh position — so the retry needs
    // no backoff and no extra round trip. See core.ts for why three attempts is enough.
    for (let attempt = 1; attempt <= MAX_RATING_ATTEMPTS; attempt++) {
      const rated = rateCompletion({ ride, mtdGrossCents: grossFareCents, yearMonth, tiers });
      const result = await applyRideCommission(rated);

      switch (result.outcome) {
        case "applied":
        case "already_completed":
          // ── The post-commit seam ──────────────────────────────────────────────────────────
          // Async follow-on work attaches here, e.g.:
          //     EdgeRuntime.waitUntil(emitRideCompleted(result));
          // Deliberately empty: ADR-0008 defers choosing an event transport until there is a
          // consumer, and `rides.completed_at` is already an indexed, ordered record of exactly
          // this event for anything that wants to read it.
          return json(
            {
              rideId: result.rideId,
              status: result.rideStatus,
              fareCents: result.fareCents,
              commissionRateBps: result.commissionRateBps,
              commissionCents: result.commissionCents,
              driverPayoutCents: result.driverPayoutCents,
              completedAt: result.completedAt,
              yearMonth: result.yearMonth,
              alreadyCompleted: result.outcome === "already_completed",
            },
            200,
          );

        case "conflict":
          yearMonth = result.yearMonth ?? yearMonth;
          grossFareCents = result.mtdGrossCents ?? grossFareCents;
          continue;

        case "not_found":
          return fail(`No ride ${rideId}.`, 404);

        case "not_completable":
          return fail(`Ride ${rideId} is '${result.rideStatus}' and cannot be completed.`, 409);

        default: {
          // An outcome the database knows about and this function doesn't. Refuse rather than
          // guess — every branch above either writes money or explains why it didn't.
          const unexpected: never = result.outcome;
          throw new Error(`complete-ride: unhandled outcome '${String(unexpected)}'`);
        }
      }
    }

    // Every attempt lost the race. Nothing was written, so a client retry is safe.
    return fail(
      `Ride ${rideId} could not be completed after ${MAX_RATING_ATTEMPTS} attempts — this driver has other completions landing concurrently. Retry.`,
      409,
    );
  } catch (cause) {
    // db.ts and core.ts both throw RIDO-shaped errors; a vendor error shape never reaches here.
    console.error("complete-ride failed", { rideId, cause });
    return fail("Could not complete the ride.", 500);
  }
});
